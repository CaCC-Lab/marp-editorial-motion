// Deterministic capture of the entrance animation into a frame sequence.
// Drives a *paused* GSAP timeline (progress 0→1) and screenshots each step,
// so the result is smooth and reproducible (no real-time polling).
//
// Usage: node scripts/capture_preview.js <slides.html> <outDir> [slideIndex]
// Requires: `npm i -D playwright` and a Chrome/Chromium.
//   - by default uses Playwright's `chrome` channel
//   - or set CHROME_PATH=/path/to/chrome to use a system binary
// Then turn the frames into a GIF, e.g. with ffmpeg (see README).

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = process.env.CHROME_PATH || '';

const htmlPath = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3] || '/tmp/giframes');
const slideIndex = parseInt(process.argv[4] || '3', 10); // 1-based; 3 = "What you get"

const MOTION_FRAMES = 30;
const HOLD_FRAMES = 14;

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(CHROME_PATH ? { executablePath: CHROME_PATH } : { channel: 'chrome' }),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  await page.goto('file://' + htmlPath);

  // hide Bespoke on-screen controls / progress so they never appear in frames
  await page.addStyleTag({ content: `
    .bespoke-marp-osc, [class*="bespoke-marp-osc"],
    .bespoke-marp-osd, .bespoke-progress-parent { display: none !important; opacity: 0 !important; }
  `});

  // wait for bespoke + gsap
  await page.waitForSelector('.bespoke-marp-slide.bespoke-marp-active section');
  await page.waitForFunction(() => typeof window.gsap !== 'undefined');
  await page.waitForTimeout(500); // let Bespoke apply its fit transform

  // navigate to the target slide (press ArrowRight slideIndex-1 times)
  for (let i = 1; i < slideIndex; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(700); // let the auto entrance + scaling settle

  // build a PAUSED timeline that replays the entrance on the active section
  await page.evaluate(() => {
    const section = document.querySelector('.bespoke-marp-slide.bespoke-marp-active section');
    const targets = section.querySelectorAll(
      'h1, h2, h3, blockquote, .lead, .credo, .kicker, .meta, .tail, .hdr, .ftr, ul > li, ol > li, table, pre'
    );
    window.gsap.killTweensOf(targets);
    const tl = window.gsap.timeline({ paused: true });
    tl.from(targets, { opacity: 0, y: 28, duration: 0.7, stagger: 0.09, ease: 'power3.out' });
    window.__tl = tl;
    window.__seek = (p) => { tl.progress(p); };
    window.__seek(0);
  });

  await page.waitForTimeout(300); // settle at progress 0 before first frame

  let frame = 0;
  const pad = (n) => String(n).padStart(3, '0');

  for (let i = 0; i < MOTION_FRAMES; i++) {
    const p = i / (MOTION_FRAMES - 1);
    await page.evaluate((p) => window.__seek(p), p);
    await page.screenshot({ path: path.join(outDir, `f_${pad(frame++)}.png`), clip: { x: 0, y: 0, width: 1280, height: 720 } });
  }
  for (let i = 0; i < HOLD_FRAMES; i++) {
    await page.screenshot({ path: path.join(outDir, `f_${pad(frame++)}.png`), clip: { x: 0, y: 0, width: 1280, height: 720 } });
  }

  await browser.close();
  console.log(`captured ${frame} frames into ${outDir}`);
})().catch((e) => { console.error(e); process.exit(1); });
