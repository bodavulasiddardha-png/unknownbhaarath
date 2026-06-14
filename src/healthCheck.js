import 'dotenv/config';
import axios from 'axios';
import { testConnection, getTokenDaysLeft } from './instagram.js';
import { notify } from './telegram.js';
import { renderSlide, closeBrowser } from './imageRenderer.js';

async function check(name, fn) {
  try { await fn(); return `✓ ${name}`; }
  catch (e) { return `✗ ${name}: ${(e.message||'').substring(0,60)}`; }
}

async function run() {
  const results = [];

  results.push(await check('Instagram', async () => { await testConnection(); }));

  results.push(await check('Groq', async () => {
    await axios.post('https://api.groq.com/openai/v1/chat/completions',
      { model:'llama-3.3-70b-versatile', messages:[{role:'user',content:'hi'}], max_tokens:5 },
      { headers:{ Authorization:`Bearer ${process.env.GROQ_API_KEY}` } });
  }));

  results.push(await check('Claude API', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    await client.messages.create({
      model: 'claude-haiku-4-5', max_tokens: 5,
      messages: [{ role: 'user', content: 'hi' }],
    });
  }));

  results.push(await check('Pexels', async () => {
    await axios.get('https://api.pexels.com/v1/search?query=india&per_page=1',
      { headers:{ Authorization: process.env.PEXELS_API_KEY } });
  }));

  results.push(await check('Cloudinary', async () => {
    const { v2 } = await import('cloudinary');
    v2.config({ cloud_name:process.env.CLOUDINARY_CLOUD_NAME, api_key:process.env.CLOUDINARY_API_KEY, api_secret:process.env.CLOUDINARY_API_SECRET });
    await v2.api.ping();
  }));

  // Real slide generation test (Fix 4)
  results.push(await check('Slide rendering', async () => {
    const testSlide = {
      category: 'INDIA',
      headline: 'Health Check Test', highlight: 'Test',
      stat: 'OK', statLabel: 'system check',
      facts: ['This is a render test.', 'It confirms slides generate.', 'It is not posted anywhere.'],
      source: 'System',
    };
    const buf = await renderSlide(testSlide, 0, 1);
    await closeBrowser();
    if (!buf || buf.length < 1000) throw new Error('empty render');
  }));

  // Token expiry alert (Fix 5)
  let tokenLine = '';
  const days = await getTokenDaysLeft();
  if (days !== null) {
    if (days <= 7) tokenLine = `\n\n⚠️ <b>Instagram token expires in ${days} days!</b> Renew it soon.`;
    else tokenLine = `\n\n🔑 Token valid for ~${days} more days.`;
  }

  const allOk = results.every(r => r.startsWith('✓'));
  const report = `🩺 <b>Unknown Bhaarath — Health Check</b>\n\n${results.join('\n')}${tokenLine}`;
  console.log(report.replace(/<\/?b>/g,''));

  // Only notify if something is wrong OR token expiring — avoid daily noise when all good
  if (!allOk || (days !== null && days <= 7)) {
    await notify(report);
  } else {
    // Send a brief OK once (optional). Comment out next line to stay fully silent when healthy.
    await notify(report);
  }
  process.exit(allOk ? 0 : 1);
}

run();
