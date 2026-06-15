import puppeteer from 'puppeteer';
import { buildSlideHTML } from './slideTemplate.js';
import { getBackgroundUrl } from './pexels.js';

let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browser;
}

export async function renderSlide(slide, index, total) {
  const b = await getBrowser();
  const page = await b.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 });

  // Fetch a real background from Pexels for this category
  const bgUrl = await getBackgroundUrl(slide.category);

  const html = buildSlideHTML(slide, index, total, bgUrl);
  // domcontentloaded + fixed wait avoids hanging on slow Pexels background images
  // (networkidle0 would wait for every image and could hit the 30s timeout).
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));

  const buffer = await page.screenshot({ type: 'jpeg', quality: 92 });
  await page.close();
  return buffer;
}

export async function renderAll(slides) {
  const buffers = [];
  // Render each slide independently. If one slide fails, skip it instead of
  // killing the whole post — as long as 2+ slides survive, the carousel posts.
  for (let i = 0; i < slides.length; i++) {
    try {
      const buf = await renderSlide(slides[i], i, slides.length);
      if (buf && buf.length > 1000) buffers.push(buf);
      else console.warn(`[Render] slide ${i} produced empty buffer — skipping`);
    } catch (e) {
      console.warn(`[Render] slide ${i} failed: ${e.message} — skipping`);
    }
  }
  if (buffers.length < 2) {
    throw new Error(`Only ${buffers.length} slide(s) rendered — need at least 2 for a carousel`);
  }
  return buffers;
}

export async function closeBrowser() {
  if (browser) { await browser.close(); browser = null; }
}
