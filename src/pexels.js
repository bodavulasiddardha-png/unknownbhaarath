import axios from 'axios';

// Category → Pexels search query
const CAT_QUERY = {
  'INDIA': 'india new delhi parliament',
  'INDIA & WORLD': 'world globe diplomacy',
  'GLOBAL': 'earth from space',
  'TECHNOLOGY': 'technology abstract blue',
  'GK & FACTS': 'india heritage monument',
  'SCIENCE & SPACE': 'galaxy space stars',
  'JOBS': 'city skyline office night',
  'CAREER': 'modern office workspace',
  'STUDY ABROAD': 'university campus building',
};

// Returns a direct image URL for the category, or null
export async function getBackgroundUrl(category) {
  const key = process.env.PEXELS_API_KEY;
  const query = CAT_QUERY[category] || 'india';

  if (!key) return null;

  try {
    const res = await axios.get('https://api.pexels.com/v1/search', {
      headers: { Authorization: key },
      params: { query, per_page: 8, orientation: 'portrait' },
      timeout: 10000,
    });
    const photos = res.data.photos || [];
    if (photos.length === 0) return null;
    // Pick a random photo from results for variety
    const photo = photos[Math.floor(Math.random() * photos.length)];
    return photo.src.large2x || photo.src.large || photo.src.original;
  } catch (e) {
    console.warn('[Pexels] failed:', e.message);
    return null;
  }
}
