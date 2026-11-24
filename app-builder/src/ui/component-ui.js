// How each component looks: its picker icon and how it is drawn on the stage.
// Keyed by the ids in core/components.js. Icons are tiny inline SVGs (trusted, static) that use currentColor.
import { h } from './dom.js';

const svg = (body) => `<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  button: svg('<rect x="6" y="14" width="36" height="20" rx="6"/><path d="M17 24h14"/>'),
  text:   svg('<path d="M10 14h28M24 14v22M18 36h12"/>'),
  input:  svg('<rect x="6" y="14" width="36" height="20" rx="4"/><path d="M14 20v8"/>'),
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
