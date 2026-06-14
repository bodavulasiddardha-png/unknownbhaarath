import 'dotenv/config';
import fs from 'fs';
import { renderSlide, closeBrowser } from './imageRenderer.js';

// Sample slide to preview design without AI/posting
const sampleSlide = {
  category: 'SCIENCE & SPACE',
  headline: 'ISRO Launched 104 Satellites At Once',
  highlight: '104',
  stat: '104',
  statLabel: 'Satellites in one launch',
  facts: [
    'ISRO launched 104 satellites in a single mission on 15 February 2017 via PSLV-C37.',
    'This set a world record for the most satellites launched in one flight at the time.',
    'The mission carried 96 satellites from the USA among 7 countries total.',
  ],
  source: 'ISRO',
};

console.log('Rendering sample slide...');
const buffer = await renderSlide(sampleSlide, 0, 3);
fs.writeFileSync('preview.jpg', buffer);
await closeBrowser();
console.log('✅ Saved preview.jpg');
