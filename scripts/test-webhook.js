#!/usr/bin/env node
/**
 * Sends a sample TradingView-style alert to the local webhook (dry-run friendly).
 * Usage: node scripts/test-webhook.js
 */
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const secret = process.env.WEBHOOK_SECRET;

if (!secret) {
  console.error("WEBHOOK_SECRET missing. Copy .env.example to .env first.");
  process.exit(1);
}

const payload = {
  ticker: "BTCUSDT",
  exchange: "BINANCE",
  close: 64000.5,
  volume: 1234.56,
  interval: "240",
  timenow: new Date().toISOString(),
};

async function main() {
  const res = await fetch(`http://localhost:${PORT}/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": secret,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log(res.status, text);
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
