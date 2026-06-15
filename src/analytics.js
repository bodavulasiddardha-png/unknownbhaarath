import axios from 'axios';

const BASE = process.env.IG_API_BASE || 'https://graph.facebook.com/v21.0';
const ACCOUNT = () => process.env.INSTAGRAM_ACCOUNT_ID;
const TOKEN = () => process.env.INSTAGRAM_ACCESS_TOKEN;

// Fetch recent media with their performance
export async function getRecentPerformance(limit = 21) {
  try {
    const res = await axios.get(`${BASE}/${ACCOUNT()}/media`, {
      params: {
        fields: 'id,caption,media_type,timestamp,like_count,comments_count,permalink',
        limit,
        access_token: TOKEN(),
      },
      timeout: 12000,
    });
    return res.data.data || [];
  } catch (e) {
    console.warn('[Analytics] fetch failed:', e.response?.data?.error?.message || e.message);
    return [];
  }
}

// Fetch insights (reach, saves) for a single media item.
// Instagram renamed 'saved' → 'saves'; 'shares' is not always supported on
// carousels. We request the safe metrics and tolerate partial failures.
export async function getMediaInsights(mediaId) {
  try {
    const res = await axios.get(`${BASE}/${mediaId}/insights`, {
      params: { metric: 'reach,saves', access_token: TOKEN() },
      timeout: 10000,
    });
    const out = {};
    (res.data.data || []).forEach(m => { out[m.name] = m.values?.[0]?.value || 0; });
    // Normalise so callers can read either name
    if (out.saves == null && out.saved != null) out.saves = out.saved;
    return out;
  } catch (e) {
    return {};
  }
}

// Detect category from a caption's hashtags / first line
function detectCategory(caption = '') {
  const c = caption.toLowerCase();
  if (c.includes('isro') || c.includes('space') || c.includes('science')) return 'SCIENCE';
  if (c.includes('job') || c.includes('career') || c.includes('salary')) return 'JOBS';
  if (c.includes('study') || c.includes('abroad') || c.includes('visa')) return 'STUDY ABROAD';
  if (c.includes('tech') || c.includes('startup') || c.includes('ai')) return 'TECHNOLOGY';
  if (c.includes('gdp') || c.includes('economy') || c.includes('rbi')) return 'INDIA';
  return 'OTHER';
}

// Build a weekly report: which categories perform best
export async function buildWeeklyReport() {
  const media = await getRecentPerformance(21);
  if (media.length === 0) return null;

  const oneWeekAgo = Date.now() - 7 * 86400 * 1000;
  const recent = media.filter(m => new Date(m.timestamp).getTime() > oneWeekAgo);

  let totalLikes = 0, totalComments = 0, totalReach = 0, totalSaves = 0;
  const byCategory = {};

  for (const m of recent) {
    const insights = await getMediaInsights(m.id);
    const likes = m.like_count || 0;
    const comments = m.comments_count || 0;
    const reach = insights.reach || 0;
    const saves = insights.saves || insights.saved || 0;

    totalLikes += likes; totalComments += comments;
    totalReach += reach; totalSaves += saves;

    const cat = detectCategory(m.caption);
    if (!byCategory[cat]) byCategory[cat] = { posts: 0, likes: 0, saves: 0, reach: 0 };
    byCategory[cat].posts++;
    byCategory[cat].likes += likes;
    byCategory[cat].saves += saves;
    byCategory[cat].reach += reach;
  }

  // Rank categories by avg engagement (likes + saves*2)
  const ranked = Object.entries(byCategory)
    .map(([cat, d]) => ({ cat, score: (d.likes + d.saves * 2) / Math.max(d.posts, 1), ...d }))
    .sort((a, b) => b.score - a.score);

  return {
    postCount: recent.length,
    totalLikes, totalComments, totalReach, totalSaves,
    topCategories: ranked.slice(0, 3),
    weakCategories: ranked.slice(-2).reverse(),
  };
}
