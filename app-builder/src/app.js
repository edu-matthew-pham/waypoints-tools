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
import { LEVELS, resolve, fromParams } from './edu/features.js';
import { embed } from './embed.js';
import { addBuiltinSounds, sources } from './core/assets.js';
import { projectMedia, useMedia } from './player.js';
// Where media comes from, set here rather than in core: built-in sound files beside App Builder, plus more listed in
// extra.json (e.g. FreePD tracks; none is fine). Video links: core/assets.js videoSource (Commons; YouTube opt-in).
const MEDIA_SOURCES = { soundBase: 'sounds/', extraSounds: 'sounds/extra.json' };
sources.soundBase = MEDIA_SOURCES.soundBase;
useMedia(projectMedia(() => S.project));
fetch(MEDIA_SOURCES.extraSounds, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : [])).then((list) => { addBuiltinSounds(list); hooks.refresh?.(); }).catch(() => {});
import { SAMPLES, sampleById } from './samples.js';
import * as mediaStore from './media-store.js';
import { buildSave, readProjectFile, savesAsZip, saveName } from './project-file.js';
import { modal } from './ui/sheet-dialogs.js';
import { openMenu } from './ui/menu.js';
import { encodeApp, decodeApp, canShareByLink } from './core/share-link.js';
import { startPlay } from './play-page.js';

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
mediaStore.setNotify(notify);

// Before a project is shown: move uploads still inside it into the media store, and load the files it and its
// remembered values use, so pictures and sounds show instantly. Changes p.
async function prepareMedia(p) {
  await mediaStore.moveUploads(p);
  const missing = await mediaStore.load(p) + await mediaStore.load(remembered());
  if (missing) notify(`${missing === 1 ? 'A picture or recording' : missing + ' pictures or recordings'} in this project ${missing === 1 ? 'isn\u2019t' : 'aren\u2019t'} in this browser (made on another computer, or the site\u2019s data was cleared). Open a saved file of the project to bring ${missing === 1 ? 'it' : 'them'} back.`);
}
// what "Remember between visits" kept for this App Builder (lists and tables can hold media references)
function remembered() {
  const out = [];
  store((ls) => { for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k?.startsWith(STORE_KEY + '.remember.')) out.push(ls.getItem(k)); } });
  return out.map((t) => { try { return JSON.parse(t); } catch { return null; } });
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
  if (!history) return; // still starting
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
  // the brand bar: name, then File (Open, Save), Edit (Undo, Redo), then the app's settings and samples
  const ICON = {
    open: '<path d="M4 7h6l2 2h8v10H4z"/>',
    save: '<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>',
    undo: '<path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3"/>',
    again: '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5"/>',
    new: '<path d="M12 5v14M5 12h14"/>',
    recent: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  };
  const icon = (k) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = ICON[k]; return s; };
  els.top.replaceChildren(
    h('strong', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, '⚡'), 'App Builder', h('span', { class: 'tag' }, 'prototype')),
    h('input', { class: 'ctl name', 'data-ab': 'project-name', value: S.project.name, 'aria-label': 'Project name', oninput: (e) => { S.project.name = e.target.value; }, onchange: () => commit() }),
    h('span', { class: 'grp' },
      lessonStart ? h('button', { class: 'btn', 'data-ab': 'start-again', title: 'Throw away your changes and reload the lesson project', onclick: () => {
        if (confirmTwice('Start again? Your changes to this lesson will be lost.')) loadProject(lessonStart());
      } }, icon('again'), 'Start again')
        : h('button', { class: 'btn', 'data-ab': 'new', title: 'Start a new app', onclick: () => loadProject(newProject()) }, icon('new'), 'New'),
      h('button', { class: 'btn', 'data-ab': 'open', title: 'Open a saved app (.json or .zip)', onclick: openFile }, icon('open'), 'Open…'),
      S.locked ? '' : h('button', { class: 'btn', 'data-ab': 'recent', title: 'Apps you had before in this browser', 'aria-haspopup': 'menu', onclick: (e) => recentMenu(e.currentTarget) }, icon('recent'), 'Recent'),
      h('button', { class: 'btn primary', 'data-ab': 'save', title: saveTo ? `Save to ${saveTo.handle.name} (Ctrl+S)` : 'Save this app as a file (Ctrl+S)', onclick: () => saveFile() }, icon('save'), 'Save'),
      h('button', { class: 'btn', 'data-ab': 'share', title: 'Share a link to your working app', onclick: shareApp }, icon('share'), 'Share'),
      canPick ? h('button', { class: 'btn icon-only save-as', 'data-ab': 'save-as', title: 'Save as… a new file (Ctrl+Shift+S)', onclick: () => saveFile({ as: true }) }, h('span', { 'aria-hidden': 'true' }, '▾'), h('span', { class: 'lbl' }, 'Save as…')) : ''),
    h('span', { class: 'grp' },
      h('button', { class: 'btn icon-only', 'data-ab': 'undo', disabled: !history.canUndo, title: 'Undo (Ctrl+Z)', onclick: () => undo(-1) }, icon('undo'), h('span', { class: 'lbl' }, 'Undo')),
      h('button', { class: 'btn icon-only', 'data-ab': 'redo', disabled: !history.canRedo, title: 'Redo (Ctrl+Shift+Z)', onclick: () => undo(1) }, icon('redo'), h('span', { class: 'lbl' }, 'Redo'))),
    h('span', { class: 'spacer' }),
    h('span', { class: 'grp' },
      S.locked ? '' : sel, // a locked lesson link keeps students in the lesson project
      level,
      (() => {
        const d = h('select', { class: 'ctl', 'data-ab': 'screen-size', 'aria-label': 'Screen size', title: 'The size of the app you are building' },
          Object.entries(DEVICES).map(([k, v]) => h('option', { value: k, selected: S.project.device === k, title: `${v.w} × ${v.h}` }, v.label)));
        d.addEventListener('change', () => { S.project.device = d.value; commit(); });
        return d;
      })()),
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
// Loading another app (New, a sample, Open, a recent app, Start again) never loses the one you had: it goes into
// Recent (kept in this browser), and Undo straight after brings it back.
const RECENT_KEY = STORE_KEY + '.recent', RECENT_MAX = 5;
function recentApps() {
  try { return JSON.parse(store((ls) => ls.getItem(RECENT_KEY)) || '[]'); } catch { return []; }
}
const emptyApp = (p) => p.screens.length <= 1 && !p.variables.length && !(p.assets || []).length && !(p.sounds || []).length
  && p.screens.every((s) => !s.events.length) && !(p.allScreens?.events || []).length && !(p.functions || []).length;
