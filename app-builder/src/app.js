// App shell: top bar, tabs, undo history, save/open, and wiring between the views.
// The real work lives in core/ (model + interpreter), ui/ (stage, event-sheet) and views/.
import './ui/event-sheet.js';
import { h } from './ui/dom.js';
import { History } from './history.js';
import { S, screen, hooks } from './state.js';
import { renderSide } from './panels/side.js';
import { initDesign } from './views/design.js';
import { initEvents } from './views/events.js';
import { initRun } from './views/run.js';
import { checkProject, newProject, findInstance, DEVICES } from './core/project.js';
import { LEVELS, resolve, fromParams } from './core/features.js';
import { pictures } from './ui/component-ui.js';
import { imageData } from './core/assets.js';
pictures.lookup = (name) => imageData(S.project, name);
import { SAMPLES } from './samples.js';

const STORE_KEY = 'appbuilder.prototype.v1';
const store = (fn) => { try { return fn(localStorage); } catch { return null; } };
let history;

// ?level=1&allow=onClicked,addTo&lock=1  (teachers link students into a lesson with exactly the blocks it needs)
const params = fromParams(location.search);
S.locked = params.locked;
const GUIDED_KEY = 'appbuilder.guided';
S.guided = store((ls) => ls.getItem(GUIDED_KEY)) !== 'quick';
function applyParams(p) {
  if (params.level || params.allow) {
    p.features = { ...(p.features || { level: 4 }) };
    if (params.level) p.features.level = params.level;
    if (params.allow) p.features.allow = params.allow;
  }
}

// ---------------- notices ----------------
let toastTimer = 0;
function notify(msg) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 5000);
}

// ---------------- project state ----------------
function setProject(p, { resetHistory = true } = {}) {
  S.project = checkProject(p);
  S.rf = resolve(S.project.features);
  if (!S.project.screens.some((s) => s.id === S.screenId)) S.screenId = S.project.screens[0].id;
  if (S.selId && !findInstance(screen(), S.selId)) S.selId = null;
  if (resetHistory) history = new History(JSON.stringify(S.project));
}
function commit(source) {
  if (history.push(JSON.stringify(S.project))) store((ls) => ls.setItem(STORE_KEY, history.current));
  refresh(source);
}
function undo(d) {
  const json = history.step(d);
  if (json == null) return;
  setProject(JSON.parse(json), { resetHistory: false });
  store((ls) => ls.setItem(STORE_KEY, json));
  refresh();
}
function select(id) { S.selId = id; design.select(); renderSide(els.side); }

// ---------------- skeleton ----------------
const els = {};
const app = document.getElementById('app');
els.top = h('header', { class: 'top' });
els.side = h('aside', { class: 'side' });
els.tabs = h('nav', { class: 'tabs' });
els.design = h('section', { class: 'view view-design' });
els.events = h('section', { class: 'view view-events' });
els.run = h('section', { class: 'view view-run' });
app.append(els.top, els.side, h('main', { class: 'main' }, els.tabs, els.design, els.events, els.run));

const design = initDesign(els.design);
const events = initEvents(els.events);
const run = initRun(els.run);
const tabViews = { design: null, events, run };
Object.assign(hooks, { commit, refresh, select, notify, setTab });

