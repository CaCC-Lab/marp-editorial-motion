#!/usr/bin/env python3
"""
Inject GSAP entrance animations into Marp's HTML output.

How it works:
- Marp's Bespoke runtime toggles `.bespoke-marp-active` on the active slide.
- A MutationObserver watches for that class and uses GSAP to fade/slide in the
  headings / lead / list items / tables / code blocks inside each <section>.

Only the HTML is touched; the PDF is untouched (Marp renders the PDF internally).
Idempotent: re-running on an already-injected file is a no-op.

Usage:
    python3 inject_gsap.py [path/to/slides.html]
If no path is given, defaults to ./slides.html next to this script.
"""

import sys
from pathlib import Path

SENTINEL = "<!-- gsap-anim-injected -->"

INJECTION = f"""
{SENTINEL}
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script>
(function () {{
  if (typeof gsap === 'undefined') return;

  // Bespoke marp DOM:
  //   <div class="bespoke-marp-parent">
  //     <div class="bespoke-marp-slide bespoke-marp-active"><section>...</section></div>
  //     <div class="bespoke-marp-slide">...</div>
  //   </div>
  // We watch .bespoke-marp-slide and animate the inner <section> children.

  const ANIMATED = new WeakSet();

  function animateSection(section) {{
    const targets = section.querySelectorAll(
      'h1, h2, h3, blockquote, .lead, .credo, .kicker, .meta, .tail, ' +
      '.hdr, .ftr, ul > li, ol > li, table, pre'
    );
    if (!targets.length) return;
    gsap.killTweensOf(targets);
    gsap.set(targets, {{ clearProps: 'opacity,transform,x,y' }});
    gsap.from(targets, {{
      opacity: 0,
      y: 28,
      duration: 0.7,
      stagger: 0.09,
      ease: 'power3.out',
      clearProps: 'opacity,transform,x,y'
    }});
  }}

  function animateWrapper(wrapper, opts) {{
    opts = opts || {{}};
    if (!opts.force && ANIMATED.has(wrapper)) return;
    ANIMATED.add(wrapper);
    const section = wrapper.querySelector('section');
    if (section) animateSection(section);
  }}

  function init() {{
    const slides = document.querySelectorAll('.bespoke-marp-slide');
    if (!slides.length) return;

    const obs = new MutationObserver(muts => {{
      muts.forEach(m => {{
        if (m.attributeName !== 'class') return;
        const el = m.target;
        if (!el.classList.contains('bespoke-marp-slide')) return;
        if (el.classList.contains('bespoke-marp-active')) {{
          animateWrapper(el, {{ force: true }});
        }}
      }});
    }});
    slides.forEach(s => obs.observe(s, {{ attributes: true, attributeFilter: ['class'] }}));

    const initial = document.querySelector('.bespoke-marp-slide.bespoke-marp-active');
    if (initial) {{
      animateWrapper(initial, {{ force: true }});
    }}
  }}

  if (document.readyState === 'loading') {{
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(init));
  }} else {{
    requestAnimationFrame(init);
  }}
}})();
</script>
"""


def main() -> int:
    if len(sys.argv) > 1:
        html_path = Path(sys.argv[1]).resolve()
    else:
        html_path = Path(__file__).resolve().parent / "slides.html"

    if not html_path.exists():
        print(f"not found: {html_path}", file=sys.stderr)
        return 1
    html = html_path.read_text(encoding="utf-8")
    if SENTINEL in html:
        print("already injected, nothing to do")
        return 0
    if "</body>" not in html:
        print("no </body> tag found in HTML", file=sys.stderr)
        return 2
    html_path.write_text(html.replace("</body>", INJECTION + "</body>"), encoding="utf-8")
    print(f"injected GSAP entrance animations into: {html_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
