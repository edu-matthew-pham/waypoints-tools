// How each component looks: its picker icon and how it is drawn on the stage.
// Keyed by the ids in core/components.js. Icons are tiny inline SVGs (trusted, static) that use currentColor.
import { h } from './dom.js';
import { isPictureValue, isSoundValue, refRange } from '../core/media.js';

// name -> picture data; the app points this at the current project (uploads + built-ins)
export const pictures = { lookup: () => '' };
// name -> { src, title, credit } for sounds; link -> video source (core/assets.js videoSource). Set by the app.
// camera, mic: are they allowed for this app (project.allowCamera, allowMic; off unless the teacher turns them on)
export const media = { sound: () => null, video: () => ({ kind: 'none', why: 'No video link yet' }), camera: () => false, mic: () => false };
const isPicValue = isPictureValue;
const thumb = (v) => (isSoundValue(v) ? h('span', { class: 'cell-snd' }, '🔊 Recording') : h('img', { class: 'cell-pic', src: pictures.lookup(v), alt: '' }));
const startOf = (src) => refRange(src.replace(/^blob:[^#]*/, 'media:00000000'))?.[0] || 0;

const svg = (body) => `<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  button: svg('<rect x="6" y="14" width="36" height="20" rx="6"/><path d="M17 24h14"/>'),
  text:   svg('<path d="M10 14h28M24 14v22M18 36h12"/>'),
  input:  svg('<rect x="6" y="14" width="36" height="20" rx="4"/><path d="M14 20v8"/>'),
  shape:  svg('<rect x="8" y="14" width="32" height="20" rx="3" fill="currentColor" fill-opacity=".25"/>'),
  image:  svg('<rect x="7" y="9" width="34" height="30" rx="4"/><circle cx="17" cy="19" r="3.5"/><path d="M8 36l11-11 8 8 5-5 9 9"/>'),
  sound:  svg('<path d="M8 19h8l10-8v26l-10-8H8z"/><path d="M32 18a8 8 0 0 1 0 12M36 13a14 14 0 0 1 0 22"/>'),
  drawing: svg('<rect x="6" y="8" width="36" height="32" rx="4"/><path d="M13 31c4-9 8 2 12-6s6 2 10-4"/>'),
  recorder: svg('<rect x="18" y="6" width="12" height="22" rx="6"/><path d="M11 22a13 13 0 0 0 26 0M24 35v7M17 42h14"/>'),
  photo:  svg('<path d="M6 16h8l3-5h14l3 5h8v22H6z"/><circle cx="24" cy="26" r="7"/>'),
  video:  svg('<rect x="5" y="11" width="38" height="26" rx="4"/><path d="M21 18v12l10-6z" fill="currentColor"/>'),
  list:   svg('<path d="M16 14h24M16 24h24M16 34h24"/><circle cx="9" cy="14" r="1.5" fill="currentColor"/><circle cx="9" cy="24" r="1.5" fill="currentColor"/><circle cx="9" cy="34" r="1.5" fill="currentColor"/>'),
  table:  svg('<rect x="6" y="9" width="36" height="30" rx="3"/><path d="M6 18h36M6 28h36M20 9v30"/>'),
  toggle: svg('<rect x="6" y="15" width="36" height="18" rx="9"/><circle cx="33" cy="24" r="5"/>'),
  slider: svg('<path d="M8 24h32"/><circle cx="20" cy="24" r="5" fill="currentColor"/>'),
};
// group icons for the event chooser
Object.assign(ICONS, {
  screen:    svg('<rect x="13" y="5" width="22" height="38" rx="4"/><path d="M21 37h6"/>'),
  function:  svg('<path d="M30 9c-5 0-6 3-7 8l-4 16c-1 5-2 7-6 7"/><path d="M15 21h15"/>'),
  system:    svg('<circle cx="24" cy="24" r="16"/><path d="M24 14v10l7 5"/>'),
  keyboard:  svg('<rect x="5" y="13" width="38" height="22" rx="4"/><path d="M12 20h2M19 20h2M26 20h2M33 20h2M15 28h18"/>'),
  variables: svg('<rect x="7" y="9" width="34" height="30" rx="5"/><path d="M17 18l14 12M31 18L17 30"/>'),
});
export const FALLBACK_ICON = svg('<rect x="8" y="8" width="32" height="32" rx="6"/>');

// make(design) builds the inner element once; write(inner, props) brings it up to date.
const setText = (inner, p) => { if (inner.textContent !== p.text) inner.textContent = p.text; };
// read(el) turns a user's change on the element into the value the interpreter wants (default: el.value).
export const RENDER = {
  button: { make: () => h('button', { type: 'button' }), write: setText },
  text: { make: () => h('div', { class: 't' }), write: setText },
  input: {
    make: (design) => h('input', { type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: design ? 'Text input' : '' }),
    write: (inner, p) => { if (inner.value !== p.text) inner.value = p.text; },
  },
  image: {
    make: () => h('img', { alt: '', draggable: 'false' }),
    write: (inner, p) => { const src = pictures.lookup(p.image); if (inner.getAttribute('src') !== src) inner.setAttribute('src', src); inner.alt = p.text || ''; },
  },
  // A play button, the sound's title and its credit. In the app it holds an <audio> that the runtime starts and stops
  // (p.playing, with p.mediaSeq counting each Play or Stop); the user can also press the button.
  sound: {
    make: (design) => {
      const el = h('div', { class: 'snd' },
        h('button', { type: 'button', class: 'snd-btn', 'aria-label': 'Play', disabled: design ? true : null }, '▶'),
        h('div', { class: 'snd-txt' }, h('div', { class: 'snd-title' }), h('div', { class: 'snd-credit' })));
      if (!design) {
        const audio = h('audio', { preload: 'none' });
        el.append(audio);
        el._audio = audio;
        el.querySelector('.snd-btn').addEventListener('click', () => { if (audio.paused) { audio.currentTime = startOf(audio.getAttribute('src') || ''); audio.play().catch(() => {}); } else audio.pause(); });
      }
      return el;
    },
    write: (el, p) => {
      const info = media.sound(p.sound);
      const title = p.text || info?.title || (p.sound ? `No sound called "${p.sound}"` : 'Choose a sound');
      const t = el.querySelector('.snd-title'), c = el.querySelector('.snd-credit'), b = el.querySelector('.snd-btn');
      if (t.textContent !== title) t.textContent = title;
      const credit = info?.credit || '';
      if (c.textContent !== credit) c.textContent = credit;
      const playing = !!p.playing;
      if (b.textContent !== (playing ? '■' : '▶')) { b.textContent = playing ? '■' : '▶'; b.setAttribute('aria-label', playing ? 'Stop' : 'Play'); }
      el.classList.toggle('on', playing);
      const a = el._audio;
      if (!a) return;
      const src = info?.src || '';
      if (a.getAttribute('src') !== src) { a.pause(); if (src) a.setAttribute('src', src); else a.removeAttribute('src'); }
      if (el._seq !== (p.mediaSeq || 0)) {
        el._seq = p.mediaSeq || 0;
        if (playing && src) { a.currentTime = startOf(src); a.play().catch(() => a.dispatchEvent(new Event('pause'))); } else if (!playing) a.pause();
      }
    },
  },
  // A video from a link (never uploaded): a file in the browser's own player, or YouTube when the app allows it.
  video: {
    make: (design) => { const el = h('div', { class: 'vid' }); el._design = design; return el; },
    write: (el, p) => {
      const src = media.video(p.link);
      const key = JSON.stringify(src);
      if (el._key !== key) {
        el._key = key;
        el._player = null;
        if (src.kind === 'file' && !el._design) {
          const v = h('video', { controls: '', playsinline: '', preload: 'metadata', src: src.src });
          el._player = v;
          el.replaceChildren(v, h('div', { class: 'vid-credit' }, 'From ', src.page ? h('a', { href: src.page, target: '_blank', rel: 'noopener' }, src.from + ' (licence and credit)') : src.from));
        } else if (src.kind === 'youtube' && !el._design) {
          const f = h('iframe', { src: src.src, title: p.text || 'Video', allow: 'encrypted-media; picture-in-picture; fullscreen', referrerpolicy: 'strict-origin-when-cross-origin' });
          el._player = f;
          el.replaceChildren(f);
        } else {
          el.replaceChildren(h('div', { class: 'vid-ph' }, h('div', { class: 'vid-big' }, src.kind === 'file' || src.kind === 'youtube' ? '▶' : '🎬'),
            h('div', {}, src.kind === 'file' || src.kind === 'youtube' ? `Video from ${src.from}` : src.why)));
        }
      }
      const pl = el._player;
      if (!pl || el._seq === (p.mediaSeq || 0)) return;
      el._seq = p.mediaSeq || 0;
      if (pl.tagName === 'VIDEO') { if (p.playing) { pl.currentTime = 0; pl.play().catch(() => pl.dispatchEvent(new Event('pause'))); } else pl.pause(); }
      else pl.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: p.playing ? 'playVideo' : 'pauseVideo', args: [] }), '*');
    },
  },
  list: {
    make: () => h('div', { class: 'lst', role: 'list' }),
    write: (inner, p) => {
      const items = Array.isArray(p.items) ? p.items : [];
      const key = JSON.stringify([items, p.selected]);
      if (inner._key === key) return;
      inner._key = key;
      inner.replaceChildren(...(items.length
        ? items.map((it, i) => h('div', { class: 'lst-row' + (p.selected === i + 1 ? ' sel' : ''), role: 'listitem', 'data-index': String(i + 1), 'aria-selected': p.selected === i + 1 ? 'true' : null }, isPicValue(it) || isSoundValue(it) ? thumb(it) : Array.isArray(it) ? it.join(', ') : String(it)))
        : [h('div', { class: 'lst-empty' }, p.source ? 'Empty list' : 'Choose a list in Properties')]));
    },
  },
  // p.items = the rows (records), p.fields = the field names to show as columns
  table: {
    make: () => h('div', { class: 'tbl', role: 'table' }),
    write: (inner, p) => {
      const rows = Array.isArray(p.items) ? p.items : [];
      const fields = Array.isArray(p.fields) ? p.fields : [];
      const key = JSON.stringify([fields, rows, p.selected]);
      if (inner._key === key) return;
      inner._key = key;
      const cell = (tag, text, cls) => h(tag, { class: cls, role: tag === 'th' ? 'columnheader' : 'cell' }, text);
      if (!p.source) { inner.replaceChildren(h('div', { class: 'lst-empty' }, 'Choose a table in Properties')); return; }
      inner.replaceChildren(h('div', { class: 'tbl-scroll' }, h('table', {},
        h('thead', {}, h('tr', { role: 'row' }, fields.map((f) => cell('th', f)))),
        h('tbody', {}, rows.length
          ? rows.map((r, i) => h('tr', { class: 'lst-row tbl-row' + (p.selected === i + 1 ? ' sel' : ''), role: 'row', 'data-index': String(i + 1), 'aria-selected': p.selected === i + 1 ? 'true' : null }, fields.map((f) => {
            const v = r && f in r ? r[f] : '';
            return (p.pictureFields?.includes(f) && v !== '') || isPicValue(v) || isSoundValue(v) ? h('td', { role: 'cell' }, thumb(v)) : cell('td', String(v));
          })))
          : [h('tr', {}, h('td', { class: 'lst-empty', colspan: String(Math.max(1, fields.length)) }, 'No rows yet'))]))));
    },
  },
  // A space to draw on. The lines (colour, size, points) are kept here, on the page; the runtime keeps how many there
  // are (p.lines) and counts each Clear and Undo (p.clearSeq, p.undoSeq). snapshot() gives the drawing as a PNG.
  drawing: {
    make: (design) => {
      const el = h('div', { class: 'drw' }), c = h('canvas', {});
      el.append(c);
      Object.assign(el, { _c: c, _lines: [], _bg: null, _bgSrc: '' });
      c._el = el;
      if (design) { el.append(h('div', { class: 'drw-hint' }, 'Draw here when the app runs')); return el; }
      let line = null;
      const at = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)]; };
      c.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || c.closest('.picking')) return;
        line = { color: el._p?.color || '#222', size: el._p?.pen || 4, pts: [at(e)] };
        c.setPointerCapture(e.pointerId);
        drawLine(c.getContext('2d'), line);
      });
      c.addEventListener('pointermove', (e) => { if (!line) return; line.pts.push(at(e)); drawLine(c.getContext('2d'), line, line.pts.length - 2); });
      const end = () => {
        if (!line) return;
        el._lines.push(line); line = null;
        c.dispatchEvent(new Event('input', { bubbles: true })); // the stage reports it: one more line
      };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
      return el;
    },
    write: (el, p) => {
      el._p = p;
      const c = el._c;
      let redraw = false;
      if (c.width !== p.w || c.height !== p.h) { c.width = p.w; c.height = p.h; redraw = true; }
      if (el._clear === undefined) { el._clear = p.clearSeq || 0; el._undo = p.undoSeq || 0; }
      if (el._clear !== (p.clearSeq || 0)) { el._clear = p.clearSeq || 0; el._lines = []; redraw = true; }
      for (; el._undo < (p.undoSeq || 0); el._undo++) { el._lines.pop(); redraw = true; }
      const src = p.background ? pictures.lookup(p.background) : '';
      if (src !== el._bgSrc) {
        el._bgSrc = src; el._bg = null; redraw = true;
        if (src) { const img = new Image(); img.onload = () => { if (el._bgSrc === src) { el._bg = img; paint(el); } }; img.src = src; }
      }
      if (redraw) paint(el);
    },
    read: (c) => c._el._lines.length,
    snapshot: (el) => { paint(el); try { return el._c.toDataURL('image/png'); } catch { return null; } },
  },
  // The camera. Starts only when the user taps it (and only if the app allows the camera); the browser asks too.
  // snapshot() gives the current frame as a small JPEG. destroy() turns the camera off.
  photo: {
    make: (design) => {
      // the <video> is added only when the camera starts: browser extensions that put buttons on every video then have
      // nothing to latch onto before that (and never in Design)
      const el = h('div', { class: 'pho' }), msg = h('div', { class: 'pho-msg' });
      const shutter = h('button', { type: 'button', class: 'pho-shutter', 'aria-label': 'Take a photo', title: 'Take a photo', hidden: true });
      // Choose a photo: a picture from the device instead of the camera. Always there, so it is the way in where cameras
      // are blocked or Allow camera is off. Like the shutter, it sets Photo.picture and runs "A photo is taken with".
      const choose = h('button', { type: 'button', class: 'pho-choose', 'data-ab': 'photo-choose', 'aria-label': 'Choose a photo', title: 'Choose a photo from this device', disabled: design ? true : null }, '\u{1F5BC} Choose a photo');
      el.append(msg, shutter, choose);
      Object.assign(el, { _v: null, _msg: msg, _design: design, _shutter: shutter, _shutterOn: true });
      shutter.addEventListener('click', () => { if (el._stream) report(el, { shoot: true }); });
      choose.addEventListener('click', (e) => { e.stopPropagation(); choosePhoto(el); });
      msg.textContent = design ? '📷 Camera: the user taps here to start it when the app runs, or chooses a photo' : '📷 Tap to start the camera';
      if (design) return el;
      el.addEventListener('click', () => { if (!el._stream) startCamera(el); });
      return el;
    },
    write: (el, p) => { el._shutterOn = p.shutter !== false; el._shutter.hidden = !(el._stream && el._shutterOn); if (el._design) return; if (el._chosen) return; if (!el._stream && !el._starting && !media.camera()) el._msg.textContent = '📷 The camera is off for this app: choose a photo instead. (To use the camera, tick Allow camera in the Photo\u2019s properties.)'; else if (!el._stream && !el._starting && !el._failed) el._msg.textContent = '📷 Tap to start the camera'; },
    read: (t) => (t.classList?.contains('pho') ? t._value : !!t.srcObject?.active),
    snapshot: (el) => {
      const v = el._v;
      if (!el._stream || !v?.videoWidth) return null;
      const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
      const c = h('canvas', {});
      c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
      return c.toDataURL('image/jpeg', 0.8);
    },
    destroy: (el) => { el._stream?.getTracks().forEach((t) => t.stop()); el._stream = null; },
  },
  // Records a short sound (up to 20 s) with the microphone, with its own Record/Stop and Play buttons, and two trim
  // handles once there is a recording. The recording goes to the runtime as a file ({ blob, length }); the Player
  // keeps it and passes on its reference. Trim moves only the play range (Recorder.sound gets #t=start,end).
  recorder: {
    make: (design) => {
      const rec = h('button', { type: 'button', class: 'rec-btn', 'aria-label': 'Record', disabled: design ? true : null }, '●');
      const play = h('button', { type: 'button', class: 'rec-play', 'aria-label': 'Play the recording', disabled: true }, '▶');
      const msg = h('div', { class: 'rec-msg' }, design ? '🎙 Records when the app runs, or chooses a sound' : '🎙 Tap ● to record');
      // Choose a sound: a sound file from the device instead of the microphone (like Photo's Choose a photo). Always
      // there, so it is the way in where microphones are blocked or Allow microphone is off.
      const choose = h('button', { type: 'button', class: 'rec-choose', 'data-ab': 'recorder-choose', title: 'Choose a sound file from this device', disabled: design ? true : null }, '\u{1F3B5} Choose');
      const from = h('input', { type: 'range', min: 0, max: 1, step: 0.1, value: 0, 'aria-label': 'Start' });
      const to = h('input', { type: 'range', min: 0, max: 1, step: 0.1, value: 1, 'aria-label': 'End' });
      const trim = h('div', { class: 'rec-trim', hidden: true }, h('span', {}, 'Trim'), from, to);
      const el = h('div', { class: 'rec' }, h('div', { class: 'rec-row' }, rec, play, msg, choose), trim);
      Object.assign(el, { _rec: rec, _play: play, _msg: msg, _from: from, _to: to, _trim: trim, _len: 0 });
      if (design) return el;
      const audio = h('audio', { preload: 'auto' });
      el.append(audio); el._audio = audio;
      rec.addEventListener('click', () => (el._mr ? el._mr.stop() : startRecording(el)));
      choose.addEventListener('click', (e) => { e.stopPropagation(); if (!el._mr) chooseSound(el); });
      play.addEventListener('click', () => {
        if (!audio.paused) { audio.pause(); return; }
        audio.currentTime = Number(from.value); audio.play().catch(() => {});
      });
      audio.addEventListener('timeupdate', () => { if (audio.currentTime >= Number(to.value)) audio.pause(); });
      audio.addEventListener('play', () => { play.textContent = '■'; });
      audio.addEventListener('pause', () => { play.textContent = '▶'; });
      const keepApart = (moved) => {
        if (Number(to.value) - Number(from.value) < 0.3) { if (moved === from) from.value = Number(to.value) - 0.3; else to.value = Number(from.value) + 0.3; }
        msg.textContent = trimText(el);
      };
      from.addEventListener('input', () => keepApart(from));
      to.addEventListener('input', () => keepApart(to));
      return el;
    },
    write: (el) => {
      if (!el._audio || el._mr || el._failed || el._audio.getAttribute('src')) return; // no audio: in Design, keep its note
      el._msg.textContent = media.mic() ? '🎙 Tap ● to record, or choose a sound' : '🎙 The microphone is off for this app: choose a sound instead. (To record, tick Allow microphone in the Recorder\u2019s properties.)';
    },
    // what the stage reports: a finished recording, the recording starting, or the trim handles moved
    read: (t) => { const el = t.closest('.rec'); return t === el ? el._value : { trim: [Number(el._from.value), Number(el._to.value)] }; },
    destroy: (el) => { if (el._mr?.state === 'recording') { el._discard = true; el._mr.stop(); } el._stream?.getTracks().forEach((t) => t.stop()); },
  },
  shape: {
    make: () => h('div', { class: 'box' }),
    write: (inner, p) => { if (inner.style.background !== p.color) inner.style.background = p.color; },
  },
  toggle: {
    make: () => h('label', { class: 'tg' }, h('input', { type: 'checkbox', role: 'switch' }), h('span', { class: 'tg-track' }), h('span', { class: 'tg-label' })),
    write: (inner, p) => {
      const box = inner.querySelector('input'), label = inner.querySelector('.tg-label');
      const tick = p.look === 'tick'; // a tick box: the same on/off, drawn as a box that shows a tick
      inner.classList.toggle('tick', tick);
      box.setAttribute('role', tick ? 'checkbox' : 'switch');
      if (box.checked !== !!p.on) box.checked = !!p.on;
      if (label.textContent !== p.text) label.textContent = p.text;
    },
    read: (el) => el.checked,
  },
  slider: {
    make: () => h('input', { type: 'range', step: '1' }),
    write: (inner, p) => {
      if (Number(inner.min) !== p.min) inner.min = p.min;
      if (Number(inner.max) !== p.max) inner.max = p.max;
      if (Number(inner.value) !== p.value) inner.value = p.value;
    },
    read: (el) => Number(el.value),
  },
};

// ---- drawing helpers ----
function drawLine(ctx, line, from = 0) {
  ctx.strokeStyle = line.color; ctx.fillStyle = line.color; ctx.lineWidth = line.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pts = line.pts;
  if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], line.size / 2, 0, Math.PI * 2); ctx.fill(); return; }
  ctx.beginPath();
  ctx.moveTo(...pts[Math.max(0, from)]);
  for (let i = Math.max(0, from) + 1; i < pts.length; i++) ctx.lineTo(...pts[i]);
  ctx.stroke();
}
// white, then the background picture (fitted inside, centred), then every line
function paint(el) {
  const c = el._c, ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  const bg = el._bg;
  if (bg?.naturalWidth) {
    const s = Math.min(c.width / bg.naturalWidth, c.height / bg.naturalHeight);
    const w = bg.naturalWidth * s, hh = bg.naturalHeight * s;
    ctx.drawImage(bg, (c.width - w) / 2, (c.height - hh) / 2, w, hh);
  }
  for (const line of el._lines) drawLine(ctx, line);
}
// Choose a photo: read a picture file, shrink it like the camera's photos (at most 1280 px, JPEG), show it in the Photo,
// and hand it to the runtime as a data: URL (the Player keeps it in the media store and passes on its reference).
// The same size limit as uploads (about 5 MB).
const CHOOSE_CAP = 5_000_000;
function choosePhoto(el) {
  const input = h('input', { type: 'file', accept: 'image/*' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const say = (t) => { el._msg.textContent = t; };
    if (!file.type.startsWith('image/')) { say('🖼 That isn\u2019t a picture. Choose a photo or another image.'); return; }
    if (file.size > CHOOSE_CAP) { say('🖼 That picture is too big. Try a smaller one (under about 5 MB).'); return; }
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = url; });
      const s = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = h('canvas', {});
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const data = c.toDataURL('image/jpeg', 0.85);
      if (!el._stream) { // show what was chosen (with the camera on, the camera stays the picture)
        if (!el._pic) { el._pic = h('img', { class: 'pho-pic', alt: 'The chosen photo' }); el.prepend(el._pic); }
        el._pic.src = data; el._chosen = true; say('');
      }
      report(el, { chosen: data });
    } catch { say('🖼 That picture couldn\u2019t be read. Try another one.'); }
  });
  input.click();
}
async function startCamera(el) {
  const say = (t) => { el._msg.textContent = t; };
  if (!media.camera()) return; // write() already says how to turn it on
  if (!navigator.mediaDevices?.getUserMedia) { el._failed = true; say('📷 This browser can\u2019t use a camera here.'); return; }
  el._starting = true; el._failed = false;
  say('📷 Starting the camera… (the browser may ask first)');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    if (!el.isConnected) { stream.getTracks().forEach((t) => t.stop()); return; }
    el._stream = stream;
    if (el._pic) { el._pic.remove(); el._pic = null; el._chosen = false; } // the camera replaces a chosen photo on screen
    if (!el._v) { el._v = h('video', { playsinline: '', muted: '', autoplay: '' }); el._v.muted = true; el.prepend(el._v); }
    el._v.srcObject = stream;
    await el._v.play().catch(() => {});
    el.classList.add('live');
    el._shutter.hidden = !el._shutterOn;
    el._v.dispatchEvent(new Event('input', { bubbles: true })); // the stage reports it: Photo.ready
  } catch (e) {
    el._failed = true;
    say(e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
      ? '📷 The camera is blocked: permission was refused, or this computer or browser doesn\u2019t allow it (some school devices block cameras).'
      : e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' ? '📷 No camera was found on this device.'
        : '📷 The camera couldn\u2019t start. Is another app using it?');
  } finally { el._starting = false; }
}

// ---- recorder helpers ----
const MAX_REC = 20; // seconds
const trimText = (el) => `${Number(el._from.value).toFixed(1)}–${Number(el._to.value).toFixed(1)} s of ${el._len.toFixed(1)} s`;
function report(el, value) { el._value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
// Choose a sound: a sound file (about 5 MB at most, like uploads; no 20-second limit, so a whole song is fine).
// It is handled like a finished recording: the trim handles, ▶, Recorder.sound and Recorder.length, then
// "finishes a recording" runs.
const CHOOSE_SOUND_CAP = 5_000_000;
function chooseSound(el) {
  const input = h('input', { type: 'file', accept: 'audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,.mp3,.m4a,.ogg,.wav' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const say = (t) => { el._msg.textContent = t; };
    if (file.type && !file.type.startsWith('audio/')) { say('🎵 That isn\u2019t a sound file. Try an MP3, M4A, OGG or WAV.'); return; }
    if (file.size > CHOOSE_SOUND_CAP) { say('🎵 That sound is too big. Try a shorter one (under about 5 MB).'); return; }
    const url = URL.createObjectURL(file);
    const probe = h('audio', { preload: 'metadata' });
    const len = await new Promise((ok) => {
      probe.onloadedmetadata = () => ok(Number.isFinite(probe.duration) ? probe.duration : 0);
      probe.onerror = () => ok(-1);
      probe.src = url;
    });
    if (len < 0) { URL.revokeObjectURL(url); say('🎵 That sound couldn\u2019t be played here. Try an MP3.'); return; }
    el._len = len;
    for (const r of [el._from, el._to]) r.max = len.toFixed(1);
    el._from.value = 0; el._to.value = len.toFixed(1);
    el._trim.hidden = false; el._play.disabled = false;
    if (el._audio.src) URL.revokeObjectURL(el._audio.src);
    el._audio.src = url;
    say(`Chose ${len.toFixed(1)} s. Drag the handles to trim.`);
    report(el, { blob: file, length: len });
  });
  input.click();
}
async function startRecording(el) {
  const say = (t) => { el._msg.textContent = t; };
  if (!media.mic()) return; // write() already says how to turn it on
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { el._failed = true; say('🎙 This browser can\u2019t record here.'); return; }
  el._failed = false;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    el._failed = true;
    say(e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
      ? '🎙 The microphone is blocked: permission was refused, or this computer or browser doesn\u2019t allow it (some school devices block microphones).'
      : e?.name === 'NotFoundError' ? '🎙 No microphone was found on this device.' : '🎙 The microphone couldn\u2019t start. Is another app using it?');
    return;
  }
  if (!el.isConnected) { stream.getTracks().forEach((t) => t.stop()); return; }
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
  const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [], t0 = performance.now();
  Object.assign(el, { _mr: mr, _stream: stream, _discard: false });
  el._rec.textContent = '■'; el._rec.setAttribute('aria-label', 'Stop recording'); el.classList.add('on');
  el._audio.pause();
  const tick = setInterval(() => {
    const s = (performance.now() - t0) / 1000;
    say(`Recording… ${Math.floor(s)} s (stops at ${MAX_REC} s)`);
    if (s >= MAX_REC && mr.state === 'recording') mr.stop();
  }, 200);
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mr.onstop = () => {
    clearInterval(tick);
    stream.getTracks().forEach((t) => t.stop());
    el._mr = null; el._stream = null;
    el._rec.textContent = '●'; el._rec.setAttribute('aria-label', 'Record again'); el.classList.remove('on');
    if (el._discard || !chunks.length) return;
    const len = Math.min(MAX_REC, (performance.now() - t0) / 1000);
    const blob = new Blob(chunks, { type: mr.mimeType || type || 'audio/webm' });
    el._len = len;
    for (const r of [el._from, el._to]) r.max = len.toFixed(1);
    el._from.value = 0; el._to.value = len.toFixed(1);
    el._trim.hidden = false; el._play.disabled = false;
    if (el._audio.src) URL.revokeObjectURL(el._audio.src);
    el._audio.src = URL.createObjectURL(blob);
    say(`Recorded ${len.toFixed(1)} s. Drag the handles to trim.`);
    report(el, { blob, length: len });
  };
  mr.start(250);
  report(el, { recording: true });
}
