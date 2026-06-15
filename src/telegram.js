import axios from 'axios';
 
// Escape HTML special chars so news headlines / errors containing
// <, >, & do not break Telegram's HTML parse_mode.
function escTg(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
 
export async function notify(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log('[Telegram] not configured, skipping:', message);
    return;
  }
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    });
  } catch (e) {
    console.warn('[Telegram] failed:', e.message);
  }
}
 
export async function notifySuccess(slot, slides, postId) {
  const topics = slides.map(s => {
    let tag = '';
    if (s.engine === 'backup') tag = ' ⚠️[backup]';
    else if (s.engine?.startsWith('claude-news')) tag = ' 📰[news]';
    else if (s.engine === 'groq+claude') tag = ' 🔮[unknown fact]';
    return `  • ${escTg(s.category)}: ${escTg(s.headline)}${tag}`;
  }).join('\n');
  const backupCount = slides.filter(s => s.engine === 'backup').length;
  const warn = backupCount > 0 ? `\n\n⚠️ ${backupCount} backup(s) used.` : '';
  await notify(
    `✅ <b>Posted Successfully!</b>\n\n` +
    `🕐 Slot: ${slot}\n` +
    `📊 Slides: ${slides.length}\n` +
    `🆔 Post: ${escTg(postId)}\n\n` +
    `<b>Content:</b>\n${topics}${warn}\n\n` +
    `🇮🇳 @unknownbhaarath`
  );
}
 
export async function notifyFailure(slot, error) {
  await notify(
    `❌ <b>Post Failed!</b>\n\n` +
    `🕐 Slot: ${slot}\n` +
    `⚠️ Error: ${escTg(error)}\n\n` +
    `Action needed — check token / API limits.`
  );
}
