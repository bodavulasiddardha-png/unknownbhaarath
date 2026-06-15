import axios from 'axios';

// Your token came from Instagram Business Login → use graph.instagram.com
// Default uses Meta Graph API for Instagram Business/Creator accounts
const BASE = process.env.IG_API_BASE || 'https://graph.facebook.com/v21.0';
const ACCOUNT = () => process.env.INSTAGRAM_ACCOUNT_ID;
const TOKEN = () => process.env.INSTAGRAM_ACCESS_TOKEN;

function getErrorMessage(e) {
  return e.response?.data?.error?.message || e.message || String(e);
}

function isTokenError(msg) {
  return /access token|session has expired|token expired|OAuthException/i.test(msg);
}

async function withRetry(fn, label, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = getErrorMessage(e);
      console.warn(`[IG] ${label} attempt ${i + 1}/${tries} failed: ${msg}`);

      if (isTokenError(msg)) {
        throw new Error('Instagram token expired/invalid. Generate a new INSTAGRAM_ACCESS_TOKEN and update .env');
      }

      if (i < tries - 1) await new Promise(r => setTimeout(r, 3000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function createItemContainer(imageUrl) {
  return withRetry(async () => {
    const res = await axios.post(`${BASE}/${ACCOUNT()}/media`, {
      image_url: imageUrl,
      is_carousel_item: true,
      access_token: TOKEN(),
    });
    return res.data.id;
  }, 'createItem');
}

async function createCarouselContainer(childIds, caption) {
  return withRetry(async () => {
    const res = await axios.post(`${BASE}/${ACCOUNT()}/media`, {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: TOKEN(),
    });
    return res.data.id;
  }, 'createCarousel');
}

async function waitForReady(containerId) {
  for (let i = 0; i < 12; i++) {
    try {
      const res = await axios.get(`${BASE}/${containerId}`, {
        params: { fields: 'status_code', access_token: TOKEN() },
      });
      if (res.data.status_code === 'FINISHED') return true;
      if (res.data.status_code === 'ERROR') {
        throw new Error('Instagram container processing error');
      }
      // IN_PROGRESS / EXPIRED → keep polling
    } catch (e) {
      // Only swallow transient network errors; re-throw real container errors
      if (e.message?.includes('container processing')) throw e;
    }
    await new Promise(r => setTimeout(r, 4000));
  }
  // After ~48s still not FINISHED — proceed but warn (publish will error if truly not ready)
  console.warn('[IG] container not confirmed FINISHED after timeout — attempting publish anyway');
  return false;
}

async function publish(creationId) {
  return withRetry(async () => {
    const res = await axios.post(`${BASE}/${ACCOUNT()}/media_publish`, {
      creation_id: creationId,
      access_token: TOKEN(),
    });
    return res.data.id;
  }, 'publish');
}

export async function postCarousel(imageUrls, caption) {
  if (!Array.isArray(imageUrls) || imageUrls.length < 2) {
    throw new Error('Instagram carousel needs at least 2 uploaded image URLs');
  }
  const childIds = [];
  for (const url of imageUrls) {
    childIds.push(await createItemContainer(url));
  }
  const carouselId = await createCarouselContainer(childIds, caption);
  await waitForReady(carouselId);
  return await publish(carouselId);
}

export async function testConnection() {
  const res = await axios.get(`${BASE}/${ACCOUNT()}`, {
    params: { fields: 'id,username,media_count', access_token: TOKEN() },
  });
  return res.data;
}

// Check how many days until the access token expires.
// Works for Facebook-login tokens via the debug_token endpoint (needs an app
// token), and falls back to the ig_refresh endpoint for Instagram-login tokens.
// Returns days remaining, or null if it genuinely can't be determined.
export async function getTokenDaysLeft() {
  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;

  // Preferred: debug_token (Facebook-login long-lived tokens)
  if (appId && appSecret) {
    try {
      const res = await axios.get(`${BASE}/debug_token`, {
        params: {
          input_token: TOKEN(),
          access_token: `${appId}|${appSecret}`,
        },
        timeout: 10000,
      });
      const expiresAt = res.data?.data?.expires_at; // unix seconds, 0 = never
      if (expiresAt && expiresAt > 0) {
        const secsLeft = expiresAt - Math.floor(Date.now() / 1000);
        return Math.max(0, Math.floor(secsLeft / 86400));
      }
      // expires_at 0 means a non-expiring token — report a large number
      if (expiresAt === 0) return 9999;
    } catch (e) {
      console.warn('[IG] debug_token check failed:', e.response?.data?.error?.message || e.message);
    }
  }

  // Fallback: ig_refresh_token (Instagram-login tokens only)
  try {
    const res = await axios.get(`${BASE}/refresh_access_token`, {
      params: { grant_type: 'ig_refresh_token', access_token: TOKEN() },
      timeout: 10000,
    });
    if (res.data.expires_in) {
      return Math.floor(res.data.expires_in / 86400);
    }
  } catch (e) {
    // Endpoint differs for Facebook-login tokens; ignore quietly
  }
  return null;
}

// Self-healing: refresh the long-lived token (works for Instagram-login tokens
// after 24h of being issued). Returns the new token or null.
export async function refreshToken() {
  try {
    const res = await axios.get(`${BASE}/refresh_access_token`, {
      params: { grant_type: 'ig_refresh_token', access_token: TOKEN() },
      timeout: 10000,
    });
    if (res.data.access_token) {
      return { token: res.data.access_token, expiresIn: res.data.expires_in };
    }
  } catch (e) {
    console.warn('[IG] token refresh failed:', e.response?.data?.error?.message || e.message);
  }
  return null;
}
