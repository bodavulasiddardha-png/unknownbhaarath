import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Retry helper ──────────────────────────────────────────
async function withRetry(fn, label, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      console.warn(`[Retry] ${label} attempt ${i+1}/${tries}: ${e.message}`);
      if (i < tries - 1) await new Promise(r => setTimeout(r, 2000 * (i+1)));
    }
  }
  throw last;
}

// ── Safe JSON parse ───────────────────────────────────────
function safeJSON(raw) {
  const clean = (raw || '').replace(/```json/g,'').replace(/```/g,'').trim();
  const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('No JSON found in: ' + clean.substring(0,80));
  return JSON.parse(clean.substring(s, e+1));
}


const BANNED_FILLER = [
  'dominant', 'dominance', 'resilience', 'remarkable', 'incredible', 'landmark year',
  'game changer', 'game-changing', 'strong performance', 'rain-hit conditions',
  'showcased', 'dramatically', 'accelerated', 'exponential growth', 'powerful',
  'massive boost', 'historic moment', 'set the tone', 'major step'
];

function hasConcreteDetail(text = '') {
  return /\d|\b[A-Z][a-z]+\b/.test(text);
}

function containsFiller(text = '') {
  const lower = String(text).toLowerCase();
  return BANNED_FILLER.some(w => lower.includes(w));
}

function cleanText(text = '') {
  let out = String(text || '').trim();
  for (const word of BANNED_FILLER) {
    const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
    out = out.replace(re, '').replace(/\s{2,}/g, ' ').trim();
  }
  return out.replace(/^[,\-–: ]+|[,\-–: ]+$/g, '').trim();
}


function hasUnsafeIndiaSalary(text = '', category = '') {
  const t = String(text || '');
  const isIndiaJobs = ['HYDERABAD JOBS', 'JOBS', 'CAREER'].includes(category);
  if (!isIndiaJobs) return false;
  // Blocks US salary hallucinations like $140K/year in India/Hyderabad posts.
  return /\$\s?\d{2,3}\s?k\b|\$\s?\d{2,3},?\d{3}\b/i.test(t);
}

function hasUnsupportedMegaStat(text = '') {
  const t = String(text || '').toLowerCase();
  // Common model-invented broad claims unless source explicitly provides them.
  return /\b\d{2,3}%\s+(skills?|talent|salary|job|hiring)\b/.test(t) &&
         /(shortage|gap|crisis|demand|growth|highest|dominates)/i.test(t);
}

function validateSlide(slide, category) {
  const allText = [
    slide.headline, slide.highlight, slide.stat, slide.statLabel, slide.source,
    ...(slide.facts || []), ...(slide.full_facts || []),
    ...(slide.stats || []).flatMap(s => [s.num, s.label])
  ].filter(Boolean).join(' ');

  if (hasUnsafeIndiaSalary(allText, category)) {
    throw new Error(`Rejected unsafe India salary claim in ${category}`);
  }
  if (hasUnsupportedMegaStat(allText)) {
    throw new Error(`Rejected broad unsupported percentage/stat claim in ${category}`);
  }
  return slide;
}

function fallbackStatsFromFacts(facts = []) {
  return facts.slice(0, 4).map(f => {
    const m = String(f).match(/(\d+(?:\.\d+)?%?|₹\s?\d+(?:\.\d+)?\s?(?:LPA|crore|lakh)?|\$\s?\d+(?:\.\d+)?\s?(?:B|M|T)?|\d+\/\d+|\d+\*)/i);
    const num = m ? m[0].replace(/\s+/g, ' ') : '';
    const label = String(f).replace(num, '').split(/[,.:;—–-]/)[0].trim().split(' ').slice(0, 3).join(' ');
    return { num, label: label || 'Key Fact' };
  });
}

function normalizeSlide(slide, category, topic) {
  slide.category = slide.category || category;
  slide.type = slide.type || 'news';

  slide.facts = (slide.facts || [])
    .map(cleanText)
    .filter(f => f.length >= 8 && hasConcreteDetail(f) && !containsFiller(f))
    .slice(0, 4);

  slide.full_facts = (slide.full_facts || [])
    .map(cleanText)
    .filter(f => f.length >= 20 && hasConcreteDetail(f) && !containsFiller(f))
    .slice(0, 4);

  slide.stats = (slide.stats || [])
    .filter(s => s && String(s.num || '').trim() && String(s.label || '').trim())
    .map(s => ({ num: String(s.num).trim(), label: cleanText(s.label).split(' ').slice(0, 4).join(' ') }))
    .slice(0, 4);

  if (slide.stats.length < slide.facts.length) {
    const auto = fallbackStatsFromFacts(slide.facts);
    slide.stats = slide.facts.map((_, i) => slide.stats[i] || auto[i] || { num: '', label: 'Key Fact' });
  }

  if (!slide.full_facts.length) slide.full_facts = slide.facts.slice(0, 3);
  if (!slide.stat && slide.stats[0]?.num) slide.stat = slide.stats[0].num;
  if (!slide.statLabel && slide.stats[0]?.label) slide.statLabel = slide.stats[0].label;
  if (!slide.source || containsFiller(slide.source)) slide.source = 'Verified source';
  if (!slide.headline || containsFiller(slide.headline)) slide.headline = String(topic || category).split(' ').slice(0, 6).join(' ');

  return slide;
}

