// How each component looks: its picker icon and how it is drawn on the stage.
// Keyed by the ids in core/components.js. Icons are tiny inline SVGs (trusted, static) that use currentColor.
import { h } from './dom.js';

// name -> picture data; the app points this at the current project (uploads + built-ins)
export const pictures = { lookup: () => '' };
// name -> { src, title, credit } for sounds; link -> video source (core/assets.js videoSource). Set by the app.
export const media = { sound: () => null, video: () => ({ kind: 'none', why: 'No video link yet' }) };

const svg = (body) => `<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  button: svg('<rect x="6" y="14" width="36" height="20" rx="6"/><path d="M17 24h14"/>'),
  text:   svg('<path d="M10 14h28M24 14v22M18 36h12"/>'),
  input:  svg('<rect x="6" y="14" width="36" height="20" rx="4"/><path d="M14 20v8"/>'),
  shape:  svg('<rect x="8" y="14" width="32" height="20" rx="3" fill="currentColor" fill-opacity=".25"/>'),
  image:  svg('<rect x="7" y="9" width="34" height="30" rx="4"/><circle cx="17" cy="19" r="3.5"/><path d="M8 36l11-11 8 8 5-5 9 9"/>'),
  sound:  svg('<path d="M8 19h8l10-8v26l-10-8H8z"/><path d="M32 18a8 8 0 0 1 0 12M36 13a14 14 0 0 1 0 22"/>'),
  video:  svg('<rect x="5" y="11" width="38" height="26" rx="4"/><path d="M21 18v12l10-6z" fill="currentColor"/>'),
  list:   svg('<path d="M16 14h24M16 24h24M16 34h24"/><circle cx="9" cy="14" r="1.5" fill="currentColor"/><circle cx="9" cy="24" r="1.5" fill="currentColor"/><circle cx="9" cy="34" r="1.5" fill="currentColor"/>'),
  table:  svg('<rect x="6" y="9" width="36" height="30" rx="3"/><path d="M6 18h36M6 28h36M20 9v30"/>'),
  toggle: svg('<rect x="6" y="15" width="36" height="18" rx="9"/><circle cx="33" cy="24" r="5"/>'),
  slider: svg('<path d="M8 24h32"/><circle cx="20" cy="24" r="5" fill="currentColor"/>'),
};
// group icons for the event chooser
Object.assign(ICONS, {
  screen:    svg('<rect x="13" y="5" width="22" height="38" rx="4"/><path d="M21 37h6"/>'),
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
        el.querySelector('.snd-btn').addEventListener('click', () => { if (audio.paused) { audio.currentTime = 0; audio.play().catch(() => {}); } else audio.pause(); });
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
        if (playing && src) { a.currentTime = 0; a.play().catch(() => a.dispatchEvent(new Event('pause'))); } else if (!playing) a.pause();
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
        ? items.map((it, i) => h('div', { class: 'lst-row' + (p.selected === i + 1 ? ' sel' : ''), role: 'listitem', 'data-index': String(i + 1), 'aria-selected': p.selected === i + 1 ? 'true' : null }, Array.isArray(it) ? it.join(', ') : String(it)))
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
          ? rows.map((r, i) => h('tr', { class: 'lst-row tbl-row' + (p.selected === i + 1 ? ' sel' : ''), role: 'row', 'data-index': String(i + 1), 'aria-selected': p.selected === i + 1 ? 'true' : null }, fields.map((f) => cell('td', r && f in r ? String(r[f]) : ''))))
          : [h('tr', {}, h('td', { class: 'lst-empty', colspan: String(Math.max(1, fields.length)) }, 'No rows yet'))]))));
    },
  },
  shape: {
    make: () => h('div', { class: 'box' }),
    write: (inner, p) => { if (inner.style.background !== p.color) inner.style.background = p.color; },
  },
  toggle: {
    make: () => h('label', { class: 'tg' }, h('input', { type: 'checkbox', role: 'switch' }), h('span', { class: 'tg-track' }), h('span', { class: 'tg-label' })),
    write: (inner, p) => {
      const box = inner.querySelector('input'), label = inner.querySelector('.tg-label');
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
