---
name: build-slides
description: Build this project's Marp slides (slides.md) into a PDF and an animated HTML using the Editorial Refined Minimalism theme. Use when the user asks to build, render, preview, export, or rebuild their slides. Runs cross-platform via Node — no bash or Python needed.
---

# Build slides

This project turns a Marp `slides.md` into two outputs:

- `slides.pdf` — static, for sharing / printing
- `slides.html` — animated (GSAP entrance), for presenting in a browser

The build is a single cross-platform Node script. **Run that script — do not hand-roll the Marp commands, and do not run the `.sh` script on Windows.**

## How to build

From the project root:

```
node build.mjs <path-to-slides.md>
```

Examples:

- `node build.mjs examples/slides.md`
- `node build.mjs slides.md`

This behaves identically on **Windows (PowerShell), macOS, Linux, and WSL**. It only needs **Node.js** (which Marp already requires) — no `bash`, no `python`. On Windows, `build_slides.sh` will fail because it needs bash; use `node build.mjs` instead.

## If there is no slides.md yet

Create one from scratch first. The look lives in `theme.css`, so **do not put CSS in slides.md**. Use this minimal front-matter:

```
---
marp: true
size: 16:9
paginate: false
theme: erm
---
```

Then write slides using the class system: `<!-- _class: title -->`, `<!-- _class: message -->`, and the `.hdr` / `.ftr` / `.lead` helpers. See `examples/slides.md` and the README for the full class list. After creating `slides.md`, run the build command above.

## After building

Report the two outputs (`*.pdf`, `*.html`) and note that opening the HTML in a browser shows the animation. To restyle, edit `theme.css` (`:root` variables) and rebuild.