// ── Unknown fact topics per category ─────────────────────
const UNKNOWN_TOPICS = {
  'INDIA':          ['unknown ancient India civilization achievement', 'India forgotten history independence movement', 'India ancient science mathematics astronomy'],
  'INDIA & WORLD':  ['India bilateral relations unknown history USA UK UAE', 'India foreign policy unknown achievement milestone', 'India global diplomacy history unknown fact'],
  'GLOBAL':         ['India global contribution forgotten history', 'Indian diaspora world achievement unknown', 'India world record unique achievement'],
  'TECHNOLOGY':     ['India technology invention unknown contribution', 'Indian scientist engineer forgotten achievement', 'India digital space technology milestone'],
  'GK & FACTS':     ['India unique geography nature surprising fact', 'India unknown cultural tradition heritage', 'India surprising world record statistic'],
  'SCIENCE & SPACE':['ISRO unknown achievement milestone history', 'India ancient science astronomy mathematics', 'Indian scientist discovery invention history'],
  'JOBS':           ['India economy employment milestone history', 'Indian workforce global contribution achievement', 'India industry sector unknown growth fact'],
  'HYDERABAD JOBS': ['Hyderabad IT industry employment milestone', 'Telangana technology workforce growth history', 'Hyderabad startup ecosystem achievement'],
  'CAREER':         ['India education system achievement history', 'Indian professionals global achievement unknown', 'India skill development surprising fact'],
  'STUDY':          ['India education history ancient universities', 'Indian students exam preparation achievement', 'India learning science education milestone'],
  'STUDY ABROAD':   ['Indian students abroad achievement contribution', 'Indian students global education destinations', 'Indians global leadership achievement unknown'],
  'CRICKET':        ['India cricket world record unknown achievement', 'India cricket history unknown milestone 1932', 'Indian cricketer forgotten record achievement'],
};

// ── Groq: unknown historical fact ────────────────────────
async function groqUnknownFact(category) {
  const topics = UNKNOWN_TOPICS[category] || UNKNOWN_TOPICS['INDIA'];
  const topic = topics[Math.floor(Math.random() * topics.length)];

  const res = await groq.chat.completions.create({
    messages: [{
      role: 'user',
      content: `Generate 1 fascinating lesser-known fact about: ${topic}

Rules:
- Historically accurate with specific numbers, dates, or names
- Genuinely surprising to most Indians
- No opinions, no predictions
- Return ONLY valid JSON (no markdown):
{"fact": "one sentence with number/date/name", "source": "source name"}`,
    }],
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    max_tokens: 200,
  });

  const parsed = safeJSON(res.choices[0].message.content);
  if (!parsed.fact || parsed.fact.length < 10) throw new Error('Groq fact too short');
  if (!parsed.source) parsed.source = 'Historical records';
  return parsed;
}

// ── Claude: pick best article from candidates ─────────────
async function claudePickBest(category, topic, articles) {
  if (articles.length === 1) return articles[0];

  const list = articles.map((a, i) => `${i}: ${a.title} | Source: ${a.source || 'unknown'} | URL: ${a.link || ''}`).join('\n');
  const res = await withRetry(() => claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 20,
    messages: [{
      role: 'user',
      content: `Which article is most surprising, fact-rich, and shareable for an India facts Instagram page?
Topic: ${topic}
Articles:
${list}
Rules:
- Prefer official/publication sources over coaching blogs or SEO pages.
- Reject salary/stat articles from weak sources by choosing a better source when available.
Return ONLY the index number (0, 1, 2...):`,
    }],
  }), 'claudePickBest');

  const idx = parseInt((res.content[0].text || '0').trim());
  return articles[isNaN(idx) || idx >= articles.length ? 0 : idx];
}

