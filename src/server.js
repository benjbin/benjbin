require("dotenv").config();

const path = require("path");
const express = require("express");
const {
  openDb,
  extractVerdict,
  insertAnalysis,
  listAnalyses,
  getAnalysis,
  updateHumanReview,
} = require("./db");
const { runPipeline } = require("./pipeline");

const DRY_RUN =
  process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";
const PORT = Number(process.env.PORT || 3000);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-6-astra";

if (!WEBHOOK_SECRET || WEBHOOK_SECRET === "change-me-to-a-long-random-string") {
  console.warn(
    "[warn] Set WEBHOOK_SECRET in .env to a strong random value before exposing the webhook."
  );
}

const db = openDb();
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

function getProvidedSecret(req) {
  return (
    req.get("x-webhook-secret") ||
    req.get("X-Webhook-Secret") ||
    (req.body && req.body.secret) ||
    ""
  );
}

function normalizeAlert(body) {
  const ticker = body.ticker || body.symbol || null;
  const exchange = body.exchange || null;
  const close =
    body.close != null
      ? Number(body.close)
      : body.price != null
        ? Number(body.price)
        : null;
  const volume = body.volume != null ? Number(body.volume) : null;
  const interval = body.interval || body.timeframe || null;
  const timenow = body.timenow || body.time || body.timestamp || null;

  return {
    ticker,
    exchange,
    close: Number.isFinite(close) ? close : null,
    volume: Number.isFinite(volume) ? volume : null,
    interval,
    timenow,
    raw: body,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    dryRun: DRY_RUN,
    model: OPENAI_MODEL,
    banner: "Research only — no trades are executed.",
  });
});

app.post("/webhook", async (req, res) => {
  try {
    if (!WEBHOOK_SECRET) {
      return res.status(500).json({
        error: "Server misconfigured: WEBHOOK_SECRET is not set",
      });
    }
    const provided = getProvidedSecret(req);
    if (provided !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Invalid webhook secret" });
    }

    const alert = normalizeAlert(req.body || {});
    const outputs = await runPipeline({
      alert,
      model: OPENAI_MODEL,
      dryRun: DRY_RUN,
      apiKey: process.env.OPENAI_API_KEY,
    });

    const riskVerdict = extractVerdict(outputs.riskOutput);
    const id = insertAnalysis(db, {
      created_at: new Date().toISOString(),
      model: DRY_RUN ? `${OPENAI_MODEL} (dry-run)` : OPENAI_MODEL,
      dry_run: DRY_RUN ? 1 : 0,
      ticker: alert.ticker,
      exchange: alert.exchange,
      close: alert.close,
      volume: alert.volume,
      interval: alert.interval,
      timenow: alert.timenow,
      alert_json: JSON.stringify(alert),
      scanner_output: outputs.scannerOutput,
      technical_output: outputs.technicalOutput,
      research_output: outputs.researchOutput,
      risk_output: outputs.riskOutput,
      risk_verdict: riskVerdict,
    });

    res.status(201).json({
      id,
      ticker: alert.ticker,
      risk_verdict: riskVerdict,
      dry_run: DRY_RUN,
      message:
        "Analysis saved for human review. No trade was executed or sent to any exchange.",
    });
  } catch (err) {
    console.error("[webhook]", err);
    res.status(500).json({
      error: err.message || "Pipeline failed",
    });
  }
});

app.get("/api/analyses", (_req, res) => {
  res.json({ analyses: listAnalyses(db) });
});

app.get("/api/analyses/:id", (req, res) => {
  const row = getAnalysis(db, Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ analysis: row });
});

app.post("/api/analyses/:id/review", (req, res) => {
  const id = Number(req.params.id);
  const row = getAnalysis(db, id);
  if (!row) return res.status(404).json({ error: "Not found" });

  const decision = (req.body && req.body.decision) || "";
  const notes = (req.body && req.body.notes) || "";
  const allowed = new Set([
    "no action",
    "more research",
    "my own decision, my responsibility",
  ]);
  if (!allowed.has(decision)) {
    return res.status(400).json({
      error:
        'decision must be one of: "no action", "more research", "my own decision, my responsibility"',
    });
  }

  updateHumanReview(db, id, decision, notes);
  res.json({ ok: true, analysis: getAnalysis(db, id) });
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path === "/webhook") return next();
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Crypto Research Dashboard listening on http://localhost:${PORT}`);
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN (model stubbed)" : "LIVE OpenAI API"}`);
  console.log("Research only — no trades are executed.");
});
