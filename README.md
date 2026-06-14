# Unknown Bhaarath — Autonomous Instagram Facts Agent

Daily 3 posts to @unknownbhaarath. Runs on GitHub Actions (cloud) — laptop off, phone alerts via Telegram. ~₹0 cost.(Claude API used here. Swap with Gemini API for $0.00 Cost)

## Architecture
```
GitHub Actions (cron, cloud)
  ↓
Per slide — 3-layer content:
  Layer 1: RSS feeds (real news) → Claude Haiku rewrite
  Layer 2: Tavily search (web) → Claude Haiku rewrite
  Layer 3: Groq (unknown fact) → Claude verify → Claude storytelling
  Layer 4: Hardcoded backup (last resort)
  ↓
Puppeteer → Premium HTML/CSS slide (1080×1350)
  ↓
Cloudinary → Image hosting
  ↓
Instagram Graph API → Carousel post
  ↓
Telegram → Phone alert (📰[news] / 🔮[unknown fact] / ⚠️[backup])
```

## Daily Schedule (IST)
- 8:00 AM → INDIA · INDIA & WORLD · GLOBAL
- 1:00 PM → TECHNOLOGY · GK & FACTS · SCIENCE & SPACE
- 6:00 PM → JOBS · CAREER · STUDY ABROAD

## Stack
| Part | Tool | Cost |
|---|---|---|
| Scheduler | GitHub Actions | Free |
| News primary | RSS (PIB, The Hindu, BBC...) | Free |
| News fallback | Tavily API | Free (1000/mo) |
| Unknown facts | Groq (Llama 3.3) | Free |
| Rewrite + Verify | Claude Haiku 4.5 | $20 ≈ 7 months |
| Slides | Puppeteer + HTML/CSS | Free |
| Image hosting | Cloudinary | Free |
| Posting | Instagram Graph API | Free |
| Alerts | Telegram Bot | Free |

## Setup

### 1. Keys needed
```
GROQ_API_KEY         → console.groq.com
ANTHROPIC_API_KEY    → console.anthropic.com/settings/keys
INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_ACCOUNT_ID
CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
PEXELS_API_KEY       → pexels.com/api
TAVILY_API_KEY       → tavily.com
TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
```

### 2. Local test
```bash
npm install
npm run test:ig        # verify Instagram connects
npm run post           # first real post
```

### 3. Deploy to GitHub
```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/YOUR_USERNAME/unknownbhaarath.git
git push -u origin main
```
Make repo **public**. Add all keys as GitHub Secrets (Settings → Secrets → Actions).

### 4. Test workflow
Actions → "Unknown Bhaarath Auto Post" → Run workflow → pick slot → Run.

## Commands
```
npm test            # 8 unit tests
npm run test:ig     # Instagram connection
npm run test:slide  # preview slide design
npm run health      # full system health check
npm run post        # generate + post (uses SLOT env)
npm run report      # weekly analytics → Telegram
```

## Maintenance
- Instagram token: renew every 60 days (5 mins)
- GitHub cron: re-enable after 60 days inactivity
- Tavily: 1000 free searches/month (bot uses ~270/month)

## Troubleshooting
- Instagram fails: try adding secret `IG_API_BASE=https://graph.facebook.com/v21.0`
- Slides plain: check PEXELS_API_KEY is set
- No Telegram: message your bot once first, verify TELEGRAM_CHAT_ID