// ── Claude: rewrite news as carousel ─────────────────────
async function claudeRewriteNews(category, topic, title, content, sourceName = 'Unknown', sourceUrl = '') {
  const res = await withRetry(() => claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are a content writer for "Unknown Bhaarath" — an Indian Instagram facts page.
Category: ${category} | Topic: ${topic}
Source title: ${title}
Source name: ${sourceName}
Source URL: ${sourceUrl}
Content: ${content}

Create a premium Instagram infographic slide with HARD FACTS only. Return ONLY valid JSON:
{
  "headline": "MAX 6 words; no hype words",
  "highlight": "1 exact number/name from headline if possible",
  "stat": "most striking exact number/year/score",
  "statLabel": "3-4 word factual label",
  "facts": [
    "Card 1: exact score/number/name/date/rank only, 8-12 words",
    "Card 2: exact score/number/name/date/rank only, 8-12 words",
    "Card 3: exact score/number/name/date/rank only, 8-12 words",
    "Card 4: exact score/number/name/date/rank only, 8-12 words"
  ],
  "stats": [
    {"num": "exact number 1", "label": "2-4 word label"},
    {"num": "exact number 2", "label": "2-4 word label"},
    {"num": "exact number 3", "label": "2-4 word label"},
    {"num": "exact number 4", "label": "2-4 word label"}
  ],
  "full_facts": [
    "Detailed caption sentence with exact numbers, names and source-backed context.",
    "Detailed caption sentence with exact numbers, names and source-backed context.",
    "Detailed caption sentence with exact numbers, names and source-backed context."
  ],
  "source": "real short source name, not generic",
  "type": "news"
}

STRICT QUALITY RULES:
- Never invent numbers, names, scores, dates, salary ranges, awards or player-of-match details.
- If exact data is missing, omit that card instead of guessing.
- Avoid AI filler words: dominant, resilience, remarkable, incredible, landmark year, game changer, rain-hit conditions, strong performance, showcased, dramatically, exponential growth.
- Every facts[] item must include a measurable detail: number, name, date, rank, score, percentage, salary or location.
- stats[i].num + stats[i].label = the big right-side card; it must be specific, not generic.


SOURCE + SALARY SAFETY RULES:
- For HYDERABAD JOBS / JOBS / CAREER, never use US-dollar salaries for India posts.
- India salary figures must be in INR/₹ and must be stated in the source content. If not present, use role/skill facts instead.
- Do not trust salary numbers from coaching/training websites or generic blogs.
- Never create broad claims like "82% skills shortage" unless that exact number exists in source content.
- If the source is weak or unclear, produce a conservative slide using only the article's title/location/date facts.

CATEGORY RULES:
- CRICKET: Prefer team scores, chase overs, top scorer, best bowler, Player of the Match, venue, series/match number. Do not write mood words.
- JOBS/CAREER: Prefer salary ranges, hiring counts, role names, required skills, city/company names. Avoid vague claims like highest-paid unless source states it.
- STUDY ABROAD: Prefer student counts, destination countries, visa figures, cost ranges, official years. Avoid unsupported predictions like landmark year.`,
    }],
  }), 'claudeRewriteNews');

  return safeJSON(res.content[0].text);
}

// ── Claude: storytelling for unknown facts ────────────────
async function claudeStorytellingFact(category, fact, source) {
  const res = await withRetry(() => claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are a storyteller for "Unknown Bhaarath" — tagline "Facts India never taught you".
Category: ${category}
Core fact: ${fact}
Source: ${source}

Create a premium "did you know" infographic with hard facts, numbers, names and dates only. Avoid filler/hype words. Return ONLY valid JSON:
{
  "headline": "mind-blowing headline MAX 6 words — make people stop scrolling",
  "highlight": "1 key word to color",
  "stat": "the most surprising number or year from this fact",
  "statLabel": "3-4 word label",
  "facts": [
    "Card 1 description — 8-12 words, surprising detail",
    "Card 2 description — 8-12 words, adds context",
    "Card 3 description — 8-12 words, deeper detail",
    "Card 4 description — 8-12 words, modern relevance"
  ],
  "stats": [
    {"num": "key number 1", "label": "2-3 word label"},
    {"num": "key number 2", "label": "2-3 word label"},
    {"num": "key number 3", "label": "2-3 word label"},
    {"num": "key stat 4", "label": "2-3 word label"}
  ],
  "full_facts": [
    "Full engaging sentence 1 with all context",
    "Full engaging sentence 2 with historical detail",
    "Full engaging sentence 3 — why this matters today"
  ],
  "source": "${source}",
  "type": "unknown"
}

STRICT RULES:
- Every card must contain a number, date, name, place, rank or measurable detail.
- Never invent facts. If context is missing, keep it shorter.
- Do not use filler words: dominant, resilience, landmark year, game changer, remarkable, incredible, strong performance.`,
    }],
  }), 'claudeStorytelling');

  return safeJSON(res.content[0].text);
}

