import axios from 'axios';
import Parser from 'rss-parser';

const parser = new Parser({ timeout: 10000 });

const RSS_SOURCES = {
  india: [
    'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3',
    'https://www.thehindu.com/news/national/feeder/default.rss',
    'https://indianexpress.com/feed/',
    'https://www.livemint.com/rss/news',
  ],
  world: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.thehindu.com/news/international/feeder/default.rss',
  ],
  tech: [
    'https://techcrunch.com/feed/',
    'https://entrackr.com/feed/',
  ],
  science: [
    'https://www.isro.gov.in/rss-news.xml',
    'https://www.sciencedaily.com/rss/top/science.xml',
  ],
  jobs: [
    'https://economictimes.indiatimes.com/jobs/rssfeeds/1069504153.cms',
    'https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms',
  ],
  education: [
    'https://www.thehindu.com/education/feeder/default.rss',
    'https://indianexpress.com/section/education/feed/',
  ],
  cricket: [
    'https://www.espncricinfo.com/rss/content/story/feeds/0.xml',
    'https://feeds.feedburner.com/ndtv/sports',
    'https://www.thehindu.com/sport/cricket/feeder/default.rss',
  ],
};


// ── Source quality guard ─────────────────────────────────
// Low-quality blogs/coaching pages caused false salary/stat claims.
// This whitelist keeps the bot on safer sources; if no source passes, the
// category falls back to verified backup facts instead of inventing.
const TRUSTED_DOMAINS = [
  'pib.gov.in', 'isro.gov.in', 'rbi.org.in', 'sebi.gov.in', 'uidai.gov.in',
  'niti.gov.in', 'education.gov.in', 'meity.gov.in', 'mospi.gov.in',
  'telangana.gov.in', 'telanganadigitalmedia.org', 'tshc.gov.in',
  'thehindu.com', 'indianexpress.com', 'economictimes.indiatimes.com',
  'livemint.com', 'business-standard.com', 'moneycontrol.com',
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk',
  'espncricinfo.com', 'icc-cricket.com', 'bcci.tv',
  'nasscom.in', 'linkedin.com', 'weforum.org', 'worldbank.org', 'un.org',
  'unesco.org', 'nasa.gov', 'sciencedaily.com', 'techcrunch.com', 'entrackr.com',
  'opendoorsdata.org', 'iie.org', 'ugc.gov.in', 'nta.ac.in'
];

const BLOCKED_DOMAINS = [
  'igmguru.com', 'civilskills.in', 'intinews', 'adda247.com', 'testbook.com',
  'jagranjosh.com', 'collegedunia.com', 'shiksha.com', 'careers360.com',
  'ambitionbox.com', 'glassdoor.co.in', 'simplilearn.com', 'upgrad.com',
  'greatlearning.in', 'geeksforgeeks.org'
];

function isTrustedSource(article = {}) {
  const host = hostFromUrl(article.link || article.url || '');
  const source = String(article.source || '').toLowerCase();
  const hay = `${host} ${source}`.toLowerCase();

  if (BLOCKED_DOMAINS.some(d => hay.includes(d))) return false;
  return TRUSTED_DOMAINS.some(d => hay.includes(d));
}

function filterTrusted(articles = []) {
  return articles.filter(isTrustedSource);
}

const SLOT_CONFIG = {
  morning: [
    { topic: 'India government policy economy 2026', category: 'INDIA', tags: ['india'] },
    { topic: 'India bilateral relations USA UK UAE China Japan 2026', category: 'INDIA & WORLD', tags: ['india', 'world'] },
    { topic: 'global economy world news 2026', category: 'GLOBAL', tags: ['world'] },
  ],
  afternoon: [
    { topic: 'India technology AI startup 2026', category: 'TECHNOLOGY', tags: ['tech'] },
    { topic: 'India history heritage geography facts', category: 'GK & FACTS', tags: ['india'] },
    { topic: 'ISRO space science discovery 2026', category: 'SCIENCE & SPACE', tags: ['science'] },
  ],
  evening: [
    { topic: 'Hyderabad IT jobs hiring skills salary 2026', category: 'HYDERABAD JOBS', tags: ['jobs', 'tech'] },
    { topic: 'India career skills salary trends 2026', category: 'CAREER', tags: ['jobs', 'tech'] },
    { topic: 'India study tips exams education 2026', category: 'STUDY', tags: ['education', 'india'] },
  ],
};

