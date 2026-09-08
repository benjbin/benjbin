const listEl = document.getElementById("analysisList");
const emptyListEl = document.getElementById("emptyList");
const detailEmpty = document.getElementById("detailEmpty");
const detailContent = document.getElementById("detailContent");
const healthMeta = document.getElementById("healthMeta");

let selectedId = null;
let analyses = [];

function verdictClass(v) {
  if (v === "REJECT") return "reject";
  if (v === "NEEDS MORE RESEARCH") return "needs";
  if (v === "CONTINUE TO PLAN") return "continue";
  return "";
}

async function loadHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    healthMeta.textContent = `mode: ${data.dryRun ? "dry-run" : "live"}\nmodel: ${data.model}`;
  } catch {
    healthMeta.textContent = "health: unavailable";
  }
}

async function loadList() {
  const res = await fetch("/api/analyses");
  const data = await res.json();
  analyses = data.analyses || [];
  renderList();
  if (selectedId) {
    const still = analyses.find((a) => a.id === selectedId);
    if (still) await selectAnalysis(selectedId);
    else {
      selectedId = null;
      detailContent.classList.add("hidden");
      detailEmpty.classList.remove("hidden");
    }
  }
}

function renderList() {
  listEl.innerHTML = "";
  emptyListEl.classList.toggle("hidden", analyses.length > 0);

  for (const a of analyses) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    if (a.id === selectedId) btn.classList.add("active");
    btn.innerHTML = `
      <div class="item-title">
        <span>#${a.id} · ${a.ticker || "—"}</span>
        <span class="badge ${verdictClass(a.risk_verdict)}">${a.risk_verdict || "—"}</span>
      </div>
      <div class="item-sub">${a.created_at || ""}${a.dry_run ? " · dry-run" : ""}${
        a.human_decision ? " · reviewed" : ""
      }</div>
    `;
    btn.addEventListener("click", () => selectAnalysis(a.id));
    li.appendChild(btn);
    listEl.appendChild(li);
  }
}

async function selectAnalysis(id) {
  selectedId = id;
  renderList();
  const res = await fetch(`/api/analyses/${id}`);
  if (!res.ok) return;
  const { analysis } = await res.json();

  detailEmpty.classList.add("hidden");
  detailContent.classList.remove("hidden");

  document.getElementById("detailTitle").textContent = `${
    analysis.ticker || "Unknown"
  } · ${analysis.exchange || "venue n/a"}`;
  document.getElementById("detailSub").textContent = `${analysis.created_at} · model ${
    analysis.model
  }`;

  const badge = document.getElementById("verdictBadge");
  badge.textContent = analysis.risk_verdict || "UNKNOWN";
  badge.className = `badge ${verdictClass(analysis.risk_verdict)}`;

  const meta = document.getElementById("alertMeta");
  meta.innerHTML = [
    ["close", analysis.close],
    ["volume", analysis.volume],
    ["interval", analysis.interval],
    ["timenow", analysis.timenow],
  ]
    .map(
      ([k, v]) =>
        `<div><span>${k}</span>${v == null || v === "" ? "NOT PROVIDED" : v}</div>`
    )
    .join("");

  document.getElementById("outScanner").textContent =
    analysis.scanner_output || "";
  document.getElementById("outTechnical").textContent =
    analysis.technical_output || "";
  document.getElementById("outResearch").textContent =
    analysis.research_output || "";
  document.getElementById("outRisk").textContent = analysis.risk_output || "";

  const select = document.getElementById("decisionSelect");
  const notes = document.getElementById("notesInput");
  select.value = analysis.human_decision || "no action";
  notes.value = analysis.human_notes || "";
  document.getElementById("reviewStatus").textContent = analysis.human_reviewed_at
    ? `Last saved: ${analysis.human_reviewed_at}`
    : "Not reviewed yet.";
}

async function saveReview() {
  if (!selectedId) return;
  const decision = document.getElementById("decisionSelect").value;
  const notes = document.getElementById("notesInput").value;
  const status = document.getElementById("reviewStatus");
  status.textContent = "Saving…";
  const res = await fetch(`/api/analyses/${selectedId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, notes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    status.textContent = err.error || "Save failed";
    return;
  }
  status.textContent = "Saved for your records.";
  await loadList();
}

document.getElementById("refreshBtn").addEventListener("click", loadList);
document.getElementById("saveReviewBtn").addEventListener("click", saveReview);

loadHealth();
loadList();