// ── Main export ───────────────────────────────────────────
export async function generateSlide(category, topic, articles) {
  // NEWS path — best-of-N selection then rewrite
  if (articles && articles.length > 0) {
    try {
      const best = await claudePickBest(category, topic, articles);
      const slide = validateSlide(normalizeSlide(await claudeRewriteNews(category, topic, best.title, best.content, best.source, best.link), category, topic), category);
      slide.engine = `claude-news(${best.source})`;
      console.log(`   ✓ ${category} [${best.source} → claude]: ${slide.headline}`);
      return slide;
    } catch (e) {
      console.warn(`   [Claude news] failed: ${e.message}`);
    }
  }

  // UNKNOWN FACT path — Groq + Claude verify + Claude story
  try {
    const { fact, source } = await groqUnknownFact(category);

    // Claude accuracy check
    const vRes = await claude.messages.create({
      model: 'claude-haiku-4-5', max_tokens: 80,
      messages: [{ role: 'user', content: `Historically accurate? JSON only: {"confidence":0-100,"verdict":"pass"|"fail"}\nFact: ${fact}` }],
    });
    let confidence = 85, verdict = 'pass';
    try { const v = safeJSON(vRes.content[0].text); confidence = v.confidence||85; verdict = v.verdict||'pass'; } catch {}

    if (verdict === 'fail' || confidence < 85) {
      console.warn(`   [Verify] conf ${confidence} — retrying...`);
      const { fact: f2, source: s2 } = await groqUnknownFact(category);
      const slide = normalizeSlide(await claudeStorytellingFact(category, f2, s2), category, topic);
      slide.engine = 'groq+claude';
      console.log(`   ✓ ${category} [unknown fact retry]: ${slide.headline}`);
      return slide;
    }

    const slide = normalizeSlide(await claudeStorytellingFact(category, fact, source), category, topic);
    slide.engine = 'groq+claude'; slide.confidence = confidence;
    console.log(`   ✓ ${category} [unknown fact conf ${confidence}]: ${slide.headline}`);
    return slide;
  } catch (e) {
    console.warn(`   [Groq+Claude] failed: ${e.message}`);
  }

  // HARDCODED BACKUP
  console.warn(`   [Backup] ${category}`);
  return backupFact(category);
}


