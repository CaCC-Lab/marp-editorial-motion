---
name: build-slides
description: Build this project's Marp slides (slides.md) into a PDF and an animated HTML using the Editorial Refined Minimalism theme, and optionally narrate the speaker notes (TTS), auto-advance, and export an MP4. Use when the user asks to build, render, preview, export, or rebuild their slides, or to make them read the notes aloud, present automatically, or become a video. Runs cross-platform via Node — no bash or Python needed.
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

## Narrated auto-presentation and video (optional)

If the user asks to **read the notes aloud**, make it **present itself / auto-advance**, or **export a video (MP4)**:

```
node build.mjs <path-to-slides.md> --narrate   # voice for each slide's notes + an HTML that auto-advances
node build.mjs <path-to-slides.md> --video     # the above + an MP4 (1920x1080, includes the GSAP motion)
```

- The voice comes from a TTS engine chosen with the env var `TTS_ENGINE`:
  - `sbv2` (default) — Style-Bert-VITS2 server. Needs `SBV2_MODEL` (and the server running; default URL `http://127.0.0.1:5000`).
  - `voicevox` — free VOICEVOX app (start it first). Optional `VOICEVOX_SPEAKER` (style id, default 3).
  - `elevenlabs` — needs `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`. Never write the key into a file; ask the user to set it in their own shell.
- Set env vars for the one command, e.g. PowerShell: `$env:TTS_ENGINE="voicevox"; node build.mjs slides.md --video` / macOS・Linux: `TTS_ENGINE=voicevox node build.mjs slides.md --video`.
- What is read: the `━━━ 読む ━━━` section of a note if present, otherwise only the 「quoted」 lines, otherwise the whole note. To change what is spoken, edit the notes (`<!-- -->`) in slides.md, not the code.
- `--video` needs `npm i puppeteer-core ffmpeg-static` once, plus Chrome or Edge.
- If the engine is not running or a name is wrong, the build prints the reason and the list of available voices — relay that to the user instead of guessing.
- Outputs: `slides.narration/` (per-slide audio, timing) and `slides.mp4`. In the HTML, the "▶ 自動プレゼン" button (bottom right) starts it; `Esc` stops.
- VOICEVOX voices require a credit line (e.g. "VOICEVOX:ずんだもん") when a video is published — mention this when the user uses voicevox.
