---
marp: true
size: 16:9
paginate: false
theme: erm
---

<!-- _class: title -->

# Editorial Refined Minimalism<br>for Marp

<div class="meta">
A calm, print-inspired slide theme　・　with GSAP motion
</div>

---

<!-- _class: message -->

<div class="kicker">The idea</div>

<div class="credo">
Write <span class="em">Markdown</span>.<br>
Get slides that move.
</div>

<div class="tail">— HTML for motion, PDF for sharing. Same source.</div>

---

<div class="hdr"><span>01 / FEATURES</span><span>ERM</span></div>

## What you get

- **Editorial look** — paper, ink, indigo, vermilion; serif headings, hairline rules
- **Class system** — `title` / `message`, plus `.hdr` `.ftr` `.lead` for body slides
- **Motion for free** — GSAP fades each element in, injected after build
- `inline code`, em-dash lists, and dark code blocks all themed

<div class="ftr"><span>marp-editorial-motion</span><span>MIT</span></div>

---

<div class="hdr"><span>02 / CUSTOMIZE</span><span>ERM</span></div>

## Make it yours

Change four variables in `theme.css` and the whole deck restyles:

```css
:root {
  --accent: #1B365D;   /* indigo  → your brand */
  --strike: #A02C2C;   /* vermilion → your accent */
  --fs-h1:  52pt;      /* heading size */
}
```

<div class="lead small">Keep the look in <strong>theme.css</strong>, keep the content in <strong>slides.md</strong>. Reuse the theme, rewrite only the words.</div>

<div class="ftr"><span>marp-editorial-motion</span><span>MIT</span></div>

---

<!-- _class: message -->

<div class="kicker">Get started</div>

<div class="credo">
<span class="em">npx</span> marp<br>
&amp; you're moving.
</div>

<div class="tail">— bash build_slides.sh examples/slides.md</div>
