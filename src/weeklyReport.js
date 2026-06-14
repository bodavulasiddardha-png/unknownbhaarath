import 'dotenv/config';
import { buildWeeklyReport } from './analytics.js';
import { notify } from './telegram.js';
import fs from 'fs';
import path from 'path';

const PREF_FILE = path.resolve('topic_preferences.json');

async function run() {
  const report = await buildWeeklyReport();
  if (!report) {
    await notify('📊 <b>Weekly Report</b>\n\nNo posts in the last 7 days yet.');
    return;
  }

  const top = report.topCategories.map((c, i) =>
    `${i + 1}. ${c.cat} — ${Math.round(c.score)} avg (${c.posts} posts, ${c.likes}❤️ ${c.saves}🔖)`
  ).join('\n');

  const msg =
    `📊 <b>Unknown Bhaarath — Weekly Report</b>\n\n` +
    `📅 Last 7 days: ${report.postCount} posts\n` +
    `❤️ Likes: ${report.totalLikes}\n` +
    `💬 Comments: ${report.totalComments}\n` +
    `👁️ Reach: ${report.totalReach}\n` +
    `🔖 Saves: ${report.totalSaves}\n\n` +
    `<b>🏆 Top performing categories:</b>\n${top}\n\n` +
    `The bot will favor top categories next week.`;

  console.log(msg.replace(/<\/?b>/g, ''));
  await notify(msg);

  // Save preferences so the generator can weight toward winners (closes the learning loop)
  const prefs = {
    updated: new Date().toISOString(),
    favored: report.topCategories.map(c => c.cat),
    weak: report.weakCategories.map(c => c.cat),
  };
  try { fs.writeFileSync(PREF_FILE, JSON.stringify(prefs, null, 2)); } catch {}
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
