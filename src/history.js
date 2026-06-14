import fs from 'fs';
import path from 'path';

const HISTORY_FILE = path.resolve('posted_history.json');
const MAX_HISTORY = 200;

export function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return [];
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Levenshtein distance
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// Similarity ratio 0-1 based on edit distance
function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export function isDuplicate(headline, history) {
  const norm = normalize(headline);
  return history.some(h => {
    const hn = normalize(h);
    if (hn === norm) return true;
    // 88%+ similar = duplicate. "India GDP Hits 4T" vs "5T" stays distinct (~94% similar
    // BUT only 1 char differs over ~14 chars → 93% — so we use a high threshold AND
    // require the headlines to not differ only by a number).
    const sim = similarity(hn, norm);
    if (sim >= 0.92) {
      // If the only difference is digits, treat as DISTINCT (different stat = different fact)
      const stripDigits = s => s.replace(/[0-9]/g, '');
      if (stripDigits(hn) === stripDigits(norm) && hn !== norm) return false;
      return true;
    }
    return false;
  });
}

export function addToHistory(headlines, history) {
  const updated = [...headlines, ...history].slice(0, MAX_HISTORY);
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(updated, null, 2));
  } catch (e) {
    console.warn('[History] could not write:', e.message);
  }
  return updated;
}
