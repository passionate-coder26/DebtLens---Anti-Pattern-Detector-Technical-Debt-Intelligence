import os
import json
import sys
import threading
import traceback
import joblib
import pandas as pd
import numpy as np
import google.genai as genai
from dotenv import load_dotenv

# Load .env file from the same directory
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# Make sure local core/ imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from main import start_analysis  

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR  = os.path.join(BASE_DIR, "static")
REPORT_PATH = os.path.join(BASE_DIR, "output", "analysis_report.json")

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")
CORS(app)

# Track analysis state
_analysis_state = {"running": False, "error": None}

# Load ML Models once on startup
MODEL_PATH = os.path.join(BASE_DIR, "model", "risk_random_forest_model_v3.joblib")
ENCODER_PATH = os.path.join(BASE_DIR, "model", "label_encoder_v3.joblib")
ml_model = None
ml_encoder = None

try:
    if os.path.exists(MODEL_PATH) and os.path.exists(ENCODER_PATH):
        ml_model = joblib.load(MODEL_PATH)
        ml_encoder = joblib.load(ENCODER_PATH)
        print("✅ ML Models loaded successfully!")
    else:
        print("⚠️ ML Models not found in backend_engine/model/")
except Exception as e:
    print(f"⚠️ Error loading ML models: {e}")


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/api/report")
def get_report():
    if not os.path.exists(REPORT_PATH):
        return jsonify({"error": "No report found. Run an analysis first."}), 404
    with open(REPORT_PATH, "r", encoding="utf-8") as f:
        return jsonify(json.load(f))


@app.route("/api/analyze", methods=["POST"])
def analyze():
    global _analysis_state
    if _analysis_state["running"]:
        return jsonify({"error": "Analysis already in progress."}), 409

    data = request.get_json(silent=True) or {}
    repo_url = data.get("repo_url", "").strip()
    if not repo_url:
        return jsonify({"error": "repo_url is required."}), 400

    _analysis_state = {"running": True, "error": None}

    def run():
        global _analysis_state
        try:
            start_analysis(repo_url)
            _analysis_state["running"] = False
        except Exception:
            _analysis_state["running"] = False
            _analysis_state["error"] = traceback.format_exc()

    t = threading.Thread(target=run, daemon=True)
    t.start()

    # Auto-reset after 5 minutes to prevent infinite hangs
    def timeout_guard():
        t.join(timeout=300)
        if _analysis_state["running"]:
            print("Analysis timed out after 5 minutes — resetting.")
            _analysis_state["running"] = False
            _analysis_state["error"] = "Analysis timed out (5 min). Try a smaller repository."

    threading.Thread(target=timeout_guard, daemon=True).start()

    return jsonify({"status": "started"}), 202


@app.route("/api/status")
def status():
    return jsonify({
        "running": _analysis_state["running"],
        "error":   _analysis_state["error"],
    })


@app.route("/api/cancel", methods=["POST"])
def cancel():
    global _analysis_state
    _analysis_state = {"running": False, "error": None}
    return jsonify({"status": "cancelled"})


@app.route("/api/predict")
def predict_risk():
    if not ml_model or not ml_encoder:
        return jsonify({"error": "ML model not loaded."}), 503
    
    if not os.path.exists(REPORT_PATH):
        return jsonify({"error": "No report found. Run analysis first."}), 404
        
    try:
        with open(REPORT_PATH, "r", encoding="utf-8") as f:
            report = json.load(f)
            
        loc = report.get("total_loc", 0)
        tds = report.get("total_debt_score", 0)
        
        max_cc = 0
        anti_patterns = 0
        duplicate_files = 0
        total_files = max(1, len(report.get("file_details", [])))
        
        for fd in report.get("file_details", []):
            m = fd.get("metrics", {})
            max_cc = max(max_cc, m.get("complexity", 0))
            anti_patterns += len(fd.get("issues", []))
            if "Duplicate Code" in fd.get("issues", []):
                duplicate_files += 1
                
        duplication_percent = (duplicate_files / total_files) * 100
        
        sample = pd.DataFrame(
            [[loc, max_cc, duplication_percent, anti_patterns, tds]],
            columns=["LOC", "Complexity", "DuplicationPercent", "AntiPatterns", "TDS"]
        )
        
        sample["Complexity_bin"] = pd.cut(sample["Complexity"], bins=[-1, 10, 20, 30, 50, 9999], labels=False)
        sample["TDS_bin"] = pd.cut(sample["TDS"], bins=[-1, 20, 50, 100, 200, 99999], labels=False)
        sample = sample.fillna(0)
        
        prediction = ml_model.predict(sample)
        predicted_label = ml_encoder.inverse_transform(prediction)
        
        try:
            probs = ml_model.predict_proba(sample)[0]
            confidence = float(max(probs))
        except Exception:
            confidence = 1.0
            
        return jsonify({
            "risk_label": str(predicted_label[0]),
            "confidence": confidence
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/suggestions")
def get_suggestions():
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not gemini_api_key:
        return jsonify({"error": "GEMINI_API_KEY environment variable is not set."}), 503

    if not os.path.exists(REPORT_PATH):
        return jsonify({"error": "No report found. Run an analysis first."}), 404

    try:
        with open(REPORT_PATH, "r", encoding="utf-8") as f:
            report = json.load(f)

        # Pick top-10 worst files that actually have issues
        files_with_issues = [
            fd for fd in report.get("file_details", [])
            if fd.get("issues") and len(fd["issues"]) > 0
        ]
        top10 = sorted(files_with_issues, key=lambda x: x.get("debt_score", 0), reverse=True)[:10]

        if not top10:
            return jsonify({"suggestions": [], "message": "No files with issues found in the report."})

        # Build a compact summary for the prompt
        files_summary = []
        for fd in top10:
            files_summary.append({
                "filename": fd.get("filename"),
                "debt_score": fd.get("debt_score"),
                "issues": fd.get("issues", []),
                "metrics": {
                    "loc": fd.get("metrics", {}).get("loc", 0),
                    "complexity": fd.get("metrics", {}).get("complexity", 0),
                    "methods": fd.get("metrics", {}).get("methods", 0),
                },
            })

        prompt = f"""
You are a senior Python software engineer performing a code quality review.
Below are the top files from a technical debt analysis report (worst files first).

For each file, provide specific, actionable improvement suggestions.

Files to review (JSON):
{json.dumps(files_summary, indent=2)}

Return ONLY a valid JSON array (no markdown, no extra text) with this exact structure:
[
  {{
    "filename": "<filename>",
    "priority": "High" | "Medium" | "Low",
    "suggestions": [
      "<specific actionable suggestion 1>",
      "<specific actionable suggestion 2>",
      "<specific actionable suggestion 3>"
    ]
  }}
]

Rules:
- Priority = High if debt_score >= 10, Medium if >= 5, Low otherwise.
- Give 3-5 concrete, code-specific suggestions per file (not generic advice).
- Reference the actual issues detected (e.g. God Class, High Complexity, Duplicate Code).
- Be concise and actionable.
"""

        client = genai.Client(api_key=gemini_api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )

        raw_text = response.text.strip()
        # Strip possible markdown code fences
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[-1]
        if raw_text.endswith("```"):
            raw_text = raw_text.rsplit("```", 1)[0]

        suggestions = json.loads(raw_text.strip())
        return jsonify({"suggestions": suggestions})

    except json.JSONDecodeError as e:
        return jsonify({"error": f"Gemini returned non-JSON response: {str(e)}"}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    os.makedirs(os.path.join(BASE_DIR, "output"), exist_ok=True)
    app.run(debug=True, port=5000, use_reloader=False)
