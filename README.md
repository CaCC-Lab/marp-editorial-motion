# Editorial Refined Minimalism

**An editorial-style [Marp](https://marp.app/) theme — with motion.**
Write Markdown, get calm, print-inspired slides that fade in smoothly in the browser (via GSAP) and export to a clean static PDF. Same source, two outputs.

[![License: MIT](https://img.shields.io/badge/License-MIT-1B365D.svg)](LICENSE)
![Marp](https://img.shields.io/badge/Marp-compatible-0288d1.svg?logo=markdown)
![Motion](https://img.shields.io/badge/motion-GSAP-88CE02.svg)
![PRs welcome](https://img.shields.io/badge/PRs-welcome-A02C2C.svg)

![Animated preview — each element fades in with a staggered entrance](examples/preview.gif)

<sub>The HTML output fades each element in (above). The PDF export is clean and static — same Markdown source.</sub>

- 🎨 **Editorial look** — paper / ink / indigo / vermilion, serif headings, hairline rules, monospace issue numbers
- 🎬 **Motion for free** — GSAP entrance animations injected into the HTML after build (PDF stays static)
- 🧩 **Class system** — `title` and `message` layouts, plus `.hdr` `.ftr` `.lead` `.small` for body slides
- 🔧 **One-file restyle** — change a few CSS variables in `theme.css` and the whole deck follows
- 🪶 **Self-contained** — extends Marp's bundled `default` theme (`@import 'default';`); fonts via Google Fonts, GSAP via CDN

![Title, body, and message slide layouts](examples/preview.png)
<sub>Three of the built-in layouts: title · body (with header/footer) · message.</sub>

---

## Quick start

Requirements: **Node.js only**. No `bash`, no `python` — the build is one Node script that runs the same on **Windows (PowerShell), macOS, Linux, and WSL**.

```bash
git clone https://github.com/CaCC-Lab/marp-editorial-motion.git
cd marp-editorial-motion

# Build the example (PDF + animated HTML) — works on every OS
node build.mjs examples/slides.md
```

Point it at your own file:

```bash
node build.mjs path/to/your-slides.md
```

> macOS / Linux / WSL users can also run `bash build_slides.sh <file>` — it just calls `node build.mjs`. On **Windows, use `node build.mjs`** (there is no bash).
> Then open the generated `*.html` in a browser for the animated version (`*.pdf` is the static export).

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

> Prefer plain Marp? `build.mjs` is just two `marp` calls plus a tiny HTML edit (it appends a GSAP `<script>` before `</body>`). You can run `npx @marp-team/marp-cli --theme ./theme.css …` yourself and copy that snippet from `build.mjs` if you want full control.

---

## Build it hands-free (Codex / Claude Code skill)

This repo ships an **Agent Skill** so AI coding agents build for you — just say *"build my slides"*:

- **Codex** reads `.agents/skills/build-slides/SKILL.md`
- **Claude Code** reads `.claude/skills/build-slides/SKILL.md`

Open the project in either agent and ask it to build, preview, or restyle your deck; the skill tells it to run `node build.mjs` (so it works on Windows too, and won't try the bash script). Both files are the same Agent-Skills format (`name` + `description` front-matter).

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
your.md  ──┐        node build.mjs
           ├─→  marp-cli --theme theme.css  ─→  your.pdf + your.html
theme.css ─┘                                          │
                                          GSAP <script> appended ─→ animated HTML
```

- `theme.css` — the appearance. A Marp custom theme (`/* @theme erm */`) that extends the built-in `default` theme.
- `build.mjs` — the build + the motion. Runs Marp (PDF + HTML), then appends a `MutationObserver` + GSAP `<script>` to the HTML so each slide's elements fade in on view. Idempotent; the PDF is never touched. Pure Node, so it's the same on every OS.

---

## Regenerating the preview

The animated `examples/preview.gif` is built deterministically by driving a paused
GSAP timeline (progress 0→1) and screenshotting each step — no real-time recording:

```bash
npm i -D playwright            # once
node build.mjs examples/slides.md
node scripts/capture_preview.js examples/slides.html /tmp/frames 3
ffmpeg -y -framerate 25 -i /tmp/frames/f_%03d.png \
  -vf "scale=960:-1:flags=lanczos,palettegen=stats_mode=diff" /tmp/pal.png
ffmpeg -y -framerate 25 -i /tmp/frames/f_%03d.png -i /tmp/pal.png \
  -lavfi "scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" \
  examples/preview.gif
```

---

## License & credits

- **Code & theme**: [MIT](LICENSE). Use it, fork it, ship it.
- **Fonts**: Noto Serif JP, Noto Sans JP, JetBrains Mono — loaded from Google Fonts (SIL Open Font License); not bundled here.
- **GSAP**: loaded from CDN (not bundled/redistributed); subject to its own license.

Provided as-is, without warranty or guaranteed support. PRs and issues welcome, but maintenance is best-effort.
