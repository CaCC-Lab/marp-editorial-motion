/*
 * Narration: read the speaker notes aloud (TTS), auto-advance the slides,
 * and optionally export an MP4 — on top of the HTML that build.mjs makes.
 *
 *   node build.mjs slides.md --narrate          # audio + auto-presenting HTML
 *   node build.mjs slides.md --video            # ...and an MP4 (implies --narrate)
 *
 * TTS engine — pick with TTS_ENGINE (default: sbv2):
 *   sbv2        Style-Bert-VITS2 server.
 *               SBV2_URL (default http://127.0.0.1:5000), SBV2_MODEL (required),
 *               SBV2_STYLE / SBV2_STYLE_WEIGHT / SBV2_LENGTH / SBV2_SDP_RATIO (optional)
 *   voicevox    VOICEVOX engine (free; start the VOICEVOX app first).
 *               VOICEVOX_URL (default http://127.0.0.1:50021), VOICEVOX_SPEAKER (style id, default 3),
 *               VOICEVOX_SPEED (optional, 1.0 = normal)
 *   elevenlabs  ElevenLabs API.
 *               ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID (required),
 *               ELEVENLABS_MODEL (default eleven_multilingual_v2), ELEVENLABS_SPEED (optional)
 *
 * Which part of a note is read:
 *   1. If the note has a "━━━ 読む ━━━" section, only that section.
 *   2. Else, if the note has 「quoted」 lines, only the quoted text.
 *   3. Else, the whole note.
 *
 * Video needs a Chrome/Edge (CHROME_PATH to override) plus the optional
 * packages `puppeteer-core` and `ffmpeg-static` (or ffmpeg on PATH):
 *   npm i puppeteer-core ffmpeg-static
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join, basename, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SENTINEL = '<!-- narrate-injected -->';
const MAX_CHARS = 90;          // SBV2 server rejects text over its limit (100 by default)
const LEAD_IN = 0.5;           // seconds of silence before a slide's narration
const TAIL = 0.9;              // seconds after it ends, before the next slide
const NO_NOTE_HOLD = 3.0;      // seconds to show a slide that has nothing to read
const ANIM_SECONDS = 2.2;      // GSAP entrance window that is captured frame by frame
const FPS = 30;

// ---------- notes ----------------------------------------------------------
const decode = s => s
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n\n').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');

export function readNotes(html) {
  const notes = new Map();
  const re = /<div class="bespoke-marp-note" data-index="(\d+)"[^>]*>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html))) notes.set(+m[1], decode(m[2]).trim());
  return notes;
}

export function countSlides(html) {
  return (html.match(/data-marpit-svg=""/g) || []).length;
}

export function pickSpeech(note) {
  if (!note) return '';
  let text = note;
  const sec = /━━━\s*読む\s*━━━([\s\S]*?)(?=━━━|$)/.exec(note);
  if (sec) text = sec[1];
  else {
    const quoted = [...note.matchAll(/「((?:[^「」]|「[^」]*」)*)」/g)].map(q => q[1]);
    if (quoted.length) text = quoted.join('\n');
  }
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]*)`/g, '$1')
    .replace(/［[^］]*］|\[[^\]]*\]/g, '')          // stage directions in brackets
    .replace(/^[・\-\s→]+/gm, '')
    .replace(/[「」]/g, '')
    .split('\n').map(s => s.trim()).filter(Boolean).join('\n');
}

export function chunk(text, max = MAX_CHARS) {
  const out = [];
  for (const line of text.split('\n')) {
    const sentences = line.match(/[^。！？!?]+[。！？!?]?/g) || [];
    for (let s of sentences) {
      s = s.trim();
      while (s.length > max) {                         // fall back to commas, then a hard cut
        let cut = s.lastIndexOf('、', max);
        if (cut < max / 3) cut = max - 1;
        out.push(s.slice(0, cut + 1)); s = s.slice(cut + 1).trim();
      }
      if (s) out.push(s);
    }
  }
  return out;
}

// ---------- WAV --------------------------------------------------------------
function parseWav(buf) {
  let off = 12, fmt, data;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') data = buf.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('not a PCM WAV');
  return { ...fmt, data };
}
function wavFile(pcm, f) {
  const h = Buffer.alloc(44), block = f.channels * f.bits / 8;
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(f.channels, 22);
  h.writeUInt32LE(f.rate, 24); h.writeUInt32LE(f.rate * block, 28); h.writeUInt16LE(block, 32); h.writeUInt16LE(f.bits, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
const silence = (sec, f) => Buffer.alloc(Math.round(sec * f.rate) * f.channels * f.bits / 8);
const seconds = (pcm, f) => pcm.length / (f.rate * f.channels * f.bits / 8);

// ---------- TTS engines -----------------------------------------------------
// Each engine: { name, params (for the cache key), check(), speak(text, prev, next) -> WAV Buffer }
function sbv2Engine() {
  const cfg = {
    url: (process.env.SBV2_URL || 'http://127.0.0.1:5000').replace(/\/$/, ''),
    model: process.env.SBV2_MODEL || '',
    style: process.env.SBV2_STYLE || '',
    styleWeight: process.env.SBV2_STYLE_WEIGHT || '',
    length: process.env.SBV2_LENGTH || '',
    sdp: process.env.SBV2_SDP_RATIO || '',
  };
  return {
    name: 'sbv2',
    params: [cfg.model, cfg.style, cfg.styleWeight, cfg.length, cfg.sdp],
    async check() {
      let info;
      try { info = await (await fetch(`${cfg.url}/models/info`)).json(); }
      catch {
        throw new Error(`Style-Bert-VITS2 に接続できません（${cfg.url}）。\n  サーバーを起動してから、もう一度ビルドしてください（SBV2 の Server.bat など）。`);
      }
      const names = Object.values(info).map(v => v.config_path?.split(/[\\/]/).slice(-2, -1)[0]).filter(Boolean);
      if (!cfg.model) throw new Error(`読み上げに使う声を SBV2_MODEL で指定してください。\n  使える声: ${names.join(', ')}`);
      if (names.length && !names.includes(cfg.model)) throw new Error(`声「${cfg.model}」が見つかりません。使える声: ${names.join(', ')}`);
    },
    async speak(text) {
      const q = new URLSearchParams({ text, model_name: cfg.model, language: 'JP' });
      if (cfg.style) q.set('style', cfg.style);
      if (cfg.styleWeight) q.set('style_weight', cfg.styleWeight);
      if (cfg.length) q.set('length', cfg.length);
      if (cfg.sdp) q.set('sdp_ratio', cfg.sdp);
      const res = await fetch(`${cfg.url}/voice?${q}`);
      if (!res.ok) throw new Error(`Style-Bert-VITS2 が読み上げに失敗しました（${res.status}）：「${text.slice(0, 30)}…」`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

function elevenEngine() {
  const cfg = {
    key: process.env.ELEVENLABS_API_KEY || '',
    voice: process.env.ELEVENLABS_VOICE_ID || '',
    model: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
    speed: process.env.ELEVENLABS_SPEED || '',
  };
  const RATE = 24000;                                   // pcm_24000 works on every plan (44.1 kHz PCM needs Pro)
  return {
    name: 'elevenlabs',
    params: [cfg.voice, cfg.model, cfg.speed],
    async check() {
      if (!cfg.key) throw new Error('ElevenLabs を使うには ELEVENLABS_API_KEY を入れてください。');
      if (!cfg.voice) throw new Error('読み上げに使う声を ELEVENLABS_VOICE_ID で指定してください（ElevenLabs の Voices で ID をコピー）。');
    },
    async speak(text, prev, next) {
      const body = { text, model_id: cfg.model };
      if (prev) body.previous_text = prev;
      if (next) body.next_text = next;
      if (cfg.speed) body.voice_settings = { speed: Number(cfg.speed) };
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cfg.voice)}?output_format=pcm_${RATE}`, {
        method: 'POST', headers: { 'xi-api-key': cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = (await res.text()).slice(0, 200);
        throw new Error(`ElevenLabs が読み上げに失敗しました（${res.status}）：${msg}`);
      }
      return wavFile(Buffer.from(await res.arrayBuffer()), { channels: 1, rate: RATE, bits: 16 });
    },
  };
}

function voicevoxEngine() {
  const cfg = {
    url: (process.env.VOICEVOX_URL || 'http://127.0.0.1:50021').replace(/\/$/, ''),
    speaker: process.env.VOICEVOX_SPEAKER || '3',
    speed: process.env.VOICEVOX_SPEED || '',
  };
  return {
    name: 'voicevox',
    params: [cfg.speaker, cfg.speed],
    async check() {
      let speakers;
      try { speakers = await (await fetch(`${cfg.url}/speakers`)).json(); }
      catch { throw new Error(`VOICEVOX に接続できません（${cfg.url}）。VOICEVOX のアプリを起動してから、もう一度ビルドしてください。`); }
      const styles = speakers.flatMap(s => s.styles.map(st => ({ id: String(st.id), label: `${st.id}=${s.name}（${st.name}）` })));
      if (!styles.some(s => s.id === cfg.speaker)) {
        throw new Error(`VOICEVOX_SPEAKER「${cfg.speaker}」が見つかりません。使える声（番号=名前）:\n  ${styles.map(s => s.label).join('\n  ')}`);
      }
    },
    async speak(text) {
      const q = await fetch(`${cfg.url}/audio_query?${new URLSearchParams({ text, speaker: cfg.speaker })}`, { method: 'POST' });
      if (!q.ok) throw new Error(`VOICEVOX が読み上げの準備に失敗しました（${q.status}）：「${text.slice(0, 30)}…」`);
      const query = await q.json();
      if (cfg.speed) query.speedScale = Number(cfg.speed);
      const res = await fetch(`${cfg.url}/synthesis?speaker=${encodeURIComponent(cfg.speaker)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query),
      });
      if (!res.ok) throw new Error(`VOICEVOX が読み上げに失敗しました（${res.status}）：「${text.slice(0, 30)}…」`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

function pickEngine() {
  const name = (process.env.TTS_ENGINE || 'sbv2').toLowerCase();
  if (name === 'sbv2') return sbv2Engine();
  if (name === 'elevenlabs') return elevenEngine();
  if (name === 'voicevox') return voicevoxEngine();
  throw new Error(`TTS_ENGINE「${name}」には対応していません（sbv2 / voicevox / elevenlabs）。`);
}

// ---------- main: audio + auto-presenting HTML -----------------------------
export async function narrate({ src, html, video = false }) {
  const page = readFileSync(html, 'utf8');
  const total = countSlides(page);
  const notes = readNotes(page);
  const dir = join(dirname(src), `${basename(src, '.md')}.narration`);
  const cacheDir = join(dir, 'cache');
  mkdirSync(cacheDir, { recursive: true });

  const engine = pickEngine();
  const speeches = Array.from({ length: total }, (_, i) => pickSpeech(notes.get(i)));
  if (speeches.some(Boolean)) await engine.check();

  const slides = [];
  let fmt = null;
  for (let i = 0; i < total; i++) {
    const parts = chunk(speeches[i]);
    const file = `slide-${String(i + 1).padStart(2, '0')}.wav`;
    if (!parts.length) { slides.push({ audio: null, seconds: 0 }); continue; }
    process.stdout.write(`  voice ${i + 1}/${total} (${parts.length} 文)\n`);
    const pcms = [];
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      const key = createHash('sha1').update(JSON.stringify([engine.name, ...engine.params, p])).digest('hex');
      const cached = join(cacheDir, `${key}.wav`);
      let wav;
      if (existsSync(cached)) wav = readFileSync(cached);
      else { wav = await engine.speak(p, parts[k - 1], parts[k + 1]); writeFileSync(cached, wav); }
      const w = parseWav(wav);
      fmt = fmt || w;
      pcms.push(w.data, silence(0.28, w));
    }
    const pcm = Buffer.concat(pcms.slice(0, -1));
    writeFileSync(join(dir, file), wavFile(pcm, fmt));
    slides.push({ audio: `${basename(dir)}/${file}`, seconds: +seconds(pcm, fmt).toFixed(3) });
  }

  const timing = slides.map(s => ({
    audio: s.audio,
    seconds: s.audio ? s.seconds : 0,
    hold: +(s.audio ? Math.max(LEAD_IN + s.seconds + TAIL, ANIM_SECONDS) : NO_NOTE_HOLD).toFixed(3),
  }));
  writeFileSync(join(dir, 'timing.json'), JSON.stringify({ leadIn: LEAD_IN, slides: timing }, null, 2));
  injectPlayer(html, timing);
  const sum = timing.reduce((a, s) => a + s.hold, 0);
  console.log(`  narration: ${timing.filter(s => s.audio).length}/${total} 枚に音声・合計 ${Math.round(sum)} 秒 → ${relative(process.cwd(), dir)}/`);

  if (video) await exportVideo({ src, html, dir, timing, fmt });
}

function injectPlayer(file, timing) {
  let h = readFileSync(file, 'utf8');
  if (h.includes(SENTINEL)) h = h.slice(0, h.indexOf(SENTINEL)) + h.slice(h.indexOf('<!-- /narrate-injected -->') + 26);
  const script = `
${SENTINEL}
<style>
#narrate-btn{position:fixed;right:18px;bottom:18px;z-index:2147483647;font:600 15px/1 system-ui,sans-serif;
  padding:11px 16px;border-radius:999px;border:0;background:#1B365D;color:#fafaf7;cursor:pointer;opacity:.85;box-shadow:0 4px 14px rgba(0,0,0,.25)}
#narrate-btn:hover{opacity:1}
body.narrate-record #narrate-btn,body.narrate-record .bespoke-marp-osc,body.narrate-record .bespoke-progress-parent{display:none!important}
</style>
<script>
(function () {
  var T = ${JSON.stringify({ leadIn: LEAD_IN, slides: timing })};
  window.__narration = T;
  if (/[?&]record\\b/.test(location.search)) { document.body.classList.add('narrate-record'); return; }
  var btn = document.createElement('button'); btn.id = 'narrate-btn'; btn.textContent = '▶ 自動プレゼン';
  document.body.appendChild(btn);
  var playing = false, timer = null, audio = new Audio();
  function current() { var a = document.querySelector('.bespoke-marp-slide.bespoke-marp-active'); var all = [].slice.call(document.querySelectorAll('.bespoke-marp-slide')); return Math.max(0, all.indexOf(a)); }
  function key(k) { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); }
  function stop() { playing = false; clearTimeout(timer); audio.pause(); btn.textContent = '▶ 自動プレゼン'; }
  function play(i) {
    if (!playing) return;
    var s = T.slides[i]; if (!s) { stop(); return; }
    var next = function () { if (!playing) return; if (i >= T.slides.length - 1) { stop(); return; } key('ArrowRight'); setTimeout(function () { play(current()); }, 60); };
    if (!s.audio) { timer = setTimeout(next, s.hold * 1000); return; }
    timer = setTimeout(function () {
      audio.src = s.audio; audio.currentTime = 0;
      audio.onended = function () { timer = setTimeout(next, ${TAIL * 1000}); };
      audio.play().catch(function () { timer = setTimeout(next, s.hold * 1000); });
    }, T.leadIn * 1000);
  }
  btn.addEventListener('click', function () { btn.blur(); if (playing) { stop(); return; } playing = true; btn.textContent = '■ 止める'; play(current()); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && playing) stop(); }, true);
})();
</script>
<!-- /narrate-injected -->
`;
  writeFileSync(file, h.replace('</body>', script + '</body>'), 'utf8');
}

// ---------- video ------------------------------------------------------------
function findBrowser() {
  const env = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env) return env;
  const c = {
    win32: [`${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${process.env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe`],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
    linux: ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
  }[process.platform] || [];
  const hit = c.find(p => p && existsSync(p));
  if (!hit) throw new Error('動画にするには Chrome か Edge が必要です。見つからないときは CHROME_PATH にパスを入れてください。');
  return hit;
}

async function findFfmpeg() {
  try { const m = await import('ffmpeg-static'); if (m.default && existsSync(m.default)) return m.default; } catch { /* optional */ }
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; }
  catch { throw new Error('動画にするには ffmpeg が必要です。`npm i ffmpeg-static` を実行してください。'); }
}

