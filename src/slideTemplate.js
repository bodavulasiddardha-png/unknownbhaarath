const CAT_COLORS = {
  'INDIA': '#FF9933',
  'INDIA & WORLD': '#4FC3F7',
  'GLOBAL': '#66BB6A',
  'TECHNOLOGY': '#CE93D8',
  'GK & FACTS': '#FFD54F',
  'SCIENCE & SPACE': '#4FC3F7',
  'JOBS': '#81C784',
  'HYDERABAD JOBS': '#81C784',
  'CAREER': '#FFCA28',
  'STUDY': '#4DD0E1',
  'STUDY ABROAD': '#4DD0E1',
  'CRICKET': '#00C853',
};

const ICONS = ['🔢','📍','👤','📅'];

function ashoka(color, size=52) {
  let spokes = '';
  for (let i = 0; i < 24; i++) {
    const a = (i * 15) * Math.PI / 180;
    const x1 = 50 + 10 * Math.cos(a), y1 = 50 + 10 * Math.sin(a);
    const x2 = 50 + 44 * Math.cos(a), y2 = 50 + 44 * Math.sin(a);
    spokes += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2"/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="46" fill="none" stroke="${color}" stroke-width="4"/>
    <circle cx="50" cy="50" r="10" fill="none" stroke="${color}" stroke-width="3"/>
    ${spokes}
  </svg>`;
}

export function buildSlideHTML(slide, index, total, bgUrl) {
  const accent = CAT_COLORS[slide.category] || '#FF9933';

  const bgCSS = bgUrl
    ? `background-image:url('${bgUrl}');background-size:cover;background-position:center;`
    : `background:radial-gradient(circle at 30% 60%,${accent}18 0%,transparent 55%),#060B22;`;

  // Headline with highlight
  let headlineHTML = (slide.headline || '');
  if (slide.highlight && headlineHTML.includes(slide.highlight)) {
    headlineHTML = headlineHTML.replace(
      slide.highlight,
      `<span style="color:${accent}">${slide.highlight}</span>`
    );
  }

  // Category breadcrumb
  const catDisplay = (slide.category || '').replace(' & ', ' • ');

  // Description: first full_fact or first fact
  const desc = (slide.full_facts?.[0]) || (slide.facts?.[0]) || '';

  // Badge
  const badgeHTML = slide.stat ? `
    <div style="display:inline-flex;align-items:center;gap:12px;
    border:2px solid ${accent}88;border-radius:12px;padding:12px 22px;width:fit-content;margin-top:24px;">
      <span style="color:${accent};font-size:24px;">◉</span>
      <span style="font-family:Sora;font-weight:800;font-size:26px;color:${accent};">${slide.stat}</span>
      <span style="font-size:18px;color:rgba(255,255,255,0.65);">${slide.statLabel || ''}</span>
    </div>` : '';

  // Right side stat cards (up to 4)
  const facts = slide.facts || [];
  const stats = slide.stats || [];
  const cardsHTML = facts.slice(0, 4).map((fact, i) => {
    const st = stats[i] || {};
    const icon = ICONS[i % ICONS.length];
    return `
    <div style="display:flex;gap:14px;align-items:flex-start;padding:14px 18px;
    background:rgba(255,255,255,0.06);border-radius:14px;
    border:1px solid rgba(255,255,255,0.08);border-left:4px solid ${accent}99;">
      <div style="width:50px;height:50px;border-radius:50%;border:2px solid ${accent}88;
      display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${icon}</div>
      <div style="min-width:0;">
        ${st.num ? `<div style="font-family:Sora;font-weight:900;font-size:30px;color:${accent};line-height:1;">${st.num}</div>` : ''}
        ${st.label ? `<div style="font-family:Sora;font-weight:700;font-size:17px;color:#fff;margin:2px 0;">${st.label}</div>` : ''}
        <div style="font-size:14px;color:rgba(176,184,212,0.8);line-height:1.35;">${fact}</div>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@700;800;900&family=Inter:wght@400;500&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:1080px;height:1080px;overflow:hidden;font-family:Inter,sans-serif;background:#060B22;}
</style></head><body>

<div style="position:absolute;inset:0;${bgCSS}filter:brightness(0.35) saturate(0.6) contrast(1.1);"></div>
<div style="position:absolute;inset:0;background:linear-gradient(110deg,rgba(4,8,24,0.97) 0%,rgba(4,8,24,0.82) 45%,rgba(4,8,24,0.65) 60%,rgba(4,8,24,0.90) 100%);"></div>
<div style="position:absolute;top:-80px;right:-60px;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,${accent}15 0%,transparent 70%);"></div>
<div style="position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,transparent,${accent},transparent);"></div>
<div style="position:absolute;top:-20px;right:-20px;opacity:0.05;">${ashoka(accent, 200)}</div>

<!-- TOP BAR -->
<div style="position:absolute;top:0;left:0;right:0;height:76px;
display:flex;align-items:center;justify-content:space-between;padding:0 52px;">
  <div>
    <div style="font-family:Sora;font-weight:700;font-size:18px;letter-spacing:3px;color:${accent};">${catDisplay}</div>
    <div style="width:42px;height:4px;background:${accent};border-radius:2px;margin-top:5px;"></div>
  </div>
  <div style="font-family:Sora;font-size:17px;color:rgba(255,255,255,0.3);font-weight:600;">${index+1} / ${total}</div>
</div>

<!-- LEFT: 0→530px -->
<div style="position:absolute;left:0;top:86px;width:526px;bottom:82px;
padding:18px 36px 18px 52px;display:flex;flex-direction:column;justify-content:flex-start;">
  <div style="font-family:Sora;font-weight:900;font-size:60px;line-height:1.02;
  color:#fff;letter-spacing:-1.5px;margin-bottom:18px;">${headlineHTML}</div>
  <div style="width:48px;height:5px;background:${accent};border-radius:3px;margin-bottom:20px;"></div>
  <div style="font-size:20px;line-height:1.55;color:rgba(255,255,255,0.80);font-weight:400;">${desc}</div>
  ${badgeHTML}
</div>

<!-- VERTICAL DIVIDER -->
<div style="position:absolute;left:534px;top:96px;bottom:96px;width:1px;background:rgba(255,255,255,0.10);"></div>

<!-- RIGHT: 542px→end -->
<div style="position:absolute;left:542px;right:0;top:82px;bottom:82px;
padding:14px 36px 14px 26px;display:flex;flex-direction:column;justify-content:space-evenly;gap:8px;">
  ${cardsHTML}
</div>

<!-- BOTTOM BAR -->
<div style="position:absolute;bottom:0;left:0;right:0;height:78px;
background:rgba(4,8,22,0.97);border-top:1px solid rgba(255,255,255,0.08);
display:flex;align-items:center;justify-content:space-between;padding:0 52px;">
  <div style="display:flex;align-items:center;gap:14px;">
    ${ashoka(accent, 42)}
    <div>
      <div style="font-family:Sora;font-weight:700;font-size:20px;color:#fff;">@unknownbhaarath</div>
      <div style="font-size:13px;color:${accent};font-weight:500;margin-top:1px;">Facts India never taught you</div>
    </div>
  </div>
  <div style="font-family:Sora;font-size:16px;font-weight:600;color:rgba(255,255,255,0.55);">
    Source: <b style="color:#fff;">${slide.source || 'Verified'}</b> • ${new Date().getFullYear()}
  </div>
</div>

</body></html>`;
}

export function buildCaption(slides, slot) {
  const hashtagSets = {
    morning: '#IndiaNews #CurrentAffairs #GK #Bharat #TheUnknownBhaarath #UnknownBhaarath #IndiaFacts #DidYouKnow #India #Knowledge',
    afternoon: '#ISRO #IndiaTech #ScienceFacts #SpaceFacts #TheUnknownBhaarath #UnknownBhaarath #IndiaFacts #DidYouKnow #India #Knowledge',
    evening: '#HyderabadJobs #CareerTips #StudyTips #ITjobs #TheUnknownBhaarath #UnknownBhaarath #IndiaFacts #DidYouKnow #India #Knowledge',
  };
  let caption = `${slides[0]?.headline || ''}\n\n`;
  slides.forEach(s => {
    caption += `${s.category || 'FACT'} — ${s.headline || ''}\n`;
    const details = (s.full_facts?.length > 0) ? s.full_facts : (s.facts || []);
    details.forEach(f => { caption += `▪ ${f}\n`; });
    caption += '\n';
  });
  caption += `Follow @unknownbhaarath for daily verified facts 🇮🇳\n\n`;
  caption += hashtagSets[slot] || hashtagSets.morning;
  return caption;
}
