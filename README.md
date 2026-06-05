# Editorial Refined Minimalism

**An editorial-style [Marp](https://marp.app/) theme — with motion.**
Write Markdown, get calm, print-inspired slides that fade in smoothly in the browser (via GSAP) and export to a clean static PDF. Same source, two outputs.

![Preview of the Editorial Refined Minimalism theme](examples/preview.png)

- 🎨 **Editorial look** — paper / ink / indigo / vermilion, serif headings, hairline rules, monospace issue numbers
- 🎬 **Motion for free** — GSAP entrance animations injected into the HTML after build (PDF stays static)
- 🧩 **Class system** — `title` and `message` layouts, plus `.hdr` `.ftr` `.lead` `.small` for body slides
- 🔧 **One-file restyle** — change a few CSS variables in `theme.css` and the whole deck follows
- 🪶 **Self-contained** — extends Marp's bundled `default` theme (`@import 'default';`); fonts via Google Fonts, GSAP via CDN

---

## Quick start

Requirements: **Node.js** (for `npx marp`) and **Python 3** (for `inject_gsap.py`).

```bash
git clone https://github.com/CaCC-Lab/marp-editorial-motion.git
cd marp-editorial-motion

# Build the example (PDF + animated HTML)
bash build_slides.sh examples/slides.md

# Open the animated version
open examples/slides.html      # macOS  (use xdg-open on Linux / start on Windows)
```

Or point it at your own file:

```bash
bash build_slides.sh path/to/your-slides.md
```

Minimal front-matter for your Markdown — **no CSS in the slides**, the theme handles it:

```markdown
---
marp: true
size: 16:9
paginate: false
theme: erm
---

<!-- _class: title -->

# Your title

<div class="meta">date · name</div>
```

> Prefer plain Marp? You can also build without the helper script:
> `npx @marp-team/marp-cli --html --allow-local-files --theme ./theme.css your.md -o your.html`
> (then run `python3 inject_gsap.py your.html` to add the motion).

---

## The class system

| Slide / element | How to use |
|---|---|
| **Title slide** | `<!-- _class: title -->` + `# Heading` + `<div class="meta">…</div>` |
| **Message slide** | `<!-- _class: message -->` + `.kicker` / `.credo` (use `.em` to accent a word) / `.tail` |
| **Body header/footer** | `<div class="hdr"><span>01 / SECTION</span><span>LABEL</span></div>` and `<div class="ftr">…</div>` |
| **Lead paragraph** | `<div class="lead">…</div>` (add `small` for a muted note) |
| **Accent** | `**bold**` (renders vermilion). Inside a `<div>`, use `<strong>` |

See [`examples/slides.md`](examples/slides.md) for a working deck.

---

## Customize (make it your brand)

The look lives entirely in `theme.css`. The intended entry point is the `:root` block:

```css
:root {
  --ink:    #0e0e10;   /* body text */
  --paper:  #fafaf7;   /* background */
  --accent: #1B365D;   /* indigo — small headers, rules, code */
  --strike: #A02C2C;   /* vermilion — strong emphasis */

  --fs-body: 26pt;     /* body size; nudge if text clips */
  --fs-h1:   52pt;     /* heading size */
  /* …more --fs-* tokens for every text role */
}
```

Change those tokens and **every slide updates at once**. To swap fonts, edit the
`@import url(...)` at the top of `theme.css` and the `font-family` on `section` and `h1, h2`.

Because the look (`theme.css`) and the content (`slides.md`) are separate files,
you can grow one theme into *your* brand and reuse it — rewrite only the words next time.

---

## How it works

```
your.md  ──┐
           ├─→  marp-cli --theme theme.css  ─→  your.html + your.pdf
theme.css ─┘                                          │
                                                      └─→ inject_gsap.py  ─→  animated HTML
```

- `theme.css` — the appearance. A Marp custom theme (`/* @theme erm */`) that extends the built-in `default` theme.
- `inject_gsap.py` — the motion. Adds a `MutationObserver` + GSAP script to the built HTML so each slide's elements fade in on view. Idempotent; PDF is never touched.

---

## License & credits

- **Code & theme**: [MIT](LICENSE). Use it, fork it, ship it.
- **Fonts**: Noto Serif JP, Noto Sans JP, JetBrains Mono — loaded from Google Fonts (SIL Open Font License); not bundled here.
- **GSAP**: loaded from CDN (not bundled/redistributed); subject to its own license.

Provided as-is, without warranty or guaranteed support. PRs and issues welcome, but maintenance is best-effort.