async function exportVideo({ src, html, dir, timing, fmt }) {
  let puppeteer;
  try { puppeteer = (await import('puppeteer-core')).default; }
  catch { throw new Error('動画にするには `npm i puppeteer-core ffmpeg-static` が必要です。'); }
  const ffmpeg = await findFfmpeg();
  const frames = join(dir, 'frames');
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: true,
    args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
    defaultViewport: { width: 1920, height: 1080 },
  });
  const list = [];
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(html).href + '?record', { waitUntil: 'networkidle0', timeout: 120000 });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    // Drive GSAP by hand so every frame is exact (no real-time jitter).
    await page.evaluate(() => {
      window.__clock = 0;
      if (window.gsap) { gsap.ticker.remove(gsap.updateRoot); gsap.ticker.lagSmoothing(0); }
    });
    const step = 1 / FPS, animFrames = Math.round(ANIM_SECONDS * FPS);
    let n = 0;
    for (let i = 0; i < timing.length; i++) {
      if (i > 0) await page.keyboard.press('ArrowRight');
      await new Promise(r => setTimeout(r, 120));      // let the slide switch and tweens get created
      process.stdout.write(`  video ${i + 1}/${timing.length}\n`);
      for (let f = 0; f < animFrames; f++) {
        await page.evaluate(dt => { window.__clock += dt; if (window.gsap) gsap.updateRoot(window.__clock); }, step);
        const name = `f${String(n++).padStart(6, '0')}.jpg`;
        await page.screenshot({ path: join(frames, name), type: 'jpeg', quality: 92 });
        list.push({ name, dur: f === animFrames - 1 ? timing[i].hold - (animFrames - 1) * step : step });
      }
    }
  } finally {
    await browser.close();
  }

  const lines = list.map(l => `file '${l.name}'\nduration ${l.dur.toFixed(4)}`);
  lines.push(`file '${list[list.length - 1].name}'`);
  writeFileSync(join(frames, 'frames.txt'), lines.join('\n') + '\n');

  // One audio track that follows the same timing as the frames.
  const f = fmt || { channels: 1, rate: 44100, bits: 16 };
  const track = [];
  for (const s of timing) {
    if (!s.audio) { track.push(silence(s.hold, f)); continue; }
    const pcm = parseWav(readFileSync(join(dirname(src), s.audio))).data;
    const rest = Math.max(0, s.hold - LEAD_IN - seconds(pcm, f));
    track.push(silence(LEAD_IN, f), pcm, silence(rest, f));
  }
  const audioFile = join(dir, 'narration.wav');
  writeFileSync(audioFile, wavFile(Buffer.concat(track), f));

  const out = src.replace(/\.md$/i, '.mp4');
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(frames, 'frames.txt'), '-i', audioFile,
    '-vf', `fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-shortest', out], { stdio: 'inherit' });
  rmSync(frames, { recursive: true, force: true });
  console.log(`  video: ${relative(process.cwd(), out)}`);
}
