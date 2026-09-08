const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "analyses.db");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function openDb() {
  ensureDataDir();
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      model TEXT NOT NULL,
      dry_run INTEGER NOT NULL DEFAULT 0,
      ticker TEXT,
      exchange TEXT,
      close REAL,
      volume REAL,
      interval TEXT,
      timenow TEXT,
      alert_json TEXT NOT NULL,
      scanner_output TEXT,
      technical_output TEXT,
      research_output TEXT,
      risk_output TEXT,
      risk_verdict TEXT,
      human_decision TEXT,
      human_notes TEXT,
      human_reviewed_at TEXT
    );
  `);
  return db;
}

function extractVerdict(riskOutput) {
  if (!riskOutput) return "UNKNOWN";
  const upper = riskOutput.toUpperCase();
  if (upper.includes("CONTINUE TO PLAN")) return "CONTINUE TO PLAN";
  if (upper.includes("NEEDS MORE RESEARCH")) return "NEEDS MORE RESEARCH";
  if (/(^|\n)\s*REJECT\b/.test(upper) || upper.includes("VERDICT: REJECT")) {
    return "REJECT";
  }
  // Prefer first explicit verdict-like line
  const lines = riskOutput.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim().toUpperCase();
    if (t === "REJECT" || t.startsWith("REJECT ")) return "REJECT";
    if (t.startsWith("NEEDS MORE RESEARCH")) return "NEEDS MORE RESEARCH";
    if (t.startsWith("CONTINUE TO PLAN")) return "CONTINUE TO PLAN";
  }
  return "UNKNOWN";
}

function insertAnalysis(db, row) {
  const stmt = db.prepare(`
    INSERT INTO analyses (
      created_at, model, dry_run, ticker, exchange, close, volume, interval, timenow,
      alert_json, scanner_output, technical_output, research_output, risk_output, risk_verdict
    ) VALUES (
      @created_at, @model, @dry_run, @ticker, @exchange, @close, @volume, @interval, @timenow,
      @alert_json, @scanner_output, @technical_output, @research_output, @risk_output, @risk_verdict
    )
  `);
  const info = stmt.run(row);
  return info.lastInsertRowid;
}

function listAnalyses(db) {
  return db
    .prepare(
      `SELECT id, created_at, model, dry_run, ticker, exchange, close, volume, interval, timenow,
              risk_verdict, human_decision, human_reviewed_at
       FROM analyses
       ORDER BY id DESC`
    )
    .all();
}

function getAnalysis(db, id) {
  return db.prepare(`SELECT * FROM analyses WHERE id = ?`).get(id);
}

function updateHumanReview(db, id, decision, notes) {
  const stmt = db.prepare(`
    UPDATE analyses
    SET human_decision = @decision,
        human_notes = @notes,
        human_reviewed_at = @reviewed_at
    WHERE id = @id
  `);
  return stmt.run({
    id,
    decision,
    notes: notes || null,
    reviewed_at: new Date().toISOString(),
  });
}

module.exports = {
  openDb,
  extractVerdict,
  insertAnalysis,
  listAnalyses,
  getAnalysis,
  updateHumanReview,
  DB_PATH,
};
