/* ─────────────────────────────────────────────────────────────────────────
   DebtLens · app.js
   Handles: analysis trigger, polling, data rendering (bars, scatter, table)
───────────────────────────────────────────────────────────────────────── */

// ── Constants ──────────────────────────────────────────────────────────────
const PATTERN_META = {
  "God Class":                { color: "#ef4444", cls: "tag-god"     },
  "Large Class":              { color: "#fb923c", cls: "tag-large"   },
  "Long Method / Large File": { color: "#f59e0b", cls: "tag-long"    },
  "High Complexity":          { color: "#a78bfa", cls: "tag-complex" },
  "Duplicate Code":           { color: "#2dd4bf", cls: "tag-dup"     },
};

// ── DOM refs (resolved after DOMContentLoaded) ─────────────────────────────
let $url, $btn, $cancelBtn, $statusBar, $statusText, $errorBar, $errorText;

document.addEventListener("DOMContentLoaded", () => {
  $url        = document.getElementById("repo-url");
  $btn        = document.getElementById("analyze-btn");
  $cancelBtn  = document.getElementById("cancel-btn");
  $statusBar  = document.getElementById("status-bar");
  $statusText = document.getElementById("status-text");
  $errorBar   = document.getElementById("error-bar");
  $errorText  = document.getElementById("error-text");

  // Allow pressing Enter in the input field
  $url.addEventListener("keydown", (e) => {
    if (e.key === "Enter") triggerAnalysis();
  });

  // Cancel button
  if ($cancelBtn) {
    $cancelBtn.addEventListener("click", async () => {
      await fetch("/api/cancel", { method: "POST" });
      setLoading(false);
      showError("Analysis cancelled. You can start a new one.");
    });
  }

  // Auto-load existing report so page isn't blank on refresh
  tryLoadExistingReport();
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Trigger analysis
// ─────────────────────────────────────────────────────────────────────────────
async function triggerAnalysis() {
  const url = $url.value.trim();
  if (!url) { showError("Please enter a GitHub repository URL."); return; }

  hideError();
  setLoading(true, "Cloning repository…");

  try {
    const res = await fetch("/api/analyze", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ repo_url: url }),
    });

    if (res.status === 409) {
      showError("An analysis is already running. Please wait.");
      setLoading(false);
      return;
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      showError(j.error || "Server error. Check that the backend is running.");
      setLoading(false);
      return;
    }

    // Analysis started — begin polling
    pollStatus();

  } catch (err) {
    showError("Cannot reach the backend server. Is api.py running?");
    setLoading(false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Poll /api/status until done
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_MESSAGES = [
  "Cloning repository…",
  "Reading Python files…",
  "Calculating cyclomatic complexity…",
  "Detecting anti-patterns…",
  "Scanning for duplicate code across files…",
  "Computing Technical Debt Index…",
  "Finalising report…",
];

function pollStatus() {
  let msgIdx = 0;
  const msgInterval = setInterval(() => {
    msgIdx = (msgIdx + 1) % STATUS_MESSAGES.length;
    $statusText.textContent = STATUS_MESSAGES[msgIdx];
  }, 3000);

  const poll = setInterval(async () => {
    try {
      const res  = await fetch("/api/status");
      const data = await res.json();

      if (data.error) {
        clearInterval(poll); clearInterval(msgInterval);
        showError("Analysis failed: " + data.error.split("\n")[0]);
        setLoading(false);
        return;
      }

      if (!data.running) {
        clearInterval(poll); clearInterval(msgInterval);
        loadAndRenderReport();
      }
    } catch {
      // network hiccup — keep polling
    }
  }, 2000);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Load report and render
// ─────────────────────────────────────────────────────────────────────────────
async function tryLoadExistingReport() {
  try {
    const res = await fetch("/api/report");
    if (res.ok) renderReport(await res.json());
  } catch { /* server might not be ready yet */ }
}

async function loadAndRenderReport() {
  try {
    const res = await fetch("/api/report");
    if (!res.ok) { showError("Analysis done but report could not be read."); setLoading(false); return; }
    renderReport(await res.json());
  } catch {
    showError("Failed to load report from server.");
    setLoading(false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function renderReport(data) {
  setLoading(false);

  // Show results section and reveal nav link
  const $results = document.getElementById("results");
  $results.style.display = "block";
  document.getElementById("nav-results").style.display = "inline";

  // Smooth scroll to results
  setTimeout(() => $results.scrollIntoView({ behavior: "smooth" }), 80);

  // Project URL
  const $repoUrl = document.getElementById("res-url");
  $repoUrl.href        = data.project_url;
  $repoUrl.textContent = data.project_url;

  // TDI badge
  renderTdiBadge(data.normalized_tdi);

  // KPI cards
  animateNumber("val-loc",   data.total_loc,        0, 1200);
  animateNumber("val-debt",  data.total_debt_score,  0, 900);
  animateNumber("val-tdi",   data.normalized_tdi,    2, 900);
  animateNumber("val-files", data.files_analyzed,    0, 600);

  // Charts
  renderPatternBars(data.file_details);
  renderDebtBars(data.file_details);
  renderScatter(data.file_details);

  // Table
  renderTable(data.file_details);

  // ML Prediction
  loadMLPrediction();
}

// TDI badge
function renderTdiBadge(tdi) {
  const $b = document.getElementById("tdi-badge");
  if (tdi < 5)       { $b.className = "tdi-badge tdi-low";  $b.textContent = "🟢 Low TDI · " + tdi; }
  else if (tdi < 15) { $b.className = "tdi-badge tdi-mid";  $b.textContent = "🟡 Moderate TDI · " + tdi; }
  else               { $b.className = "tdi-badge tdi-high"; $b.textContent = "🔴 High TDI · " + tdi; }
}

// Animated number counter
function animateNumber(id, target, decimals, duration) {
  const el    = document.getElementById(id);
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const v = target * ease(p);
    el.textContent = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function ease(t) { return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }

// ── Pattern bar chart ──────────────────────────────────────────────────────
function renderPatternBars(files) {
  const counts = {};
  files.forEach(f => (f.issues || []).forEach(i => { counts[i] = (counts[i] || 0) + 1; }));
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max    = sorted[0]?.[1] || 1;

  const container = document.getElementById("pattern-bars");
  container.innerHTML = sorted.map(([label, count]) => {
    const meta  = PATTERN_META[label] || { color: "#60a5fa", cls: "tag-default" };
    const pct   = (count / max * 100).toFixed(1);
    return `
      <div class="bar-item">
        <div class="bar-label-row">
          <span class="bar-label">${label}</span>
          <span class="bar-count">${count} file${count !== 1 ? "s" : ""}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:0%;background:${meta.color}"
               data-target="${pct}"></div>
        </div>
      </div>`;
  }).join("");

  // Animate bars
  requestAnimationFrame(() => {
    container.querySelectorAll(".bar-fill").forEach(el => {
      el.style.transition = "width 1.1s cubic-bezier(.19,1,.22,1)";
      el.style.width = el.dataset.target + "%";
    });
  });
}

// ── Debt-by-file bar chart (top 10) ───────────────────────────────────────
function renderDebtBars(files) {
  const top10 = [...files].sort((a, b) => b.debt_score - a.debt_score).slice(0, 10);
  const max   = top10[0]?.debt_score || 1;

  const container = document.getElementById("debt-bars");
  container.innerHTML = top10.map(f => {
    const pct   = (f.debt_score / max * 100).toFixed(1);
    const color = f.debt_score >= 10 ? "#ef4444" : f.debt_score >= 5 ? "#f59e0b" : "#10b981";
    return `
      <div class="bar-item">
        <div class="bar-label-row">
          <span class="bar-label">${f.filename}</span>
          <span class="bar-count">${f.debt_score} pts</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:0%;background:${color}"
               data-target="${pct}"></div>
        </div>
      </div>`;
  }).join("");

  requestAnimationFrame(() => {
    container.querySelectorAll(".bar-fill").forEach(el => {
      el.style.transition = "width 1.1s cubic-bezier(.19,1,.22,1)";
      el.style.width = el.dataset.target + "%";
    });
  });
}

// ── Scatter plot (SVG) ─────────────────────────────────────────────────────
function renderScatter(files) {
  if (!files.length) return;

  const PAD = { top: 30, right: 30, bottom: 50, left: 60 };
  const W   = 900, H = 320;
  const IW  = W - PAD.left - PAD.right;
  const IH  = H - PAD.top  - PAD.bottom;

  const locs = files.map(f => f.metrics.loc);
  const ccs  = files.map(f => f.metrics.complexity);
  const maxLoc = Math.max(...locs) || 1;
  const maxCC  = Math.max(...ccs)  || 1;

  const scaleX = v => PAD.left + (v / maxLoc) * IW;
  const scaleY = v => PAD.top  + IH - (v / maxCC) * IH;

  const points = files.map(f => {
    const x  = scaleX(f.metrics.loc);
    const y  = scaleY(f.metrics.complexity);
    const r  = 5 + (f.debt_score / 14) * 14;
    const fill = f.debt_score >= 10 ? "#ef4444"
               : f.debt_score >= 5  ? "#f59e0b" : "#10b981";
    return `
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"
        fill="${fill}" fill-opacity="0.7" stroke="${fill}" stroke-width="1"
        class="scatter-dot">
        <title>${f.filename}\nLOC: ${f.metrics.loc} | CC: ${f.metrics.complexity} | Debt: ${f.debt_score}</title>
      </circle>`;
  }).join("");

  // Axis ticks
  const xTicks = [0, .25, .5, .75, 1].map(t => {
    const v = Math.round(t * maxLoc);
    const x = scaleX(v);
    return `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + IH}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4 4"/>
            <text x="${x}" y="${PAD.top + IH + 18}" text-anchor="middle" fill="#64748b" font-size="11">${v.toLocaleString()}</text>`;
  }).join("");

  const yTicks = [0, .25, .5, .75, 1].map(t => {
    const v = Math.round(t * maxCC);
    const y = scaleY(v);
    return `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + IW}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4 4"/>
            <text x="${PAD.left - 10}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="11">${v}</text>`;
  }).join("");

  const svg = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <style>.scatter-dot{transition:r .2s;cursor:default}.scatter-dot:hover{r:18;fill-opacity:1}</style>
      ${xTicks}${yTicks}
      ${points}
      <text x="${PAD.left + IW/2}" y="${H - 6}" text-anchor="middle" fill="#64748b" font-size="12">Lines of Code (LOC)</text>
      <text x="14" y="${PAD.top + IH/2}" text-anchor="middle" fill="#64748b" font-size="12"
            transform="rotate(-90,14,${PAD.top + IH/2})">Max Cyclomatic Complexity</text>
    </svg>`;

  document.getElementById("scatter-plot").innerHTML = svg;
}

// ── File table ─────────────────────────────────────────────────────────────
function renderTable(files) {
  const sorted = [...files].sort((a, b) => b.debt_score - a.debt_score);
  const tbody  = document.getElementById("file-table-body");

  tbody.innerHTML = sorted.map(f => {
    const m    = f.metrics;
    const dCls = f.debt_score >= 10 ? "debt-xhigh"
                : f.debt_score >= 5  ? "debt-high"
                : f.debt_score >= 3  ? "debt-mid" : "debt-low";

    const tags = (f.issues || []).map(i => {
      const meta = PATTERN_META[i] || { cls: "tag-default" };
      // For Duplicate Code, append similarity % to the tag label
      const label = (i === "Duplicate Code" && f.duplicate_similarity)
        ? `Duplicate Code (${f.duplicate_similarity}%)`
        : i;
      return `<span class="issue-tag ${meta.cls}">${label}</span>`;
    }).join("") || "<span style='color:#475569;font-size:0.78rem'>—</span>";

    // Build duplicate tooltip if applicable
    const dupTitle = (f.duplicate_of && f.duplicate_of.length)
      ? ` title="Shares ≥${f.duplicate_similarity}% code with: ${f.duplicate_of.join(', ')}"`
      : "";

    return `
      <tr>
        <td class="filename-cell"${dupTitle}>${f.filename}${
          f.duplicate_of?.length
            ? ` <span class="dup-indicator" title="Duplicate detected">⊕</span>`
            : ""
        }</td>
        <td class="num-cell">${m.loc.toLocaleString()}</td>
        <td class="num-cell">${m.complexity}</td>
        <td class="num-cell">${m.methods}</td>
        <td><span class="debt-pill ${dCls}">${f.debt_score}</span></td>
        <td><div class="issue-tags">${tags}</div></td>
      </tr>`;
  }).join("");
}

// ── ML Prediction integration ───────────────────────────────────────────────
async function loadMLPrediction() {
  const $mlResult = document.getElementById("ml-result");
  $mlResult.innerHTML = `<p style="color: #64748b; font-size: 0.95rem;">Loading ML prediction...</p>`;
  
  try {
    const res = await fetch("/api/predict");
    const data = await res.json();
    
    if (res.ok && data.risk_label) {
      let color = "#10b981"; // Low Risk
      if (data.risk_label.toLowerCase().includes("high") || data.risk_label.toLowerCase().includes("critical")) color = "#ef4444";
      else if (data.risk_label.toLowerCase().includes("medium") || data.risk_label.toLowerCase().includes("moderate")) color = "#f59e0b";
      
      const confPct = (data.confidence * 100).toFixed(1);
      
      $mlResult.innerHTML = `
        <div style="background: rgba(0,0,0,0.2); border-left: 4px solid ${color}; padding: 1.25rem 1.5rem; border-radius: 0 8px 8px 0; display: flex; flex-direction: column; gap: 0.5rem; animation: fade-in 0.5s ease-out;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 600;">Predicted Risk</span>
            <span style="font-size: 0.85rem; color: #64748b; font-weight: 500;">Confidence: ${confPct}%</span>
          </div>
          <div style="font-size: 1.5rem; font-weight: 800; color: ${color}; letter-spacing: -0.02em;">
            ${data.risk_label}
          </div>
          <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; margin-top: 0.25rem; overflow: hidden;">
            <div style="height: 100%; width: ${confPct}%; background: ${color}; border-radius: 2px; transition: width 1s ease-out;"></div>
          </div>
        </div>
      `;
    } else {
      $mlResult.innerHTML = `<p style="color: #ef4444;">ML Prediction failed: ${data.error || "Unknown error"}</p>`;
    }
  } catch (err) {
    $mlResult.innerHTML = `<p style="color: #64748b;">Could not reach ML endpoint.</p>`;
  }
}

// ── AI Improvement Suggestions ─────────────────────────────────────────────
async function loadSuggestions() {
  const $result  = document.getElementById("ai-suggestions-result");
  const $btn     = document.getElementById("ai-suggest-btn");
  const $btnIcon = document.getElementById("ai-btn-icon");
  const $btnLbl  = document.getElementById("ai-btn-label");

  // Disable button & show loading state
  $btn.disabled       = true;
  $btn.style.opacity  = "0.6";
  $btnIcon.textContent = "⏳";
  $btnLbl.textContent  = "Generating…";

  $result.innerHTML = `
    <div style="
      display:flex; align-items:center; gap:0.75rem;
      padding:1.25rem; background:rgba(99,102,241,0.08);
      border-radius:8px; border:1px solid rgba(99,102,241,0.2);
      color:#94a3b8; font-size:0.9rem; animation:fade-in 0.3s ease-out;
    ">
      <div class="status-spinner" style="flex-shrink:0;"></div>
      <span>Sending to Gemini 2.5 Flash — this may take a few seconds…</span>
    </div>`;

  try {
    const res  = await fetch("/api/suggestions");
    const data = await res.json();

    if (!res.ok || data.error) {
      $result.innerHTML = `
        <div style="padding:1rem; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25);
                    border-radius:8px; color:#f87171; font-size:0.88rem;">
          ⚠️ ${data.error || "Failed to fetch suggestions."}
        </div>`;
      return;
    }

    if (!data.suggestions || data.suggestions.length === 0) {
      $result.innerHTML = `
        <div style="padding:1rem; color:#64748b; font-size:0.9rem;">
          ${data.message || "No suggestions returned."}
        </div>`;
      return;
    }

    const PRIORITY_STYLES = {
      "High":   { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)",  text: "#ef4444", label: "🔴 High"   },
      "Medium": { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", text: "#f59e0b", label: "🟡 Medium" },
      "Low":    { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)", text: "#10b981", label: "🟢 Low"    },
    };

    const cards = data.suggestions.map((item) => {
      const p     = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES["Low"];
      const items = (item.suggestions || [])
        .map(s => `<li style="margin:0.35rem 0; color:#cbd5e1; font-size:0.88rem; line-height:1.5;">${s}</li>`)
        .join("");

      return `
        <div style="
          background: rgba(0,0,0,0.2);
          border: 1px solid rgba(255,255,255,0.06);
          border-left: 4px solid ${p.text};
          border-radius: 0 8px 8px 0;
          padding: 1rem 1.25rem;
          animation: fade-in 0.4s ease-out;
        ">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.6rem; flex-wrap:wrap; gap:0.5rem;">
            <span style="
              font-family:'JetBrains Mono',monospace;
              font-size:0.82rem; font-weight:600;
              color:#e2e8f0; word-break:break-all;
            ">${item.filename}</span>
            <span style="
              background:${p.bg}; border:1px solid ${p.border};
              color:${p.text}; font-size:0.75rem; font-weight:700;
              padding:0.2rem 0.65rem; border-radius:999px;
              letter-spacing:0.04em; white-space:nowrap;
            ">${p.label}</span>
          </div>
          <ul style="margin:0; padding-left:1.25rem;">${items}</ul>
        </div>`;
    }).join("");

    $result.innerHTML = `<div style="display:flex; flex-direction:column; gap:0.85rem;">${cards}</div>`;

  } catch (err) {
    $result.innerHTML = `
      <div style="padding:1rem; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25);
                  border-radius:8px; color:#f87171; font-size:0.88rem;">
        ⚠️ Could not reach the suggestions endpoint. Is the backend running?
      </div>`;
  } finally {
    // Re-enable button
    $btn.disabled       = false;
    $btn.style.opacity  = "1";
    $btnIcon.textContent = "✨";
    $btnLbl.textContent  = "Regenerate Suggestions";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function setLoading(on, msg = "") {
  $btn.disabled        = on;
  $statusBar.style.display = on ? "flex" : "none";
  if ($cancelBtn) $cancelBtn.style.display = on ? "inline-block" : "none";
  if (msg) $statusText.textContent = msg;
}

function showError(msg) {
  $errorText.textContent  = msg;
  $errorBar.style.display = "flex";
}

function hideError() {
  $errorBar.style.display = "none";
}