// Check if text is primarily non-English (Hindi/regional)
function isNonEnglish(text) {
  const nonEnglish = (text.match(/[^\x00-\x7F]/g) || []).length;
  return nonEnglish / Math.max(text.length, 1) > 0.3;
}

// Words that should NOT count as topic matches (years, generic terms).
// "2026" was matching almost every article, letting garbage through.
const STOP_WORDS = new Set([
  '2024', '2025', '2026', '2027', 'india', 'indian', 'latest', 'news',
  'world', 'global', 'trends', 'today', 'update', 'updates'
]);

// Fetch up to 3 articles from RSS
async function fetchFromRSS(tags, topic) {
  const topicWords = topic.toLowerCase().split(' ')
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
  const candidates = [];
  const seenTitles = new Set();

  for (const tag of tags) {
    for (const url of (RSS_SOURCES[tag] || [])) {
      try {
        const feed = await parser.parseURL(url);
        for (const item of (feed.items || []).slice(0, 20)) {
          const title = (item.title || '').trim();
          const snippet = item.contentSnippet || '';
          const titleKey = title.toLowerCase();

          if (!title || seenTitles.has(titleKey)) continue;
          if (isNonEnglish(title + snippet)) continue;
          seenTitles.add(titleKey);

          const text = (title + ' ' + snippet).toLowerCase();
          const score = topicWords.filter(w => text.includes(w)).length;
          // Require at least 2 meaningful topic words to match — prevents
          // unrelated articles (e.g. a Brazil accident) entering a jobs slot.
          if (score >= 2) {
            candidates.push({
              title,
              content: snippet.substring(0, 1200),
              link: item.link || '',
              score,
              source: (feed.title || 'RSS').replace(/\s+/g, ' ').substring(0, 40),
            });
          }
        }
      } catch (e) { /* skip dead feed */ }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return filterTrusted(candidates).slice(0, 3); // top 3 trusted
}

// Fetch up to 3 articles from Tavily
function hostFromUrl(url = '') {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Tavily'; }
}

async function fetchFromTavily(topic) {
  if (!process.env.TAVILY_API_KEY) return [];
  try {
    const res = await axios.post('https://api.tavily.com/search', {
      api_key: process.env.TAVILY_API_KEY,
      query: `${topic} India 2026 latest`,
      search_depth: 'basic',
      max_results: 8,
      include_domains: TRUSTED_DOMAINS,
    }, { timeout: 12000 });

    return filterTrusted((res.data.results || []).map(r => ({
      title: r.title || topic,
      content: (r.content || r.snippet || '').substring(0, 1200),
      link: r.url || '',
      score: 5,
      source: hostFromUrl(r.url || ''),
    }))).slice(0, 3);
  } catch (e) {
    console.warn('[Tavily] failed:', e.message);
    return [];
  }
}

export async function gatherSlotContent(slot) {
  const config = SLOT_CONFIG[slot] || SLOT_CONFIG.morning;
  const results = [];

  for (const { topic, category, tags } of config) {
    console.log(`   Fetching: ${category}...`);

    // RSS + Tavily parallel fetch → best-of-6
    const [rssArticles, tavilyArticles] = await Promise.all([
      fetchFromRSS(tags, topic),
      fetchFromTavily(topic),
    ]);

    const all = [...rssArticles, ...tavilyArticles];

    if (all.length > 0) {
      console.log(`   [${category}] ${rssArticles.length} RSS + ${tavilyArticles.length} Tavily = ${all.length} candidates`);
      results.push({ category, topic, articles: all, article: null });
    } else {
      console.log(`   [${category}] No articles found → Groq unknown fact`);
      results.push({ category, topic, articles: [], article: null });
    }
  }

  return results;
}
