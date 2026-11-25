// Runner: the editor's player. Wraps Player (player.js: core plus the stage only) and adds what the editor shows
// while an app runs: live values beside each variable in the sidebar, and the Problems panel.
// Used by the Events tab (compact preview) and the Run tab (full size).
import { Player, localStore } from './player.js';
import { h } from './ui/dom.js';
import { isPictureValue, isSoundValue, mediaSrc } from './core/media.js';
import { S } from './state.js';
import { keepNow } from './media-store.js';

// "Remember between visits": values kept in this browser, one entry per variable, under this App Builder's own key
// (so each lesson step keeps its own).
export const rememberStore = (base = S.storeKey) => localStore(base);

export class Runner extends Player {
  constructor(stageHost, { problems, flash, onScreen } = {}) {
    super(stageHost, {
      store: () => rememberStore(), // the key is read at each start
      keepMedia: keepNow, // drawings and photos go to the media store; a reference straight away
      onEventRan: (id) => flash?.(id),
      onScreen,
      onDraw: (rt) => this.#show(rt),
      onStop: () => showNow(null),
    });
    this.problemsEl = problems;
  }

  // Forget the remembered values, so the next start is like a first visit.
  forget(project) { const st = rememberStore(); for (const v of project.variables) if (v.remember) st.save(v.name, undefined); }

  #show(rt) {
    showNow(rt.watch());
    if (this.problemsEl) {
      this.problemsEl.replaceChildren(...(rt.errors.length ? [
        h('h3', {}, 'Problems'),
        ...rt.errors.map((e) => h('div', { class: 'problem' }, '⚠ ' + e.message, e.count > 1 ? h('small', {}, ` (×${e.count})`) : null)),
      ] : []));
    }
  }
}

// Live values sit beside each variable in the sidebar (one place for a variable: what it starts at, and what it is now).
const isRec = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fmt = (v) => (typeof v === 'string' ? `"${v}"` : isRec(v) ? '{ ' + Object.entries(v).map(([k, x]) => `${k}: ${fmt(x)}`).join(', ') + ' }' : String(v));
let lastNow = null;
const isTableNow = (v) => Array.isArray(v) && v.length > 0 && v.every(isRec);
export const nowText = (name, w = lastNow) => {
  const v = w?.vars[name];
  if (!w || v === undefined) return '';
  if (!Array.isArray(v)) return fmt(v);
  const tbl = w.tables?.includes(name);
  return `${v.length} ${tbl ? 'row' : 'item'}${v.length === 1 ? '' : 's'}`;
};
// The live rows of a table while the app runs (empty when it isn't running). Cells that changed since the last
// drawing flash, so a For each or a Sort can be seen working.
const lastRows = new Map();
export function liveTable(name, w = lastNow) {
  const rows = w?.vars[name];
  if (!w || !Array.isArray(rows)) { lastRows.delete(name); return null; }
  const fields = w.fields?.[name] || [...new Set(rows.flatMap((r) => (isRec(r) ? Object.keys(r) : [])))];
  const before = lastRows.get(name);
  lastRows.set(name, rows);
  return h('div', { class: 'live-wrap' }, h('div', { class: 'muted live-head' }, 'Now (while the app runs):'),
    h('table', { class: 'live' },
      h('thead', {}, h('tr', {}, h('th', { class: 'rn' }, '#'), fields.map((f) => h('th', {}, f)))),
      h('tbody', {}, rows.length ? rows.map((r, i) => h('tr', {}, h('td', { class: 'rn' }, String(i + 1)),
        fields.map((f) => h('td', { class: before && before[i]?.[f] !== r?.[f] ? 'chg' : null },
        isSoundValue(r?.[f]) ? '🔊 Recording' : isPictureValue(r?.[f]) ? h('img', { class: 'cell-pic', src: mediaSrc(r[f]), alt: '' }) : r?.[f] === undefined ? '' : String(r[f])))))
        : [h('tr', {}, h('td', { colspan: String(fields.length + 1), class: 'muted' }, 'No rows'))])));
}
export function showNow(w) {
  lastNow = w;
  document.documentElement.classList.toggle('ab-running', !!w);
  for (const el of document.querySelectorAll('[data-now]')) {
    const v = w?.vars[el.dataset.now];
    const text = nowText(el.dataset.now, w);
    if (el.textContent !== text) {
      if (w && el.textContent !== '') { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      el.textContent = text;
      el.title = Array.isArray(v) ? (isTableNow(v) ? `${v.length} rows` : v.map(fmt).join(', ') || 'empty') : '';
    }
  }
  for (const el of document.querySelectorAll('[data-now-screen]')) el.textContent = w?.screen ? `Running: ${w.screen}` : '';
  for (const el of document.querySelectorAll('[data-now-table]')) {
    const key = w ? JSON.stringify(w.vars[el.dataset.nowTable]) : '';
    if (el._key === key) continue;
    el._key = key;
    el.replaceChildren(...[liveTable(el.dataset.nowTable, w)].filter(Boolean));
  }
}