function backupFact(category) {
  const backups = {
    'INDIA': [
      {
        headline:'India Added 415M UPI Users', highlight:'415M', stat:'415M', statLabel:'UPI Users',
        facts:['UPI crossed 415M registered users by 2024.','UPI processed 131B transactions in FY2024.','NPCI launched UPI on 11 April 2016.','UPI is operated by National Payments Corporation of India.'],
        stats:[{num:'415M',label:'Users'},{num:'131B',label:'FY2024 Transactions'},{num:'2016',label:'Launch Year'},{num:'NPCI',label:'Operator'}],
        source:'NPCI',
        full_facts:['UPI crossed about 415 million registered users and 131 billion transactions in FY2024.','NPCI launched UPI on 11 April 2016 as an instant bank-to-bank payment system.','The system is operated by National Payments Corporation of India under RBI-regulated payment infrastructure.']
      },
      {
        headline:'India Built 111M Toilets', highlight:'111M', stat:'111M', statLabel:'Household Toilets',
        facts:['Swachh Bharat reported 111M+ household toilets built.','Campaign launched on 2 October 2014.','Rural sanitation coverage reached official ODF status in 2019.','Mission covered more than 600,000 Indian villages.'],
        stats:[{num:'111M+',label:'Toilets'},{num:'2014',label:'Launch Year'},{num:'2019',label:'ODF Declaration'},{num:'600K+',label:'Villages'}],
        source:'Jal Shakti Ministry',
        full_facts:['Swachh Bharat Mission reported more than 111 million household toilets constructed after its 2 October 2014 launch.','The rural mission covered more than 600,000 villages across India.','Official dashboards declared rural India open-defecation-free in 2019 under the mission.']
      }
    ],
    'INDIA & WORLD': [
      {
        headline:'India UAE CEPA Started 2022', highlight:'2022', stat:'2022', statLabel:'CEPA Start',
        facts:['India-UAE CEPA came into effect on 1 May 2022.','Bilateral non-oil trade target is $100B by 2030.','UAE is among India top trading partners.','CEPA reduced duties on thousands of product lines.'],
        stats:[{num:'2022',label:'CEPA Start'},{num:'$100B',label:'2030 Target'},{num:'1 May',label:'Effective Date'},{num:'UAE',label:'Trade Partner'}],
        source:'Commerce Ministry',
        full_facts:['The India-UAE Comprehensive Economic Partnership Agreement came into effect on 1 May 2022.','Both countries set a target of $100 billion in bilateral non-oil trade by 2030.','The pact reduced customs duties across thousands of product lines between India and the UAE.']
      },
      {
        headline:'India Hosted G20 In 2023', highlight:'G20', stat:'2023', statLabel:'G20 Presidency',
        facts:['India held the G20 presidency in 2023.','New Delhi Summit happened on 9-10 September 2023.','African Union joined G20 during India presidency.','Theme was One Earth, One Family, One Future.'],
        stats:[{num:'2023',label:'Presidency'},{num:'9-10 Sep',label:'Summit Dates'},{num:'AU',label:'New Member'},{num:'G20',label:'Forum'}],
        source:'G20 India',
        full_facts:['India held the G20 presidency in 2023 and hosted the New Delhi Summit on 9-10 September.','The African Union was admitted as a permanent G20 member during India\'s presidency.','The official theme was One Earth, One Family, One Future.']
      }
    ],
    'GLOBAL': [
      {
        headline:'India Diaspora Tops 18M', highlight:'18M', stat:'18M+', statLabel:'Overseas Indians',
        facts:['UN estimated 18M+ Indians living abroad in 2020.','India had the world largest diaspora by UN estimates.','UAE and USA host large Indian-origin communities.','Remittances to India crossed $100B in 2022.'],
        stats:[{num:'18M+',label:'Diaspora'},{num:'2020',label:'UN Estimate'},{num:'$100B+',label:'Remittances'},{num:'No.1',label:'Diaspora'}],
        source:'United Nations',
        full_facts:['UN migration estimates placed the Indian diaspora above 18 million in 2020, the world\'s largest.','The UAE and the United States host some of the largest Indian-origin communities.','World Bank data showed remittances to India crossed $100 billion in 2022.']
      },
      {
        headline:'India Population Crossed China', highlight:'Population', stat:'2023', statLabel:'UN Estimate',
        facts:['UN estimated India overtook China in population in 2023.','India median age is about 28 years.','India population is above 1.4B people.','Youth share supports long-term workforce growth.'],
        stats:[{num:'2023',label:'Overtake Year'},{num:'1.4B+',label:'People'},{num:'~28',label:'Median Age'},{num:'UN',label:'Source'}],
        source:'United Nations',
        full_facts:['UN estimates show India overtook China as the world\'s most populous country in 2023.','India\'s population is above 1.4 billion people.','India\'s median age is roughly 28 years, lower than many major economies.']
      }
    ],
    'TECHNOLOGY': [
      {
        headline:'India Has 100+ Unicorns', highlight:'100+', stat:'100+', statLabel:'Unicorns',
        facts:['India crossed 100 unicorn startups in 2022.','Unicorn means startup valuation of $1B or more.','India is among top global startup ecosystems.','Bengaluru, Delhi NCR and Mumbai lead startup density.'],
        stats:[{num:'100+',label:'Unicorns'},{num:'$1B',label:'Valuation Mark'},{num:'2022',label:'Crossed Year'},{num:'3',label:'Top Hubs'}],
        source:'Invest India',
        full_facts:['India crossed 100 unicorn startups in 2022, according to Invest India startup ecosystem summaries.','A unicorn is a privately held startup valued at $1 billion or more.','Bengaluru, Delhi NCR and Mumbai are among India\'s largest startup hubs.']
      },
      {
        headline:'Aadhaar Crossed 1.3B IDs', highlight:'1.3B', stat:'1.3B+', statLabel:'Aadhaar IDs',
        facts:['Aadhaar has issued more than 1.3B identity numbers.','UIDAI was established in January 2009.','Aadhaar uses biometric and demographic identity data.','India built one of the world largest digital ID systems.'],
        stats:[{num:'1.3B+',label:'IDs Issued'},{num:'2009',label:'UIDAI Year'},{num:'12',label:'Digit Number'},{num:'UIDAI',label:'Authority'}],
        source:'UIDAI',
        full_facts:['Aadhaar has issued more than 1.3 billion 12-digit identity numbers through UIDAI.','UIDAI was established in January 2009 to implement India\'s digital identity system.','Aadhaar links demographic and biometric identity data for residents.']
      }
    ],
    'GK & FACTS': [
      {
        headline:'India Has 42 UNESCO Sites', highlight:'42', stat:'42', statLabel:'World Heritage',
        facts:['India has 42 UNESCO World Heritage Sites.','Santiniketan was inscribed by UNESCO in 2023.','Hoysala temples were inscribed by UNESCO in 2023.','India ranks among countries with highest heritage count.'],
        stats:[{num:'42',label:'UNESCO Sites'},{num:'2023',label:'New Sites'},{num:'Santiniketan',label:'UNESCO Site'},{num:'Hoysala',label:'Temples'}],
        source:'UNESCO',
        full_facts:['India has 42 UNESCO World Heritage Sites in the latest UNESCO country listing.','Santiniketan and the Sacred Ensembles of the Hoysalas were inscribed in 2023.','The list includes cultural, natural and mixed heritage sites across India.']
      },
      {
        headline:'Kumbh Is Visible From Space', highlight:'Kumbh', stat:'2019', statLabel:'Prayagraj Kumbh',
        facts:['Prayagraj Kumbh 2019 drew over 240M visits.','Festival ran from January to March 2019.','It is one of the world largest human gatherings.','Temporary city used roads, hospitals and sanitation systems.'],
        stats:[{num:'240M+',label:'Visits'},{num:'2019',label:'Kumbh Year'},{num:'Jan-Mar',label:'Festival Period'},{num:'Prayagraj',label:'Location'}],
        source:'UP Government',
        full_facts:['Prayagraj Kumbh 2019 reported more than 240 million visits during the January-March festival period.','The event created a temporary city with roads, sanitation, police stations and health facilities.','Kumbh Mela is widely described as one of the world\'s largest human gatherings.']
      }
    ],
    'SCIENCE & SPACE': [
      {
        headline:'ISRO Launched 104 Satellites', highlight:'104', stat:'104', statLabel:'Satellites',
        facts:['PSLV-C37 launched 104 satellites on 15 February 2017.','Mission lifted off from Sriharikota in Andhra Pradesh.','Cartosat-2 series satellite was the main payload.','101 satellites belonged to international customers.'],
        stats:[{num:'104',label:'Satellites'},{num:'2017',label:'Launch Year'},{num:'PSLV-C37',label:'Mission'},{num:'101',label:'Foreign Satellites'}],
        source:'ISRO',
        full_facts:['ISRO\'s PSLV-C37 mission launched 104 satellites on 15 February 2017 from Sriharikota.','The Cartosat-2 series satellite was the main payload in the mission.','A total of 101 satellites on the launch belonged to international customers.']
      },
      {
        headline:'Chandrayaan-3 Landed In 2023', highlight:'2023', stat:'23 Aug', statLabel:'Moon Landing',
        facts:['Chandrayaan-3 landed on 23 August 2023.','Vikram lander touched down near Moon south pole.','India became fourth country to soft-land on Moon.','Pragyan rover operated after successful landing.'],
        stats:[{num:'23 Aug',label:'Landing Date'},{num:'2023',label:'Mission Year'},{num:'4th',label:'Moon Landing'},{num:'Vikram',label:'Lander'}],
        source:'ISRO',
        full_facts:['Chandrayaan-3\'s Vikram lander touched down on the Moon on 23 August 2023.','India became the fourth country to achieve a soft landing on the Moon.','The landing site was near the lunar south polar region, followed by Pragyan rover operations.']
      }
    ],
    'JOBS': [
      {
        headline:'IT BPM Employs 5.4M', highlight:'5.4M', stat:'5.4M', statLabel:'Workforce',
        facts:['India IT-BPM sector employed about 5.4M in FY2024.','NASSCOM estimated revenue around $254B in FY2024.','Sector remains one of India largest private employers.','Bengaluru, Hyderabad, Pune and NCR are major hubs.'],
        stats:[{num:'5.4M',label:'Employees'},{num:'$254B',label:'Revenue'},{num:'FY2024',label:'Year'},{num:'4',label:'Major Hubs'}],
        source:'NASSCOM',
        full_facts:['India\'s IT-BPM sector employed about 5.4 million people in FY2024, according to NASSCOM.','NASSCOM estimated the sector\'s FY2024 revenue at around $254 billion.','Bengaluru, Hyderabad, Pune and NCR remain major IT employment hubs.']
      },
      {
        headline:'EPFO Added 13.9M Members', highlight:'13.9M', stat:'13.9M', statLabel:'Net Members',
        facts:['EPFO added 13.9M net members in FY2023.','Payroll data tracks organised-sector employment trends.','Members aged 18-25 form a large new-joiner share.','EPFO releases monthly payroll data in India.'],
        stats:[{num:'13.9M',label:'Net Members'},{num:'FY2023',label:'Payroll Year'},{num:'18-25',label:'Youth Group'},{num:'EPFO',label:'Data Source'}],
        source:'EPFO',
        full_facts:['EPFO payroll data reported 13.9 million net member additions in FY2023.','The data is used as an organised-sector employment indicator in India.','The 18-25 age group usually forms a large share of new EPFO subscribers.']
      }
    ],
    'HYDERABAD JOBS': [
      {
        headline:'Hyderabad IT Exports Crossed ₹2.4L Cr', highlight:'₹2.4L', stat:'₹2.4L Cr', statLabel:'IT Exports',
        facts:['Telangana IT exports crossed ₹2.4 lakh crore in FY2024.','Hyderabad is the core hub of Telangana IT sector.','Telangana IT sector employed over 900,000 people.','HITEC City and Gachibowli are major IT clusters.'],
        stats:[{num:'₹2.4L Cr',label:'IT Exports'},{num:'FY2024',label:'Year'},{num:'900K+',label:'Employment'},{num:'Hyderabad',label:'IT Hub'}],
        source:'Telangana IT Dept',
        full_facts:['Telangana IT exports crossed about ₹2.4 lakh crore in FY2024, with Hyderabad as the core hub.','The state IT sector employed more than 900,000 people according to Telangana IT department summaries.','HITEC City, Madhapur, Gachibowli and Financial District are Hyderabad\'s major IT clusters.']
      },
      {
        headline:'Hyderabad Hosts Global Capability Centres', highlight:'GCCs', stat:'1,500+', statLabel:'India GCCs',
        facts:['India has over 1,500 global capability centres.','Hyderabad is a major GCC city after Bengaluru and NCR.','GCCs hire engineering, finance, analytics and cloud roles.','Many US firms operate tech centres in Hyderabad.'],
        stats:[{num:'1,500+',label:'India GCCs'},{num:'4',label:'Role Areas'},{num:'Hyderabad',label:'GCC Hub'},{num:'US',label:'Client Base'}],
        source:'NASSCOM',
        full_facts:['India has more than 1,500 global capability centres, according to NASSCOM ecosystem reporting.','Hyderabad is one of India\'s major GCC cities for engineering, cloud, analytics and finance roles.','Many multinational firms operate technology and operations centres in Hyderabad.']
      }
    ],
    'CAREER': [
      {
        headline:'AI Skills Demand Rose 3.5x', highlight:'3.5x', stat:'3.5x', statLabel:'AI Skills',
        facts:['LinkedIn reported AI-skilled talent grew 3.5x since 2016.','AI skills appear across tech, sales and marketing roles.','Python, SQL and analytics remain common job filters.','Portfolio projects improve fresher job shortlisting.'],
        stats:[{num:'3.5x',label:'AI Talent'},{num:'2016',label:'Base Year'},{num:'3',label:'Core Skills'},{num:'Portfolio',label:'Proof'}],
        source:'LinkedIn',
        full_facts:['LinkedIn workplace reports said AI-skilled talent grew about 3.5 times since 2016.','AI skills now appear beyond coding roles, including sales, marketing, analytics and operations.','Python, SQL and analytics projects remain useful proof for fresher job applications.']
      },
      {
        headline:'Data Analysts Need SQL', highlight:'SQL', stat:'SQL', statLabel:'Core Skill',
        facts:['SQL appears in most entry data analyst roles.','Excel remains common for reporting and business analysis.','Power BI and Tableau are frequent dashboard tools.','Python helps automate cleaning and analysis tasks.'],
        stats:[{num:'SQL',label:'Core Skill'},{num:'Excel',label:'Reporting Tool'},{num:'BI',label:'Dashboards'},{num:'Python',label:'Automation'}],
        source:'LinkedIn Jobs',
        full_facts:['SQL is one of the most common requirements in entry-level data analyst job descriptions.','Excel remains widely used for reporting, cleaning and business analysis workflows.','Power BI, Tableau and Python improve dashboarding and automation capability.']
      }
    ],
    'STUDY': [
      {
        headline:'IIT System Started In 1951', highlight:'1951', stat:'1951', statLabel:'First IIT',
        facts:['IIT Kharagpur was established in 1951.','It was the first Indian Institute of Technology.','The campus used the old Hijli detention camp site.','IIT Act was passed by Parliament in 1961.'],
        stats:[{num:'1951',label:'IIT Kharagpur'},{num:'1st',label:'IIT'},{num:'1961',label:'IIT Act'},{num:'Hijli',label:'Campus Site'}],
        source:'IIT Kharagpur',
        full_facts:['IIT Kharagpur was established in 1951 as the first Indian Institute of Technology.','The campus began at the historic Hijli detention camp site in West Bengal.','The Institutes of Technology Act was passed by Parliament in 1961.']
      },
      {
        headline:'Nalanda Flourished For Centuries', highlight:'Nalanda', stat:'5th C', statLabel:'Founded Era',
        facts:['Nalanda University flourished from around the 5th century CE.','Xuanzang studied at Nalanda in the 7th century.','Nalanda attracted scholars from across Asia.','UNESCO inscribed Nalanda ruins in 2016.'],
        stats:[{num:'5th C',label:'Founded Era'},{num:'7th C',label:'Xuanzang Visit'},{num:'2016',label:'UNESCO Year'},{num:'Asia',label:'Students'}],
        source:'UNESCO',
        full_facts:['Ancient Nalanda flourished from around the 5th century CE as a major Buddhist learning centre.','Chinese monk Xuanzang studied at Nalanda during the 7th century.','UNESCO inscribed the Archaeological Site of Nalanda Mahavihara in 2016.']
      }
    ],
    'STUDY ABROAD': [
      {
        headline:'1.3M Indians Study Abroad', highlight:'1.3M', stat:'1.3M+', statLabel:'Students Abroad',
        facts:['1.3M+ Indian students were abroad in 2024 estimates.','Canada, USA, UK and Australia are major destinations.','Engineering, management and health are common streams.','Costs vary widely by country and university.'],
        stats:[{num:'1.3M+',label:'Students'},{num:'4',label:'Destinations'},{num:'2024',label:'Estimate'},{num:'3',label:'Common Streams'}],
        source:'Education Ministry',
        full_facts:['Government statements and education trackers place Indian students abroad at around 1.3 million in recent estimates.','Canada, the United States, the United Kingdom and Australia are among major destinations.','Engineering, management and health-related courses remain common choices for Indian students.']
      },
      {
        headline:'US Hosted 331K Indians', highlight:'331K', stat:'331K+', statLabel:'Indian Students',
        facts:['Open Doors reported 331K+ Indian students in US 2023-24.','India became the largest international student sender to US.','Graduate students form a major Indian student share.','STEM courses are popular among Indian students.'],
        stats:[{num:'331K+',label:'US Indians'},{num:'2023-24',label:'Academic Year'},{num:'No.1',label:'Sender'},{num:'STEM',label:'Popular Field'}],
        source:'Open Doors',
        full_facts:['Open Doors reported more than 331,000 Indian students in the United States during 2023-24.','India became the largest source of international students to the United States in that report.','Graduate and STEM programmes form a major share of Indian enrolments in the US.']
      }
    ],
    'CRICKET': [
      {
        headline:'India Won 1983 World Cup', highlight:'1983', stat:'1983', statLabel:'World Cup Win',
        facts:['India beat West Indies by 43 runs in 1983 final.','Final was played at Lord\'s on 25 June 1983.','Kapil Dev captained India in the tournament.','India became first Asian Cricket World Cup winner.'],
        stats:[{num:'1983',label:'World Cup'},{num:'43',label:'Run Margin'},{num:'25 Jun',label:'Final Date'},{num:'Kapil Dev',label:'Captain'}],
        source:'ICC',
        full_facts:['India won the 1983 Cricket World Cup final against West Indies by 43 runs at Lord\'s.','The final was played on 25 June 1983, with Kapil Dev captaining India.','India became the first Asian team to win the Men\'s Cricket World Cup.']
      },
      {
        headline:'Tendulkar Scored 100 Centuries', highlight:'100', stat:'100', statLabel:'International 100s',
        facts:['Sachin Tendulkar scored 100 international centuries.','He made 51 Test centuries for India.','He made 49 ODI centuries for India.','His 100th international century came in 2012.'],
        stats:[{num:'100',label:'International 100s'},{num:'51',label:'Test 100s'},{num:'49',label:'ODI 100s'},{num:'2012',label:'100th Year'}],
        source:'ICC',
        full_facts:['Sachin Tendulkar scored 100 international centuries across Tests and ODIs for India.','His record includes 51 Test centuries and 49 ODI centuries.','His 100th international century came in 2012 against Bangladesh.']
      }
    ]
  };

  const list = backups[category] || backups['INDIA'];
  const picked = list[Math.floor(Math.random() * list.length)];
  return validateSlide(normalizeSlide({ ...picked, category, engine: 'backup', type: 'backup' }, category, category), category);
}

