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
import { initMap } from './views/map.js';
import { checkProject, newProject, findInstance, DEVICES } from './core/project.js';
import { LEVELS, resolve, fromParams } from './core/features.js';
import { pictures, media } from './ui/component-ui.js';
import { embed } from './embed.js';
import { imageData, soundInfo, videoSource, addBuiltinSounds } from './core/assets.js';
pictures.lookup = (name) => imageData(S.project, name);
media.sound = (name) => soundInfo(S.project, name);
media.video = (link) => videoSource(link, { allowYoutube: !!S.project.allowYoutube });
// more built-in sounds (e.g. FreePD tracks) listed beside App Builder; none is fine
fetch('sounds/extra.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : [])).then((list) => { addBuiltinSounds(list); hooks.refresh?.(); }).catch(() => {});
import { SAMPLES, sampleById } from './samples.js';

// ?sample=water opens that lesson project. Each lesson link keeps its own saved work, so a student who
// comes back (or refreshes) carries on where they were; "Start again" reloads the original.
const QS = new URLSearchParams(location.search);
const lessonId = QS.get('sample');
// ?store=<key>: a page that embeds App Builder (one per lesson step) keeps each copy's work apart.
const storeId = QS.get('store') || QS.get('id'); // ?id= is a Waypoints lesson step
const STORE_KEY = storeId ? 'appbuilder.store.' + storeId : lessonId ? 'appbuilder.lesson.' + lessonId : 'appbuilder.prototype.v1';
const store = (fn) => { try { return fn(localStorage); } catch { return null; } };
S.storeKey = STORE_KEY;
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
  embed.report(S.project);
}
function undo(d) {
  const json = history.step(d);
  if (json == null) return;
  setProject(JSON.parse(json), { resetHistory: false });
  store((ls) => ls.setItem(STORE_KEY, json));
  refresh();
  embed.report(S.project);
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
els.map = h('section', { class: 'view view-map' });
app.append(els.top, els.side, h('main', { class: 'main' }, els.tabs, els.design, els.events, els.run, els.map));

const design = initDesign(els.design);
const events = initEvents(els.events);
const run = initRun(els.run);
const map = initMap(els.map);
const tabViews = { design: null, events, run, map };
Object.assign(hooks, { commit, refresh, select, notify, setTab });

// ---------------- top bar & tabs ----------------
function renderTop() {
  const sel = h('select', { class: 'ctl', 'data-ab': 'samples', 'aria-label': 'Load a sample' },
    h('option', { value: '' }, 'Samples…'),
    Object.keys(SAMPLES).map((n) => h('option', { value: n }, n)));
  sel.addEventListener('change', () => { if (sel.value) loadProject(SAMPLES[sel.value]()); });
  const f = S.project.features;
  const level = S.locked ? h('span', { class: 'tag lvl', title: 'Set by your teacher' }, S.rf.custom ? 'Lesson' : S.rf.name)
    : (() => {
      const l = h('select', { class: 'ctl', 'data-ab': 'level', 'aria-label': 'Level', title: 'How many blocks to show. Nothing you built is ever removed.' },
        S.rf.custom ? h('option', { value: 'custom', selected: true }, 'Level: Custom') : null,
        Object.entries(LEVELS).map(([n, d]) => h('option', { value: n, selected: !S.rf.custom && f.level === Number(n) }, `L${n}: ${d.name}`)));
      l.addEventListener('change', () => { if (l.value === 'custom') return; S.project.features = { level: Number(l.value) }; S.rf = resolve(S.project.features); commit(); });
      return l;
    })();
  els.top.replaceChildren(
    h('strong', { class: 'brand' }, 'App Builder', h('span', { class: 'tag' }, 'prototype')),
    h('input', { class: 'ctl name', 'data-ab': 'project-name', value: S.project.name, 'aria-label': 'Project name', oninput: (e) => { S.project.name = e.target.value; }, onchange: () => commit() }),
    h('span', { class: 'spacer' }),
    (() => {
      const d = h('select', { class: 'ctl', 'data-ab': 'screen-size', 'aria-label': 'Screen size', title: 'The size of the app you are building' },
        Object.entries(DEVICES).map(([k, v]) => h('option', { value: k, selected: S.project.device === k, title: `${v.w} \u00d7 ${v.h}` }, v.label)));
      d.addEventListener('change', () => { S.project.device = d.value; commit(); });
      return d;
    })(),
    level,
    h('button', { class: 'btn', 'data-ab': 'undo', disabled: !history.canUndo, title: 'Undo (Ctrl+Z)', onclick: () => undo(-1) }, 'Undo'),
    h('button', { class: 'btn', 'data-ab': 'redo', disabled: !history.canRedo, title: 'Redo (Ctrl+Shift+Z)', onclick: () => undo(1) }, 'Redo'),
    h('span', { class: 'sep' }),
    S.locked ? '' : sel, // a locked lesson link keeps students in the lesson project
    lessonStart ? h('button', { class: 'btn', 'data-ab': 'start-again', title: 'Throw away your changes and reload the lesson project', onclick: () => {
      if (confirmTwice('Start again? Your changes to this lesson will be lost.')) loadProject(lessonStart());
    } }, 'Start again')
      : h('button', { class: 'btn', 'data-ab': 'new', onclick: () => loadProject(newProject()) }, 'New'),
    h('button', { class: 'btn', 'data-ab': 'open', onclick: openFile }, 'Open…'),
    h('button', { class: 'btn primary', 'data-ab': 'save', onclick: saveFile }, 'Save'),
  );
}
// no confirm() in some hosts: ask by pressing twice within 4 seconds
let armed = 0;
function confirmTwice(msg) {
  if (Date.now() - armed < 4000) { armed = 0; document.querySelector('.toast')?.remove(); return true; }
  armed = Date.now();
  notify(msg + ' Press again to confirm.');
  return false;
}
function loadProject(p) {
  p = checkProject(p); applyParams(p);
  setTab('design');
  S.screenId = null; S.selId = null; S.sheet = 'screen';
  setProject(p);
  store((ls) => ls.setItem(STORE_KEY, JSON.stringify(S.project)));
  refresh();
  embed.report(S.project);
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
  els.tabs.replaceChildren(...[['design', 'Design'], ['events', 'Events'], ['map', 'Map'], ['run', 'Run ▶']].map(([id, label]) =>
    h('button', { class: 'tab' + (S.tab === id ? ' on' : ''), 'data-ab': 'tab:' + id, role: 'tab', 'aria-selected': S.tab === id, onclick: () => setTab(id) }, label)));
  els.design.hidden = S.tab !== 'design';
  els.events.hidden = S.tab !== 'events';
  els.run.hidden = S.tab !== 'run';
  els.map.hidden = S.tab !== 'map';
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
  map.render();
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
// ?code=<project JSON>: a lesson step's starter (Waypoints playgrounds pass their starter this way)
let codeStart = null;
try { if (QS.get('code')) { const p = JSON.parse(QS.get('code')); codeStart = () => structuredClone(p); } } catch { queueMicrotask(() => notify('The starter project for this step could not be read.')); }
const lessonStart = codeStart || (lessonId && sampleById(lessonId) ? () => sampleById(lessonId) : null);
if (lessonId && !lessonStart) queueMicrotask(() => notify(`There is no lesson called "${lessonId}". Opening your last project instead.`));
// No lesson link: a playground, so everything is offered (Level 4), like MakeCode or Construct. Lessons set their own level.
const playground = () => ({ ...SAMPLES['Minutes and goal (two screens)'](), features: { level: 4 } });
initial = checkProject(initial || (lessonStart ? lessonStart() : playground()));
applyParams(initial);
setProject(initial);
refresh();
const tab = new URLSearchParams(location.search).get('tab');
if (tab && tabViews[tab] !== undefined) setTab(tab);
window.__app = { S, setTab, loadProject }; // handy for debugging and tests

// An embedding page (a lesson) can start, reset and read the project. See src/embed.js.
const hadSaved = !!store((ls) => ls.getItem(STORE_KEY));
embed.start({
  start: (p) => { if (!hadSaved) loadProject(p); else embed.report(S.project); }, // a student's own work wins over the starter
  reset: (p) => loadProject(p),
  get: () => S.project,
});

// Several copies of App Builder can share one project (a lesson's build steps pass the same ?store=). When another
// copy saves it, take its version, so moving to the next step carries on from the same app.
window.addEventListener('storage', (e) => {
  if (e.key !== STORE_KEY || !e.newValue || e.newValue === JSON.stringify(S.project)) return;
  try {
    const p = checkProject(JSON.parse(e.newValue)); applyParams(p);
    const tab = S.tab;
    setProject(p); // keeps the open screen when it still exists
    S.selId = null;
    refresh();
    setTab(tab); // restarts the open view's preview on the new project
    embed.report(S.project);
  } catch { /* a broken copy elsewhere: keep ours */ }
});