function keepInRecent(p) {
  if (!p || emptyApp(p)) return;
  const json = JSON.stringify(p);
  let list = recentApps().filter((r) => r.json !== json);
  list.unshift({ name: p.name || 'Untitled app', at: Date.now(), json });
  list = list.slice(0, RECENT_MAX);
  // full storage: drop the oldest until it fits (the app itself is already saved separately)
  while (list.length && !store((ls) => { ls.setItem(RECENT_KEY, JSON.stringify(list)); return true; })) list.pop();
}
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
function recentMenu(btn) {
  const list = recentApps();
  const r = btn.getBoundingClientRect();
  openMenu({ x: r.left, y: r.bottom + 4, returnFocus: btn, items: list.length
    ? list.map((it, i) => ({ label: `${it.name} · ${ago(it.at)}`, fn: () => {
      keepInRecent(S.project);
      const rest = recentApps().filter((x) => x.json !== it.json); // it moves from Recent back to being your app
      store((ls) => ls.setItem(RECENT_KEY, JSON.stringify(rest)));
      loadProject(JSON.parse(it.json), { toRecent: false });
    } }))
    : [{ label: 'No recent apps yet: when you start a new app or open another, the one you had goes here', fn: () => {}, disabled: true }] });
}

async function loadProject(p, { toRecent = true } = {}) {
  p = checkProject(p); applyParams(p);
  await prepareMedia(p);
  const before = history && S.project;
  if (toRecent && before) keepInRecent(before);
  saveTo = null; // a different app: the next Save asks where
  setTab('design');
  S.screenId = null; S.selId = null; S.sheet = 'screen';
  setProject(p, { resetHistory: !before });
  if (before) history.push(JSON.stringify(S.project)); // Undo goes back to the app you had
  store((ls) => ls.setItem(STORE_KEY, JSON.stringify(S.project)));
  refresh();
  embed.report(S.project);
}
// Save: a .json, or a .zip with a media/ folder when the app has pictures or recordings (project-file.js). When
// "Remember between visits" kept anything, ask whether to include it (ticked: the whole app as it is; unticked: just
// the app, e.g. to share as a starting point).
function rememberedNow() {
  const out = {};
  for (const v of S.project.variables) {
    if (!v.remember) continue;
    const t = store((ls) => ls.getItem(`${STORE_KEY}.remember.${v.name}`));
    if (t == null) continue;
    try { out[v.name] = JSON.parse(t); } catch { /* skip */ }
  }
  return out;
}
// Save works like a desktop app where the browser allows it (Chrome, Edge: the File System Access API). The first Save
// asks where to save (the computer's own Save box, which can be Google Drive on a Chromebook or a synced OneDrive
// folder); later Saves (and Ctrl+S) update that same file. Save as… (Ctrl+Shift+S) always asks. Elsewhere (Safari,
// Firefox) Save downloads a file each time, as before. The browser forgets the file on reload, so the next Save asks.
const canPick = typeof window.showSaveFilePicker === 'function' && !window.claude;
let saveTo = null;        // { handle, zip, kept } : the file the last Save went to, and whether it included kept data
function saveFile({ as = false } = {}) {
  if (!as && saveTo && canPick) { writeTo(saveTo.handle, saveTo.kept ? rememberedNow() : null, saveTo); return; }
  const kept = rememberedNow(), n = Object.keys(kept).length;
  if (!n) { chooseAndSave(null); return; }
  const box = h('input', { type: 'checkbox', checked: saveTo ? saveTo.kept : true, 'data-ab': 'save-include-data' });
  const { close } = modal(as ? 'Save a copy as…' : 'Save',
    h('div', {},
      h('label', { class: 'f check wide' }, box,
        h('span', {}, `Include what the app kept while running (${n === 1 ? '1 saved value' : n + ' saved values'}: rows, lists, and any drawings, photos or recordings in them)`)),
      h('p', { class: 'muted small' }, 'Untick it to save just the app, for example to share it as a starting point. Saving is also the backup: things kept in this browser stay on this computer only.')),
    [h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', 'data-ab': 'save-confirm', onclick: () => { close(); chooseAndSave(box.checked ? kept : null); } }, 'Save')]);
}
// Ask where (where the browser can), then write. The Save box opens first, while the click still counts as the user's.
async function chooseAndSave(remembered) {
  const zip = savesAsZip(S.project, remembered);
  if (!canPick) { download(remembered); return; }
  let handle;
  try {
    handle = await window.showSaveFilePicker({ suggestedName: saveName(S.project, zip),
      types: [zip ? { description: 'App Builder app with pictures and sounds', accept: { 'application/zip': ['.zip'] } }
        : { description: 'App Builder app', accept: { 'application/json': ['.json'] } }] });
  } catch (e) {
    if (e?.name === 'AbortError') return; // the user closed the Save box
    download(remembered); return;          // not allowed here (some embedded pages): download instead
  }
  writeTo(handle, remembered, { handle, zip, kept: !!remembered });
}
async function writeTo(handle, remembered, target) {
  // the app gained its first picture or recording since: a .json file can't hold it, so ask for a new place
  if (savesAsZip(S.project, remembered) !== target.zip) { saveTo = null; notify('This app now has pictures or sounds, so it saves as a .zip: choose where.'); saveFile({ as: true }); return; }
  let file;
  try { file = await buildSave(S.project, remembered); } catch (e) { notify('Could not save: ' + (e?.message || 'unknown problem')); return; }
  missingNote(file);
  try {
    if ((await handle.queryPermission?.({ mode: 'readwrite' })) === 'prompt') await handle.requestPermission({ mode: 'readwrite' });
    const w = await handle.createWritable();
    await w.write(new Blob([file.data], { type: file.type }));
    await w.close();
    saveTo = target;
    renderTop();
    notify(`Saved to ${handle.name}`);
  } catch (e) {
    saveTo = null; renderTop();
    notify('Could not save to that file (' + (e?.message || 'it may have moved') + '). Press Save to choose again.');
  }
}
function missingNote(file) {
  if (file.missing) notify(`${file.missing} picture${file.missing === 1 ? '' : 's'} or recording${file.missing === 1 ? '' : 's'} could not be found in this browser, so ${file.missing === 1 ? 'it is' : 'they are'} not in the file.`);
}
async function download(remembered) {
  let file;
  try { file = await buildSave(S.project, remembered); } catch (e) { notify('Could not save: ' + (e?.message || 'unknown problem')); return; }
  missingNote(file);
  // Hosted pages can't start downloads themselves; use the page-download feature when it exists.
  try {
    const dl = await window.claude?.use?.('downloads');
    if (dl) { await dl.save({ filename: file.filename, data: file.data }); return; }
  } catch (e) {
    if (e?.code === 'declined') return;
    if (typeof file.data === 'string') { notify('Could not save: ' + (e?.message || 'unknown problem')); return; }
    // a zip the page-download feature wouldn't take: try an ordinary download below
  }
  const a = h('a', { href: URL.createObjectURL(new Blob([file.data], { type: file.type })), download: file.filename });
  document.body.append(a); a.click(); a.remove();
}
// Open: the computer's Open box where the browser allows it, so Save then goes back to that same file
async function openFile() {
  if (typeof window.showOpenFilePicker === 'function' && canPick) {
    let handle;
    try {
      [handle] = await window.showOpenFilePicker({ types: [{ description: 'App Builder app', accept: { 'application/json': ['.json'], 'application/zip': ['.zip'] } }] });
    } catch (e) { if (e?.name === 'AbortError') return; handle = null; }
    if (handle) { await openFrom(await handle.getFile(), handle); return; }
  }
  const input = h('input', { type: 'file', accept: '.json,.zip,application/json,application/zip' });
  input.addEventListener('change', () => openFrom(input.files[0], null));
  input.click();
}
async function openFrom(fileObj, handle) {
  try {
    const { project, remembered, missing } = await readProjectFile(fileObj);
    // what the app kept while running goes back first, so its pictures and recordings load with the project
    if (remembered) store((ls) => { for (const [k, v] of Object.entries(remembered)) ls.setItem(`${STORE_KEY}.remember.${k}`, JSON.stringify(v)); });
    await loadProject(project);
    if (handle) { saveTo = { handle, zip: /\.zip$/i.test(handle.name), kept: !!remembered }; renderTop(); }
    if (missing) notify(`${missing} picture${missing === 1 ? '' : 's'} or recording${missing === 1 ? '' : 's'} weren’t in the file.`);
  } catch (e) { notify('Could not open that file: ' + e.message); }
}

// Share by link (core/share-link.js): the whole app inside the link; it opens just the working app (#play=), with a
// button there to open a copy in App Builder (#open=). Apps with their own pictures or sounds are shared as a file.
async function shareApp() {
  if (!canShareByLink(S.project)) {
    const { close } = modal('Share', h('p', {}, 'This app has pictures or sounds of its own (uploaded or recorded), and they are too big to fit in a link. Save it and share the file instead: the other person opens it with Open\u2026 in App Builder.'),
      [h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close'), h('button', { class: 'btn primary', type: 'button', onclick: () => { close(); saveFile(); } }, 'Save the file')]);
    return;
  }
  let url;
  try { url = location.origin + location.pathname + '#play=' + await encodeApp(S.project); } catch (e) { notify('Could not make a link: ' + (e?.message || 'unknown problem')); return; }
  const box = h('input', { class: 'ctl share-link', readonly: '', value: url, 'aria-label': 'Link to your app', 'data-ab': 'share-link', onfocus: (e) => e.target.select() });
  const copy = h('button', { class: 'btn primary', type: 'button', 'data-ab': 'share-copy', onclick: async () => {
    try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied'; } catch { box.focus(); box.select(); copy.textContent = 'Press Ctrl+C to copy'; }
  } }, 'Copy link');
  const { close } = modal('Share by link',
    h('div', {},
      h('p', {}, 'Anyone with this link can use your app, and open their own copy to look inside. Your app stays as it is; if you change it later, share a new link.'),
      box,
      url.length > 8000 ? h('p', { class: 'muted small' }, `A long link (${Math.round(url.length / 1000)}k characters). Email or a class page is safest; some chat apps cut long links short.`) : null,
      h('p', { class: 'muted small' }, 'Nothing is uploaded: the app is inside the link itself. What the app remembers stays in each person\u2019s own browser.')),
    [h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close'),
      h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener', 'data-ab': 'share-open' }, 'Try the link'), copy]);
}

function renderTabs() {
  // while the app runs, the Run tab reads Stop and goes back to the tab you came from (Restart is on the Run tab)
  const running = S.tab === 'run';
  els.tabs.replaceChildren(...[['design', 'Design'], ['events', 'Events'], ['map', 'Map'], ['run', running ? '■ Stop' : 'Run ▶']].map(([id, label]) =>
    h('button', { class: 'tab' + (S.tab === id ? ' on' : '') + (id === 'run' && running ? ' stop' : ''), 'data-ab': 'tab:' + id, role: 'tab', 'aria-selected': S.tab === id,
      title: id === 'run' ? (running ? 'Stop the app and go back' : 'Run the app') : null,
      onclick: () => setTab(id === 'run' && running ? (lastTab !== 'run' ? lastTab : 'design') : id) }, label)));
  els.design.hidden = S.tab !== 'design';
  els.events.hidden = S.tab !== 'events';
  els.run.hidden = S.tab !== 'run';
  els.map.hidden = S.tab !== 'map';
}
let lastTab = 'design';
function setTab(t) {
  if (S.tab !== 'run') lastTab = S.tab;
  tabViews[S.tab]?.deactivate();
  S.tab = t;
  renderTabs();
  refresh();
  tabViews[t]?.activate();
}

// ---------------- refresh ----------------
function refresh(source) {
  if (S.playing || !S.project) return; // a shared link's play-only page has no editor
  renderTop();
  renderSide(els.side);
  design.render();
  events.render(source);
  map.render();
  renderTabs();
}

document.addEventListener('keydown', (e) => {
  if (S.playing || !history) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(e.shiftKey ? 1 : -1); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile({ as: e.shiftKey }); return; }
  if (S.tab === 'design' && !typing && design.onKey(e)) e.preventDefault();
});

// a shared link pasted into this same tab only changes the # part, which doesn't reload the page: start again
addEventListener('hashchange', () => { if (/^#(play|open)=/.test(location.hash)) location.reload(); });

// ---------------- boot ----------------
let initial = null;
const hadSaved = !!store((ls) => ls.getItem(STORE_KEY));
try { const saved = store((ls) => ls.getItem(STORE_KEY)); if (saved) initial = JSON.parse(saved); } catch { /* ignore */ }
// ?code=<project JSON>: a lesson step's starter (Waypoints playgrounds pass their starter this way)
let codeStart = null;
try { if (QS.get('code')) { const p = JSON.parse(QS.get('code')); codeStart = () => structuredClone(p); } } catch { queueMicrotask(() => notify('The starter project for this step could not be read.')); }
const lessonStart = codeStart || (lessonId && sampleById(lessonId) ? () => sampleById(lessonId) : null);
if (lessonId && !lessonStart) queueMicrotask(() => notify(`There is no lesson called "${lessonId}". Opening your last project instead.`));
// No lesson link: a playground, so everything is offered (Level 4), like MakeCode or Construct. Lessons set their own level.
const playground = () => ({ ...SAMPLES['Minutes and goal (two screens)'](), features: { level: 4 } });
// Async only to load media first (IndexedDB answers later); everything after it runs as before.
boot();
async function boot() {
// a shared link (#play=…): just the working app, no editor (play-page.js)
if (location.hash.startsWith('#play=')) { S.playing = true; await startPlay(location.hash.slice(6), { soundBase: MEDIA_SOURCES.soundBase }); return; }
initial = checkProject(initial || (lessonStart ? lessonStart() : playground()));
applyParams(initial);
const before = JSON.stringify(initial);
await prepareMedia(initial);
setProject(initial);
if (hadSaved && JSON.stringify(S.project) !== before) store((ls) => ls.setItem(STORE_KEY, history.current)); // uploads moved out
mediaStore.tidy(S.project).catch(() => {});
// #open=…: "Open a copy in App Builder" from a shared app. Your current app goes to Recent (loadProject).
if (location.hash.startsWith('#open=')) {
  const code = location.hash.slice(6);
  window.history.replaceState(null, '', location.pathname + location.search);
  try { await loadProject(await decodeApp(code)); notify('This is your own copy of the shared app. The app you had before is in Recent.'); }
  catch { notify('That link couldn\u2019t be opened: it may have been cut short.'); }
}
refresh();
const tab = new URLSearchParams(location.search).get('tab');
if (tab && tabViews[tab] !== undefined) setTab(tab);
window.__app = { S, setTab, loadProject }; // handy for debugging and tests

// An embedding page (a lesson) can start, reset and read the project. See src/embed.js.
embed.start({
  start: (p) => { if (!hadSaved) loadProject(p); else embed.report(S.project); }, // a student's own work wins over the starter
  reset: (p) => loadProject(p),
  get: () => S.project,
});

// Several copies of App Builder can share one project (a lesson's build steps pass the same ?store=). When another
// copy saves it, take its version, so moving to the next step carries on from the same app.
window.addEventListener('storage', async (e) => {
  if (e.key !== STORE_KEY || !e.newValue || e.newValue === JSON.stringify(S.project)) return;
  try {
    const p = checkProject(JSON.parse(e.newValue)); applyParams(p);
    await mediaStore.load(p); // files the other copy just kept
    const tab = S.tab;
    setProject(p); // keeps the open screen when it still exists
    S.selId = null;
    refresh();
    setTab(tab); // restarts the open view's preview on the new project
    embed.report(S.project);
  } catch { /* a broken copy elsewhere: keep ours */ }
});
}
