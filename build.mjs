#!/usr/bin/env node
/*
 * Cross-platform build: Marp PDF + animated HTML, in one Node script.
 * No bash, no Python — works the same on Windows (PowerShell), macOS, Linux, WSL.
 * The only requirement is Node.js (which Marp already needs).
 *
 * Usage:
 *   node build.mjs [path/to/slides.md]   (defaults to ./slides.md)
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(process.argv[2] || join(here, 'slides.md'));
const theme = join(here, 'theme.css');

if (!existsSync(src)) {
  console.error(`✗ Markdown not found: ${src}\n`);
  console.error('  Pass a slides file, e.g.:  node build.mjs examples/slides.md');
  console.error('  Or create ./slides.md with front-matter:');
  console.error('    ---\n    marp: true\n    size: 16:9\n    paginate: false\n    theme: erm\n    ---');
  console.error('  See examples/slides.md and the README for the class system.');
  process.exit(1);
}

const pdf = src.replace(/\.md$/i, '.pdf');
const html = src.replace(/\.md$/i, '.html');

// GSAP entrance animation, injected into the built HTML (PDF is left untouched).
const SENTINEL = '<!-- gsap-anim-injected -->';
const INJECTION = `
${SENTINEL}
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script>
(function () {
  if (typeof gsap === 'undefined') return;
  const ANIMATED = new WeakSet();
  function animateSection(section) {
    const targets = section.querySelectorAll(
      'h1, h2, h3, blockquote, .lead, .credo, .kicker, .meta, .tail, ' +
      '.hdr, .ftr, ul > li, ol > li, table, pre'
    );
    if (!targets.length) return;
    gsap.killTweensOf(targets);
    gsap.set(targets, { clearProps: 'opacity,transform,x,y' });
    gsap.from(targets, {
      opacity: 0, y: 28, duration: 0.7, stagger: 0.09,
      ease: 'power3.out', clearProps: 'opacity,transform,x,y'
    });
  }
  function animateWrapper(wrapper, opts) {
    opts = opts || {};
    if (!opts.force && ANIMATED.has(wrapper)) return;
    ANIMATED.add(wrapper);
    // A slide can hold more than one <section>: marp's full-bleed background
    // images (![bg ...]) insert a background section *before* the content one.
    // Animate every section — animateSection() no-ops on those with no targets,
    // so this keeps entrances working whether or not a slide uses a bg image.
    wrapper.querySelectorAll('section').forEach(animateSection);
  }
  function init() {
    const slides = document.querySelectorAll('.bespoke-marp-slide');
    if (!slides.length) return;
    const obs = new MutationObserver(muts => {
      muts.forEach(m => {
        if (m.attributeName !== 'class') return;
        const el = m.target;
        if (!el.classList.contains('bespoke-marp-slide')) return;
        if (el.classList.contains('bespoke-marp-active')) animateWrapper(el, { force: true });
      });
    });
    slides.forEach(s => obs.observe(s, { attributes: true, attributeFilter: ['class'] }));
    const initial = document.querySelector('.bespoke-marp-slide.bespoke-marp-active');
    if (initial) animateWrapper(initial, { force: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(init));
  } else {
    requestAnimationFrame(init);
  }
})();
</script>
`;

function marp(args) {
  // shell:true so `npx` resolves on Windows (npx.cmd) as well as Unix.
  execSync(`npx --yes @marp-team/marp-cli ${args}`, { stdio: 'inherit', shell: true });
}

function injectGsap(file) {
  let h = readFileSync(file, 'utf8');
  if (h.includes(SENTINEL)) { console.log('  GSAP already injected, skipping'); return; }
  if (!h.includes('</body>')) { console.error('  no </body> in HTML; skipping injection'); return; }
  writeFileSync(file, h.replace('</body>', INJECTION + '</body>'), 'utf8');
  console.log(`  injected GSAP motion into ${html}`);
}

// --- BudouX: phrase-aware Japanese line-breaking (optional dependency) ------
// Japanese has no spaces, so long lines either overflow (`word-break: keep-all`)
// or break mid-word (`overflow-wrap: anywhere`). BudouX inserts zero-width breaks
// (U+200B) at phrase boundaries, so text wraps at natural chunks. `word-break:
// auto-phrase` in theme.css does the same, but only in Chromium — BudouX extends
// it to Firefox/Safari and to the printed PDF. If `budoux` isn't installed, the
// build proceeds unchanged (so `node build.mjs` still works with zero installs).
const ZWSP = '​';
const BX_PROTECT = /(<!--[\s\S]*?-->|<strong>[\s\S]*?<\/strong>|\*\*[^*\n]+\*\*|&#?[A-Za-z0-9]+;|<\/?[A-Za-z][^>]*>|`[^`]*`|!?\[[^\]]*\]\([^)]*\))/;
const BX_PREFIX = /^(\s*(?:[-*+]\s+|#{1,6}\s+|>\s*|\d+\.\s+)?)([\s\S]*)$/;
const BX_JA = /[぀-ヿ㐀-鿿豈-﫿]/;
function budouxWrap(md, parse) {
  const wrapText = t => (BX_JA.test(t) ? parse(t).join(ZWSP) : t);
  const wrapContent = c => c.split(BX_PROTECT).map((p, i) => (i % 2 ? p : wrapText(p))).join('');
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  if (lines[0] && lines[0].trim() === '---') {            // front-matter: copy verbatim
    out.push(lines[0]); i = 1;
    for (; i < lines.length; i++) { out.push(lines[i]); if (lines[i].trim() === '---') { i++; break; } }
  }
  let inFence = false, fence = null, inComment = false;
  for (; i < lines.length; i++) {
    const line = lines[i], s = line.replace(/^\s+/, '');
    if (inComment) { out.push(line); if (line.includes('-->')) inComment = false; }
    else if (!inFence && (s.startsWith('```') || s.startsWith('~~~'))) { inFence = true; fence = s.slice(0, 3); out.push(line); }
    else if (inFence) { out.push(line); if (s.startsWith(fence)) { inFence = false; fence = null; } }
    else if (s.startsWith('<!--') && !line.includes('-->')) { inComment = true; out.push(line); }
    else { const m = BX_PREFIX.exec(line); out.push(m[1] + wrapContent(m[2])); }
  }
  return out.join('\n');
}

// Build from a temp copy with phrase-boundary ZWSP; keep the source .md untouched.
let buildSrc = src, budouxTemp = null;
try {
  const { loadDefaultJapaneseParser } = await import('budoux');
  const parser = loadDefaultJapaneseParser();
  budouxTemp = join(dirname(src), `.${basename(src, '.md')}.budoux.md`);
  writeFileSync(budouxTemp, budouxWrap(readFileSync(src, 'utf8'), t => parser.parse(t)), 'utf8');
  buildSrc = budouxTemp;
  console.log('  BudouX: phrase-aware Japanese line-breaks enabled');
} catch {
  console.log('  (tip) run `npm i budoux` for phrase-aware Japanese line-breaks');
}

// 1) HTML first. The animated HTML is the star deliverable and needs NO browser,
//    so it always succeeds — even on locked-down machines where Chrome can't launch.
console.log(`[1/3] ${html}  (browser, animated)`);
marp(`--html --allow-local-files --theme "${theme}" "${buildSrc}" -o "${html}"`);
console.log('[2/3] inject GSAP motion');
injectGsap(html);

// 2) PDF last. It needs a headless browser (Chrome/Edge/Firefox), which some
//    OS/security setups block. Isolate it so a PDF failure NEVER costs you the HTML.
let pdfOk = false;
console.log(`[3/3] ${pdf}  (print / share — needs a browser)`);
try {
  marp(`--pdf --allow-local-files --theme "${theme}" "${buildSrc}" -o "${pdf}"`);
  pdfOk = true;
} catch {
  console.error('\n⚠ PDF skipped: Marp could not launch a browser to render the PDF.');
  console.error('  Your animated HTML was still created — that is the main deliverable.');
  console.error('  To also get the PDF, either:');
  console.error('   • install Google Chrome / Microsoft Edge (Marp auto-detects them), or');
  console.error(`   • open ${html} in a browser and use Print → Save as PDF.`);
}

if (budouxTemp) { try { unlinkSync(budouxTemp); } catch { /* already gone */ } }

console.log('\n✓ Done.');
console.log(`  - ${html}  : open in a browser for the animated version (always built)`);
console.log(pdfOk ? `  - ${pdf}   : static PDF` : `  - ${pdf}   : (skipped — see the note above)`);
console.log('  - Tweak theme.css (:root) to restyle, then rebuild.');
