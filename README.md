# Crypto Research Dashboard

Research-only inbox for TradingView alert → OpenAI analysis. **This app never places trades, never connects to an exchange, and never holds wallet keys.**

It implements the optional automation path from the AI Crypto Research Desk guide: webhook → four prompts (SCAN → TECHNICALS → RESEARCH → RISK) → SQLite → human review.

## What each file does

| Path | Purpose |
| --- | --- |
| `src/server.js` | Express app: webhook, API, static dashboard |
| `src/pipeline.js` | Loads prompts, calls OpenAI (or dry-run stubs), chains four roles |
| `src/db.js` | SQLite schema + helpers for analyses and human review |
| `prompts/*.md` | Scanner / Technical / Research / Risk prompt templates |
| `public/` | Minimal dashboard UI |
| `scripts/test-webhook.js` | Posts a sample alert to local `/webhook` |
| `.env.example` | Required environment variables (copy to `.env`) |
| `data/analyses.db` | Created at runtime (gitignored) |

## Setup (5 minutes)

1. Copy env file and edit secrets:

```bash
cp .env.example .env
```

Set at least:

- `WEBHOOK_SECRET` — long random string
- `OPENAI_API_KEY` — only needed for live mode (not for `--dry-run`)
- `OPENAI_MODEL` — defaults to `gpt-6-astra`
- `PORT` — defaults to `3000`

2. Install dependencies:

```bash
npm install
```

3. Start in dry-run mode (no API key required):

```bash
npm run dry-run
```

4. Open the dashboard: [http://localhost:3000](http://localhost:3000)

5. In another terminal, send a test alert:

```bash
npm run test:webhook
```

Refresh the dashboard — you should see a new analysis with Risk verdict **NEEDS MORE RESEARCH** (expected for stub/minimal alert data).

### Live mode (real model calls)

```bash
npm start
```

Requires a valid `OPENAI_API_KEY`. The model still only sees alert JSON + prior step outputs; it cannot invent a market scan beyond what you send.

## Point a TradingView alert at the webhook

1. TradingView **paid plan** with webhooks enabled (TradingView requires 2FA for webhooks).
2. Create an alert on a chart.
3. Webhook URL: `https://YOUR_PUBLIC_HOST/webhook`
4. Message / JSON body example:

```json
{
  "secret": "YOUR_WEBHOOK_SECRET",
  "ticker": "{{ticker}}",
  "exchange": "{{exchange}}",
  "close": {{close}},
  "volume": {{volume}},
  "interval": "{{interval}}",
  "timenow": "{{timenow}}"
}
```

You can also send the secret as header `X-Webhook-Secret` instead of the `secret` field. Requests with a wrong or missing secret are rejected (`401`).

Expose your local server with a tunnel (ngrok, Cloudflare Tunnel, etc.) only if you understand the risk of a public URL. Keep `WEBHOOK_SECRET` strong.

## Human review

The dashboard lists analyses, shows each step’s output, highlights the Risk verdict (`REJECT` / `NEEDS MORE RESEARCH` / `CONTINUE TO PLAN`), and lets you save:

- no action
- more research
- my own decision, my responsibility

**CONTINUE TO PLAN means research is complete enough for a human to review — not approval to trade.**

## Boundaries (hard)

- No exchange API integration
- No order placement, cancel, or sizing against a live venue
- No wallet / custody code
- Secrets stay in `.env` — never in frontend code
- Missing inputs become `NOT PROVIDED — verify manually`

If you later ask to auto-trade, the correct answer is: refuse. Analysis is for human review only.

## Educational notice

Not investment advice. Crypto trading involves substantial risk. Verify every number against your own sources before any decision.
