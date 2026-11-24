// How each component looks: its picker icon and how it is drawn on the stage.
// Keyed by the ids in core/components.js. Icons are tiny inline SVGs (trusted, static) that use currentColor.
import { h } from './dom.js';

const svg = (body) => `<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  button: svg('<rect x="6" y="14" width="36" height="20" rx="6"/><path d="M17 24h14"/>'),
  text:   svg('<path d="M10 14h28M24 14v22M18 36h12"/>'),
  input:  svg('<rect x="6" y="14" width="36" height="20" rx="4"/><path d="M14 20v8"/>'),
};
export const FALLBACK_ICON = svg('<rect x="8" y="8" width="32" height="32" rx="6"/>');

// make(design) builds the inner element once; write(inner, props) brings it up to date.
const setText = (inner, p) => { if (inner.textContent !== p.text) inner.textContent = p.text; };
export const RENDER = {
  button: { make: () => h('button', { type: 'button' }), write: setText },
  text: { make: () => h('div', { class: 't' }), write: setText },
  input: {
    make: (design) => h('input', { type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: design ? 'Text input' : '' }),
    write: (inner, p) => { if (inner.value !== p.text) inner.value = p.text; },
  },
};
