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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
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
    const section = wrapper.querySelector('section');
    if (section) animateSection(section);
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

console.log(`[1/3] ${pdf}  (print / share)`);
marp(`--pdf  --allow-local-files --theme "${theme}" "${src}" -o "${pdf}"`);
console.log(`[2/3] ${html}  (browser)`);
marp(`--html --allow-local-files --theme "${theme}" "${src}" -o "${html}"`);
console.log('[3/3] inject GSAP motion');
injectGsap(html);

console.log('\n✓ Done.');
console.log(`  - ${pdf}   : static PDF`);
console.log(`  - ${html}  : open in a browser for the animated version`);
console.log('  - Tweak theme.css (:root) to restyle, then rebuild.');