// ---------------- top bar & tabs ----------------
function renderTop() {
  const sel = h('select', { class: 'ctl', 'aria-label': 'Load a sample' },
    h('option', { value: '' }, 'Samples…'),
    Object.keys(SAMPLES).map((n) => h('option', { value: n }, n)));
  sel.addEventListener('change', () => { if (sel.value) loadProject(SAMPLES[sel.value]()); });
  const f = S.project.features;
  const level = S.locked ? h('span', { class: 'tag lvl', title: 'Set by your teacher' }, S.rf.custom ? 'Lesson' : S.rf.name)
    : (() => {
      const l = h('select', { class: 'ctl', 'aria-label': 'Level', title: 'How many blocks to show. Nothing you built is ever removed.' },
        S.rf.custom ? h('option', { value: 'custom', selected: true }, 'Level: Custom') : null,
        Object.entries(LEVELS).map(([n, d]) => h('option', { value: n, selected: !S.rf.custom && f.level === Number(n) }, `L${n}: ${d.name}`)));
      l.addEventListener('change', () => { if (l.value === 'custom') return; S.project.features = { level: Number(l.value) }; S.rf = resolve(S.project.features); commit(); });
      return l;
    })();
  els.top.replaceChildren(
    h('strong', { class: 'brand' }, 'App Builder', h('span', { class: 'tag' }, 'prototype')),
    h('input', { class: 'ctl name', value: S.project.name, 'aria-label': 'Project name', oninput: (e) => { S.project.name = e.target.value; }, onchange: () => commit() }),
    h('span', { class: 'spacer' }),
    (() => {
      const d = h('select', { class: 'ctl', 'aria-label': 'Screen size', title: 'The size of the app you are building' },
        Object.entries(DEVICES).map(([k, v]) => h('option', { value: k, selected: S.project.device === k, title: `${v.w} \u00d7 ${v.h}` }, v.label)));
      d.addEventListener('change', () => { S.project.device = d.value; commit(); });
      return d;
    })(),
    level,
    h('button', { class: 'btn', disabled: !history.canUndo, title: 'Undo (Ctrl+Z)', onclick: () => undo(-1) }, 'Undo'),
    h('button', { class: 'btn', disabled: !history.canRedo, title: 'Redo (Ctrl+Shift+Z)', onclick: () => undo(1) }, 'Redo'),
    h('span', { class: 'sep' }),
    sel,
    h('button', { class: 'btn', onclick: () => loadProject(newProject()) }, 'New'),
    h('button', { class: 'btn', onclick: openFile }, 'Open…'),
    h('button', { class: 'btn primary', onclick: saveFile }, 'Save'),
  );
}
function loadProject(p) {
  p = checkProject(p); applyParams(p);
  setTab('design');
  S.screenId = null; S.selId = null;
  setProject(p);
  store((ls) => ls.setItem(STORE_KEY, JSON.stringify(S.project)));
  refresh();
}
async function saveFile() {
  const json = JSON.stringify(S.project, null, 2);
  const filename = (S.project.name || 'app').replace(/[^\w-]+/g, '-') + '.app.json';
  // Hosted pages can't start downloads themselves; use the page-download feature when it exists.
  try {
    const dl = await window.claude?.use?.('downloads');
    if (dl) { await dl.save({ filename, data: json }); return; }
  } catch (e) {
    if (e?.code === 'declined') return;
    notify('Could not save: ' + (e?.message || 'unknown problem'));
    return;
  }
  const a = h('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: filename });
  document.body.append(a); a.click(); a.remove();
}
function openFile() {
  const input = h('input', { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    try { loadProject(JSON.parse(await input.files[0].text())); }
    catch (e) { notify('Could not open that file: ' + e.message); }
  });
  input.click();
}

function renderTabs() {
  els.tabs.replaceChildren(...[['design', 'Design'], ['events', 'Events'], ['run', 'Run ▶']].map(([id, label]) =>
    h('button', { class: 'tab' + (S.tab === id ? ' on' : ''), role: 'tab', 'aria-selected': S.tab === id, onclick: () => setTab(id) }, label)));
  els.design.hidden = S.tab !== 'design';
  els.events.hidden = S.tab !== 'events';
  els.run.hidden = S.tab !== 'run';
}
function setTab(t) {
  tabViews[S.tab]?.deactivate();
  S.tab = t;
  renderTabs();
  refresh();
  tabViews[t]?.activate();
}

// ---------------- refresh ----------------
function refresh(source) {
  renderTop();
  renderSide(els.side);
  design.render();
  events.render(source);
  renderTabs();
}

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(e.shiftKey ? 1 : -1); return; }
  if (S.tab === 'design' && !typing && design.onKey(e)) e.preventDefault();
});

// ---------------- boot ----------------
let initial = null;
try { const saved = store((ls) => ls.getItem(STORE_KEY)); if (saved) initial = JSON.parse(saved); } catch { /* ignore */ }
initial = checkProject(initial || SAMPLES['Practice tracker']());
applyParams(initial);
setProject(initial);
refresh();
const tab = new URLSearchParams(location.search).get('tab');
if (tab && tabViews[tab] !== undefined) setTab(tab);
window.__app = { S, setTab, loadProject }; // handy for debugging and tests
