# 🔬 DebtLens — Technical Debt Intelligence Platform

> Paste any public Python GitHub repository URL. We'll scan every file for anti-patterns, measure cyclomatic complexity, compute a full Technical Debt Index — and let our Gemini AI agent analyze your worst files and suggest exactly how to fix them, in seconds.

---

## 📌 What is DebtLens?

DebtLens is an automated **Software Quality Analysis Tool** that detects anti-patterns, measures code complexity, and computes a **Technical Debt Index (TDI)** for any public Python GitHub repository. It combines static code analysis with a **Random Forest ML model** and **Gemini AI** to not just detect problems — but tell you how to fix them.

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, Flask |
| Code Analysis | Radon (Cyclomatic Complexity, LOC) |
| ML Model | Random Forest (scikit-learn) |
| AI Suggestions | Google Gemini API |
| Frontend | HTML, CSS, Vanilla JavaScript |
| Git Integration | GitPython |
| Duplicate Detection | Jaccard Similarity (k-gram shingles) |

---

## 📁 Project Structure

```
SE_PROJECT/
│
├── backend_engine/
│   ├── core/
│   │   ├── __init__.py               # Package marker
│   │   ├── analysis.py               # LOC, Complexity, Method count (Radon)
│   │   ├── detector.py               # Anti-pattern detection + Debt Score
│   │   ├── duplicate_detector.py     # Cross-file Jaccard similarity detection
│   │   └── git_utils.py              # GitHub repo cloning (GitPython)
│   │
│   ├── model/
│   │   ├── risk_random_forest_model_v3.joblib   # Trained ML model
│   │   └── label_encoder_v3.joblib              # Risk label encoder
│   │
│   ├── output/
│   │   └── analysis_report.json      # Generated analysis report
│   │
│   ├── static/
│   │   ├── index.html                # Frontend UI
│   │   ├── app.js                    # Frontend logic
│   │   └── style.css                 # Styling
│   │
│   ├── api.py                        # Flask REST API server
│   └── main.py                       # Analysis orchestrator
│
└── requirements.txt
```

---

## ⚙️ How It Works

```
User pastes GitHub URL
        ↓
git_utils.py  →  Clones repo (shallow, depth=1)
        ↓
analysis.py   →  Measures LOC, Cyclomatic Complexity, Method Count per file
        ↓
detector.py   →  Detects Anti-Patterns, calculates Debt Score per file
        ↓
duplicate_detector.py  →  Jaccard similarity cross-file duplicate detection
        ↓
main.py       →  Aggregates results, computes TDI, saves report.json
        ↓
api.py        →  Serves results to frontend via REST API
        ↓
Gemini AI     →  Analyzes top 10 worst files, generates improvement suggestions
        ↓
Frontend      →  Renders charts, table, ML prediction, AI suggestions
```

---

## 🧩 Anti-Patterns Detected

| Anti-Pattern | Rule | Debt Weight |
|---|---|---|
| Long Method / Large File | LOC > 200 | +2 |
| Large Class | Methods > 15 | +3 |
| God Class | LOC > 300 AND Methods > 20 | +5 |
| High Complexity | Cyclomatic Complexity > 10 | +4 |
| Duplicate Code | Jaccard Similarity > 15% | +3 |

> Thresholds based on Martin Fowler's *Refactoring* and McCabe's original 1976 Cyclomatic Complexity paper.

---

## 📊 Technical Debt Index (TDI)

```
TDI = (Total Debt Score / Total LOC) × 1000
```

| TDI Score | Risk Level |
|---|---|
| 0 – 5 | 🟢 Low |
| 5 – 15 | 🟡 Moderate |
| 15+ | 🔴 High |

---

## 🤖 ML Risk Prediction

A **Random Forest Classifier (v3)** predicts overall project risk using 5 features:

| Feature | Description |
|---|---|
| LOC | Total Lines of Code |
| Complexity | Max Cyclomatic Complexity |
| DuplicationPercent | % of duplicate files |
| AntiPatterns | Total anti-pattern count |
| TDS | Total Debt Score |

**Output:** `Low` / `Medium` / `High` / `Critical` with confidence %

---

## 💡 AI Improvement Suggestions

After analysis, the **Gemini AI agent** reviews the top 10 highest-debt files and returns:
- Specific, actionable refactoring suggestions per file
- Priority level (High / Medium / Low)
- Exact anti-patterns to address

---

## 🚀 Installation & Setup

### 1. Clone the project
```bash
git clone https://github.com/passionate-coder26/DebtLens---Anti-Pattern-Detector-Technical-Debt-Intelligence.git
cd DebtLens---Anti-Pattern-Detector-Technical-Debt-Intelligence/backend_engine
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Set Gemini API Key
```bash
# Windows
set GEMINI_API_KEY=your_gemini_api_key_here

# Mac/Linux
export GEMINI_API_KEY=your_gemini_api_key_here
```
> Get your free API key at [aistudio.google.com](https://aistudio.google.com)

### 4. Run the server
```bash
python api.py
```

### 5. Open in browser
```
http://127.0.0.1:5000
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves the frontend |
| `POST` | `/api/analyze` | Triggers analysis on a GitHub repo |
| `GET` | `/api/status` | Returns current analysis status |
| `GET` | `/api/report` | Returns the full analysis report |
| `GET` | `/api/predict` | Returns ML risk prediction |
| `GET` | `/api/suggestions` | Returns Gemini AI improvement suggestions |
| `POST` | `/api/cancel` | Cancels a running analysis |

---

## 📦 Requirements

```
flask
flask-cors
gitpython
radon
joblib
pandas
numpy
scikit-learn
google-generativeai
```

---

## 📝 Example Analysis

**Test Repository:** `https://github.com/psf/requests`

| Metric | Value |
|---|---|
| Files Analyzed | 15 |
| Total LOC | ~3,500 |
| Total Debt Score | 142 |
| Normalized TDI | 9.47 |
| ML Prediction | Critical (47.9% confidence) |

---

## ⚠️ Limitations

- Only supports **public Python repositories**
- Capped at **300 files** per analysis for performance
- Duplicate detection skipped for repos with **more than 150 files** (O(n²) complexity)
- Analysis timeout set to **3 minutes**

---

## 👨‍💻 Built With

- [Radon](https://radon.readthedocs.io/) — Python code metrics
- [Flask](https://flask.palletsprojects.com/) — Backend framework
- [GitPython](https://gitpython.readthedocs.io/) — Git repository cloning
- [scikit-learn](https://scikit-learn.org/) — Random Forest ML model
- [Google Gemini](https://aistudio.google.com/) — AI improvement suggestions

---

## 📄 License

This project was developed as part of a Software Engineering academic project.
