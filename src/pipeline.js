const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const PROMPTS_DIR = path.join(__dirname, "..", "prompts");

const SYSTEM_RULES = `You are part of an AI Crypto Research Desk. Permanent rules:
1. Use only data provided in the user message. Never invent prices, volumes, indicators, on-chain metrics, headlines, sentiment scores, backtests, win rates, or returns. Missing = "NOT PROVIDED — verify manually".
2. Label FACT vs VIEW. End with CONFIDENCE: Low / Medium / High.
3. You cannot execute trades, connect to an exchange, hold keys, or move funds. Never give buy/sell instructions or promise profit.
4. Educational research only. Not investment advice. A human reviews everything.`;

function loadPrompt(name) {
  const file = path.join(PROMPTS_DIR, `${name}.md`);
  return fs.readFileSync(file, "utf8");
}

function fillTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key)
      ? String(vars[key] ?? "")
      : `{{${key}}}`;
  });
}

function dryRunStub(role, alert) {
  const ticker = alert.ticker || "UNKNOWN";
  const close = alert.close != null ? String(alert.close) : "NOT PROVIDED";
  const volume = alert.volume != null ? String(alert.volume) : "NOT PROVIDED";
  const stubs = {
    scanner: `DRY-RUN SCANNER OUTPUT
ASSET: ${ticker}
FACT: close=${close}, volume=${volume}, interval=${alert.interval || "NOT PROVIDED"}, timenow=${alert.timenow || "NOT PROVIDED"}, exchange=${alert.exchange || "NOT PROVIDED"}
VIEW: Ranked for further research only based on the alert fields above — not a market scan.
WHAT IS MISSING: full price table, 24h/7d change, chart history — NOT PROVIDED — verify manually
TOP CANDIDATE FOR RESEARCH: ${ticker}
CONFIDENCE: Low`,
    technical: `DRY-RUN TECHNICAL OUTPUT for ${ticker}
TREND — FACT: only interval "${alert.interval || "NOT PROVIDED"}" supplied; multi-timeframe agreement NOT PROVIDED
SUPPORT — NOT PROVIDED — verify manually
RESISTANCE — NOT PROVIDED — verify manually
VOLUME — FACT: alert volume field = ${volume}
MOMENTUM — NOT PROVIDED
INVALIDATION — NOT PROVIDED — verify manually
MISSING DATA — daily/4h charts, RSI, moving averages, support/resistance history
CONFIDENCE: Low`,
    research: `DRY-RUN RESEARCH OUTPUT for ${ticker}
1. VERIFIED NEWS: NOT PROVIDED — verify manually
2. CATALYSTS: NOT PROVIDED — verify manually
3. ON-CHAIN: NOT PROVIDED
4. RISKS (VIEW): incomplete data; liquidity and narrative unknown without sources
5. SENTIMENT: NOT PROVIDED
6. SOURCES: NOT PROVIDED
CONFIDENCE: Low`,
    risk: `DRY-RUN RISK OUTPUT for ${ticker}
DOWNSIDE — NOT PROVIDED (no invalidation or historical moves pasted)
ASSUMPTION AUDIT — alert fields are Solid if copied from TradingView; all other market claims Unsupported
CONTRADICTIONS — insufficient data to compare technical vs research
LIQUIDITY + VENUE — FACT: volume=${volume}, exchange=${alert.exchange || "NOT PROVIDED"}; spreads NOT PROVIDED
POSITION MATH — NOT PROVIDED (invalidation distance missing)
NEEDS MORE RESEARCH — charts, news with URLs+dates, on-chain, and invalidation level are missing. This dry-run proves the pipeline only; do not treat as analysis.
CONFIDENCE: Low`,
  };
  return stubs[role];
}

async function callModel({ client, model, dryRun, role, userContent, alert }) {
  if (dryRun) {
    return dryRunStub(role, alert);
  }
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_RULES },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
  });
  const text = response.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`Empty response from model for role ${role}`);
  }
  return text;
}

async function runPipeline({ alert, model, dryRun, apiKey }) {
  const client = dryRun
    ? null
    : new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });

  if (!dryRun && !apiKey && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required unless --dry-run is enabled");
  }

  const alertData = JSON.stringify(alert, null, 2);
  const baseVars = {
    ALERT_DATA: alertData,
    TICKER: alert.ticker || "UNKNOWN",
    TIMENOW: alert.timenow || "NOT PROVIDED",
  };

  const scannerPrompt = fillTemplate(loadPrompt("scanner"), baseVars);
  const scannerOutput = await callModel({
    client,
    model,
    dryRun,
    role: "scanner",
    userContent: scannerPrompt,
    alert,
  });

  const technicalPrompt = fillTemplate(loadPrompt("technical"), {
    ...baseVars,
    SCANNER_OUTPUT: scannerOutput,
  });
  const technicalOutput = await callModel({
    client,
    model,
    dryRun,
    role: "technical",
    userContent: technicalPrompt,
    alert,
  });

  const researchPrompt = fillTemplate(loadPrompt("research"), {
    ...baseVars,
    SCANNER_OUTPUT: scannerOutput,
    TECHNICAL_OUTPUT: technicalOutput,
  });
  const researchOutput = await callModel({
    client,
    model,
    dryRun,
    role: "research",
    userContent: researchPrompt,
    alert,
  });

  const riskPrompt = fillTemplate(loadPrompt("risk"), {
    ...baseVars,
    SCANNER_OUTPUT: scannerOutput,
    TECHNICAL_OUTPUT: technicalOutput,
    RESEARCH_OUTPUT: researchOutput,
  });
  const riskOutput = await callModel({
    client,
    model,
    dryRun,
    role: "risk",
    userContent: riskPrompt,
    alert,
  });

  return {
    scannerOutput,
    technicalOutput,
    researchOutput,
    riskOutput,
  };
}

module.exports = {
  runPipeline,
  loadPrompt,
  fillTemplate,
  dryRunStub,
};
