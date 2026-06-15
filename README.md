# 🇮🇳 Unknown Bhaarath — Autonomous Instagram Facts Agent

> A fully autonomous, zero-touch content pipeline that researches, fact-checks, designs, and publishes 3 Instagram carousel posts daily to [@unknownbhaarath](https://instagram.com/unknownbhaarath) — running entirely on free cloud infrastructure with phone alerts via Telegram.

**No servers. No laptop. No manual work.** Once deployed, it runs itself on a schedule, recovers from failures, and only pings me when something needs attention.

---

## Why I built this

I wanted to prove I could take an idea from architecture to a **production-grade, self-healing agentic system** — not just a script that works once on my machine. This project demonstrates end-to-end ownership: API integration, multi-model AI orchestration, content safety, error recovery, and cloud automation. I architect and debug; I use AI assistants for implementation, then audit the output to production standard (see *Engineering Rigor* below).

---

## Architecture

```
GitHub Actions (cron, cloud — runs even when my laptop is off)
  ↓
Per slide — 4-layer content fallback chain:
  Layer 1: RSS feeds (real news)      → Claude Haiku rewrite + validate
  Layer 2: Tavily web search          → Claude Haiku rewrite + validate
  Layer 3: Groq (Llama 3.3) unknown   → Claude verify (confidence score)
                                        → Claude storytelling rewrite
  Layer 4: Hardcoded backup facts     → last resort, never fails
  ↓
Content safety gate (rejects AI refusals, unsafe claims, off-topic articles)
  ↓
Puppeteer → premium HTML/CSS slide render (1080×1080, per-slide isolation)
  ↓
Cloudinary → image hosting
  ↓
Instagram Graph API → carousel post (with retry + rate-limit handling)
  ↓
Telegram → phone alert  📰 [news] / 🔮 [unknown fact] / ⚠️ [backup]
```

The **4-layer fallback** is the core design idea: the bot prefers fresh real news, but if every source fails, it degrades gracefully through web search → AI-generated verified facts → curated backups. It is built so a single failure never produces a missed or broken post.

---

## Daily Schedule (IST)

| Time | Categories |
|------|-----------|
| 8:00 AM | INDIA · INDIA & WORLD · GLOBAL |
| 1:00 PM | TECHNOLOGY · GK & FACTS · SCIENCE & SPACE |
| 6:00 PM | JOBS · CAREER · STUDY ABROAD |

---

## Tech Stack

| Layer | Tool | Cost |
|---|---|---|
| Scheduler | GitHub Actions (cron) | Free |
| News (primary) | RSS — PIB, The Hindu, BBC, ET, ISRO… | Free |
| News (fallback) | Tavily API | Free (1000/mo) |
| Unknown facts | Groq — Llama 3.3 70B | Free |
| Rewrite + fact verification | Claude Haiku 4.5 | ~$20 ≈ 7 months |
| Slide rendering | Puppeteer + HTML/CSS | Free |
| Image hosting | Cloudinary | Free |
| Publishing | Instagram Graph API | Free |
| Alerts / observability | Telegram Bot | Free |

**Total running cost: ~₹0/month** (only the Claude API is paid, and a Gemini swap makes it fully free).

---

## Engineering Rigor — production hardening

After the first working version, I ran a full tester-style audit of the codebase (treating my own AI-assisted code as untrusted) and fixed **20+ edge-case bugs** before calling it production-ready. Highlights:

- **Content safety** — AI sometimes returned refusal text ("Cannot create slide from…"). Added a refusal/mismatch detector so bad output falls back to verified facts instead of being posted as a real slide.
- **HTML & Telegram injection** — news headlines containing `<`, `>`, `&` broke slide rendering and Telegram alerts. Added escaping across all user-content fields.
- **Relevance filtering** — generic terms like "2026" were matching almost every article, letting off-topic news into the wrong category. Rewrote topic scoring (stop-words + minimum match threshold).
- **Fault isolation** — one failed slide used to kill the entire post. Made rendering per-slide resilient so the carousel still publishes if ≥2 slides succeed.
- **API resilience** — added retry with backoff, Instagram container-status polling, rate-limit handling, and a token-expiry early-warning alert via the Graph `debug_token` endpoint.
- **Correctness** — fixed a misleading auto-generated source year, dependency/SDK version drift, and deprecated analytics metrics.

This audit is documented commit-by-commit in the repo history.

---

## Setup

### 1. Environment keys
```
GROQ_API_KEY              → console.groq.com
ANTHROPIC_API_KEY         → console.anthropic.com/settings/keys
INSTAGRAM_ACCESS_TOKEN
INSTAGRAM_ACCOUNT_ID
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
PEXELS_API_KEY            → pexels.com/api
TAVILY_API_KEY            → tavily.com
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

Add these as **GitHub repository secrets** for the cloud run, or in a local `.env` (see `.env.example`) for testing.

### 2. Local test
```bash
npm install
npm run test:ig      # verify Instagram connection
npm run test:slide   # render a sample slide
npm run post         # generate + publish a real post
npm run health       # health check (token, APIs, connectivity)
```

### 3. Deploy
Push to `main`. GitHub Actions handles the rest on schedule — no infrastructure to manage.

---

## Project Structure
```
src/
  index.js          # orchestrator — runs the full pipeline per slot
  newsScraper.js    # RSS + relevance scoring
  aiGenerator.js    # Groq + Claude content generation, verification, safety gate
  slideTemplate.js  # HTML/CSS slide design (escaped, responsive font)
  imageRenderer.js  # Puppeteer render, per-slide fault isolation
  instagram.js      # Graph API publish, retry, token monitoring
  cloudinary.js     # image upload
  telegram.js       # phone alerts (escaped)
  analytics.js      # post insights
.github/workflows/  # cron schedules + health check
```

---

## Roadmap
- [ ] Niche spin-off accounts (Technology + Science) on the same engine
- [ ] Per-slide try/catch metrics dashboard
- [ ] Auto A/B testing of hooks against engagement data

---

*Built and maintained by [Siddu (Bodavula Naga Venkata Siddardha)](https://github.com/bodavulasiddardha-png) — exploring agentic AI, automation, and data/business analytics.*
