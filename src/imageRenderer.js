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
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));

  const buffer = await page.screenshot({ type: 'jpeg', quality: 92 });
  await page.close();
  return buffer;
}

export async function renderAll(slides) {
  const buffers = [];
  for (let i = 0; i < slides.length; i++) {
    const buf = await renderSlide(slides[i], i, slides.length);
    buffers.push(buf);
  }
  return buffers;
}

export async function closeBrowser() {
  if (browser) { await browser.close(); browser = null; }
}
