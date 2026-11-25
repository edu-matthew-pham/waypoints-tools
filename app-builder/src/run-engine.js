// Runner: runs a copy of the project in a Stage and keeps the Watch / Problems panels fresh.
// Used by the Events tab (compact preview) and the Run tab (full size).
import { Runtime } from './core/runtime.js';
import { Stage } from './ui/stage.js';
import { h } from './ui/dom.js';
import { usesKeys } from './core/catalog.js';
import { sizeOf, tableColumns } from './core/project.js';
import { S } from './state.js';

// "Remember between visits": values kept in this browser, one entry per variable, under this App Builder's own key
// (so each lesson step keeps its own). Fails safe: with storage blocked, the app still runs and just forgets.
export function rememberStore(base = S.storeKey) {
  const key = (name) => `${base}.remember.${name}`;
  return {
    load: (name) => { try { const t = localStorage.getItem(key(name)); return t === null ? undefined : JSON.parse(t); } catch { return undefined; } },
    save: (name, value) => { try { if (value === undefined) localStorage.removeItem(key(name)); else localStorage.setItem(key(name), JSON.stringify(value)); } catch { /* storage blocked */ } },
  };
}

export class Runner {
  constructor(stageHost, { watch, problems, flash, onScreen } = {}) {
    this.stage = new Stage(stageHost, {
      on: {
        click: (id) => this.rt?.click(id),
        itemClick: (id, index) => this.rt?.itemClick(id, index),
        input: (id, v) => this.rt?.userChange(id, v),
        press: (id) => this.rt?.press(id),
        release: (id) => this.rt?.release(id),
        submit: (id) => this.rt?.submit(id),
        key: (name, down) => this.rt?.key(name, down),
        keysReset: () => this.rt?.releaseKeys(),
      },
    });
    // shown under the app when its events use the keyboard, until the app has focus
    this.hint = h('p', { class: 'kb-hint', hidden: true }, 'This app uses the keyboard: click it first, then press keys.');
    stageHost.append(this.hint);
    this.watchEl = watch;
    this.problemsEl = problems;
    this.flash = flash;
    this.onScreen = onScreen;
    this.rt = null;
    this.dirty = false;
    this.raf = 0;
  }

  start(project, screenId) {
    this.stop();
    this.stage.clear();
    this.stage.setSize(sizeOf(project));
    const rt = new Runtime(structuredClone(project), {
      store: rememberStore(),
      hooks: {
        onChange: () => { this.dirty = true; },
        onError: () => { this.dirty = true; },
        onEventRan: (id) => this.flash?.(id),
        onScreen: (scr) => this.onScreen?.(scr, rt.project),
      },
    });
    this.rt = rt;
    rt.start(screenId);
    this.#draw();
    let last = performance.now();
    const loop = (now = performance.now()) => {
      if (this.rt !== rt) return;
      if (rt.hasTimers) rt.advance(Math.min(now - last, 250)); // capped, so a hidden tab doesn't fire a burst
      last = now;
      if (rt.needsTick) rt.tick();
      if (this.dirty) { this.dirty = false; this.#draw(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  focus() { this.stage.el.focus({ preventScroll: true }); }

  // Forget the remembered values, so the next start is like a first visit.
  forget(project) { const st = rememberStore(); for (const v of project.variables) if (v.remember) st.save(v.name, undefined); }

  stop() { cancelAnimationFrame(this.raf); this.rt = null; this.stage.setPick(null); showNow(null); }

  #draw() {
    const rt = this.rt;
    if (!rt) return;
    this.hint.hidden = !usesKeys(rt.screen?.events);
    this.stage.sync(rt.allInstances.map((i) => ({ id: i.id, name: i.object, kind: i.kind,
      props: i.kind === 'list' ? { ...i.props, items: rt.globals.get(i.props.source) }
        : i.kind === 'table' ? { ...i.props, items: rt.globals.get(i.props.source), fields: tableColumns(rt.project, i.props) }
          : i.props })));
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
        fields.map((f) => h('td', { class: before && before[i]?.[f] !== r?.[f] ? 'chg' : null }, r?.[f] === undefined ? '' : String(r[f])))))
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
