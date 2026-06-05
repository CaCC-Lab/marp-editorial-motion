// Deterministic capture of the entrance animation across several slides into a
// frame sequence: each target slide plays its entrance (paused GSAP timeline
// progress 0→1), holds, then advances to the next — "flipping" one page at a
// time. Smooth and reproducible (no real-time polling).
//
// Usage: node scripts/capture_preview.js <slides.html> <outDir> [slides] [entrance] [hold]
//   slides   comma list of 1-based slide indices to flip through (default "1,2,3")
//   entrance frames for each fade-in (default 20)
//   hold     frames held on the full slide before turning (default 8)
// Requires: `npm i -D playwright` and a Chrome/Chromium.
//   default uses Playwright's `chrome` channel, or set CHROME_PATH=/path/to/chrome.

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const CHROME_PATH = process.env.CHROME_PATH || '';
const htmlPath = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3] || '/tmp/giframes');
const SLIDES = (process.argv[4] || '1,2,3').split(',').map(s => parseInt(s, 10));
const ENTRANCE = parseInt(process.argv[5] || '20', 10);
const HOLD = parseInt(process.argv[6] || '8', 10);

const TARGETS_SELECTOR =
  'h1, h2, h3, blockquote, .lead, .credo, .kicker, .meta, .tail, ' +
  '.hdr, .ftr, ul > li, ol > li, table, thead th, tbody tr, pre';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pad = (n) => String(n).padStart(3, '0');

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(CHROME_PATH ? { executablePath: CHROME_PATH } : { channel: 'chrome' }),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  await page.goto('file://' + htmlPath);

  // hide Bespoke on-screen controls so they never appear in frames
  await page.addStyleTag({ content: `
    .bespoke-marp-osc, [class*="bespoke-marp-osc"],
    .bespoke-marp-osd, .bespoke-progress-parent { display: none !important; opacity: 0 !important; }
  `});

  await page.waitForSelector('.bespoke-marp-slide.bespoke-marp-active section');
  await page.waitForFunction(() => typeof window.gsap !== 'undefined');
  await page.waitForTimeout(500);

  let current = 1;     // Bespoke starts on slide 1
  let frame = 0;

  for (const target of SLIDES) {
    while (current < target) { await page.keyboard.press('ArrowRight'); current++; await page.waitForTimeout(220); }
    while (current > target) { await page.keyboard.press('ArrowLeft'); current--; await page.waitForTimeout(220); }
    await page.waitForTimeout(650); // settle + let the auto entrance pass

    // build a PAUSED timeline that replays the entrance on the active section
    await page.evaluate((sel) => {
      const section = document.querySelector('.bespoke-marp-slide.bespoke-marp-active section');
      const t = section.querySelectorAll(sel);
      window.gsap.killTweensOf(t);
      const tl = window.gsap.timeline({ paused: true });
      tl.from(t, { opacity: 0, y: 28, duration: 0.7, stagger: 0.09, ease: 'power3.out' });
      window.__seek = (p) => tl.progress(p);
      window.__seek(0);
    }, TARGETS_SELECTOR);
    await page.waitForTimeout(150);

    for (let i = 0; i < ENTRANCE; i++) {
      const p = ENTRANCE === 1 ? 1 : i / (ENTRANCE - 1);
      await page.evaluate((p) => window.__seek(p), p);
      await page.screenshot({ path: path.join(outDir, `f_${pad(frame++)}.png`), clip: { x: 0, y: 0, width: 1280, height: 720 } });
    }
    for (let i = 0; i < HOLD; i++) {
      await page.screenshot({ path: path.join(outDir, `f_${pad(frame++)}.png`), clip: { x: 0, y: 0, width: 1280, height: 720 } });
    }
  }

  await browser.close();
  console.log(`captured ${frame} frames (slides ${SLIDES.join(',')}) into ${outDir}`);
})().catch((e) => { console.error(e); process.exit(1); });
