import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { gatherSlotContent } from './newsScraper.js';
import { generateSlide } from './aiGenerator.js';
import { renderAll, closeBrowser } from './imageRenderer.js';
import { uploadAll, cleanupOld } from './cloudinary.js';
import { postCarousel } from './instagram.js';
import { buildCaption } from './slideTemplate.js';
import { notifySuccess, notifyFailure } from './telegram.js';
import { loadHistory, isDuplicate, addToHistory } from './history.js';

function getCurrentIstSlot() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hourPart = parts.find(p => p.type === 'hour');
  const istHour = Number(hourPart?.value);

  if (Number.isNaN(istHour)) {
    throw new Error('Could not calculate IST hour for slot selection');
  }

  if (istHour >= 12 && istHour < 17) return 'afternoon';
  if (istHour >= 17) return 'evening';
  return 'morning';
}

function safeName(value = 'slide') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'slide';
}

function saveLocalBackup(buffers, slides, slot) {
  const day = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve('generated', day, slot);
  fs.mkdirSync(outDir, { recursive: true });

  buffers.forEach((buf, i) => {
    const slide = slides[i] || {};
    const file = `${String(i + 1).padStart(2, '0')}-${safeName(slide.category)}-${safeName(slide.headline)}.jpg`;
    fs.writeFileSync(path.join(outDir, file), buf);
  });
  console.log(`💾 Local backup saved: ${outDir}`);
}

function historyKey(slide) {
  return [slide.category, slide.headline, slide.source]
    .filter(Boolean)
    .join(' | ');
}

const SLOT = process.env.SLOT || getCurrentIstSlot();

async function run() {
  console.log(`\n🚀 Unknown Bhaarath — ${SLOT} slot starting...\n`);

  try {
    // 1. Gather: RSS + Tavily parallel per category
    console.log('📰 Gathering content (RSS + Tavily)...');
    const contentItems = await gatherSlotContent(SLOT);

    // 2. Generate slides
    console.log('\n🧠 Generating slides...');
    const history = loadHistory();
    const slides = [];

    for (const item of contentItems) {
      let slide = await generateSlide(item.category, item.topic, item.articles);

      // Duplicate check — category + headline + source makes repeat detection stronger.
      if (isDuplicate(historyKey(slide), history) || isDuplicate(slide.headline, history)) {
        console.log(`   ↻ Duplicate detected — forcing unknown fact...`);
        slide = await generateSlide(item.category, item.topic, []);
      }
      slides.push(slide);
    }

    // 3. Render
    console.log('\n🎨 Rendering slides...');
    const buffers = await renderAll(slides);
    await closeBrowser();
    saveLocalBackup(buffers, slides, SLOT);

    // 4. Upload
    console.log('☁️  Uploading to Cloudinary...');
    const urls = await uploadAll(buffers);
    if (!Array.isArray(urls) || urls.length !== buffers.length || urls.some(u => !u)) {
      throw new Error(`Cloudinary upload failed: expected ${buffers.length} images, got ${urls?.length || 0}`);
    }

    // 5. Post
    console.log('📤 Posting to Instagram...');
    const caption = buildCaption(slides, SLOT);
    const postId = await postCarousel(urls, caption);

    // 6. Save + notify
    addToHistory(slides.map(historyKey), history);
    console.log(`\n✅ Done! Post ID: ${postId}\n`);
    await notifySuccess(SLOT, slides, postId);
    await cleanupOld();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ FAILED:', err.message);
    await closeBrowser();
    await notifyFailure(SLOT, err.message);
    process.exit(1);
  }
}

run();
