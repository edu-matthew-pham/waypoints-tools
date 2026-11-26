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
import { parseSource, loadStarter, loadRef, tutorialUrl } from './edu/tutorial.js';
import { startTutorial } from './ui/tutorial-panel.js';
import { sheetText } from './core/sheet-text.js';
import { addBuiltinSounds, sources } from './core/assets.js';
import { projectMedia, useMedia, Player, localStore } from './player.js';
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
import { storeKeyFor, readProgress, writeProgress, fitsInLink, encodeCarry, decodeCarry, tutorialLinkPart } from './carry.js';
import qrcode from 'qrcode-generator';
import { DRIVE, configured } from './drive/config.js';
import { createOneDrive } from './drive/onedrive.js';
import { createGoogleDrive } from './drive/gdrive.js';
import { driveDialog } from './ui/drive-dialog.js';

// ?sample=water opens that lesson project. Each lesson link keeps its own saved work, so a student who
// comes back (or refreshes) carries on where they were; "Start again" reloads the original.
const QS = new URLSearchParams(location.search);
const lessonId = QS.get('sample');
// ?store=<key>: a page that embeds App Builder (one per lesson step) keeps each copy's work apart.
const storeId = QS.get('store') || QS.get('id'); // ?id= is a Waypoints lesson step
// ?lesson=code/apps/practice-tracker (or ?tutorial=<url>): a guided tutorial read from that lesson (edu/tutorial.js).
// Off without one of these, so nothing changes for normal use or in the lessons' own clips.
const tutorialLink = tutorialUrl(QS, location.href);
const STORE_KEY = storeKeyFor(location.search, location.href); // ?store=, then a tutorial, then ?sample=, else the playground
let tutorial = null; // the step card, once loaded
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
  reportChange();
}
// after every change: the page embedding App Builder (embed.js) and the tutorial's ticks
function reportChange() { embed.report(S.project); tutorial?.changed(); }
function undo(d) {
  if (!history) return; // still starting
  const json = history.step(d);
  if (json == null) return;
  setProject(JSON.parse(json), { resetHistory: false });
  store((ls) => ls.setItem(STORE_KEY, json));
  refresh();
  reportChange();
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
    cloud: '<path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 9.2 4.4 4.4 0 0 0 7 18z"/>',
    carry: '<rect x="3" y="5" width="13" height="10" rx="1"/><path d="M1 18h17"/><rect x="18" y="9" width="5" height="10" rx="1"/>',
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
      h('button', { class: 'btn', 'data-ab': 'open', title: Object.keys(drives).length ? 'Open a saved app: from this computer, or from your drive' : 'Open a saved app (.json or .zip)', 'aria-haspopup': Object.keys(drives).length ? 'menu' : null,
        onclick: (e) => (Object.keys(drives).length ? openMenuAt(e.currentTarget) : openFile()) }, icon('open'), 'Open…'),
      S.locked ? '' : h('button', { class: 'btn', 'data-ab': 'recent', title: 'Apps you had before in this browser', 'aria-haspopup': 'menu', onclick: (e) => recentMenu(e.currentTarget) }, icon('recent'), 'Recent'),
      h('button', { class: 'btn primary', 'data-ab': 'save', title: saveTo?.drive ? `Save to ${drives[saveTo.drive].name}: ${saveTo.name} (Ctrl+S)` : saveTo ? `Save to ${saveTo.handle.name} (Ctrl+S)` : Object.keys(drives).length ? 'Save this app: to this computer or your drive (Ctrl+S)' : 'Save this app as a file (Ctrl+S)', onclick: () => saveFile() }, icon('save'), 'Save'),
      (canPick || Object.keys(drives).length) ? h('button', { class: 'btn icon-only save-as', 'data-ab': 'save-as', 'aria-haspopup': Object.keys(drives).length ? 'menu' : null,
        title: Object.keys(drives).length ? 'Save to… this computer or your drive (Ctrl+Shift+S)' : 'Save as… a new file (Ctrl+Shift+S)',
        onclick: (e) => (Object.keys(drives).length ? saveMenuAt(e.currentTarget) : saveFile({ as: true })) }, h('span', { 'aria-hidden': 'true' }, '▾'), h('span', { class: 'lbl' }, 'Save to…')) : '',
      h('button', { class: 'btn', 'data-ab': 'share', title: 'Share a link to your working app', onclick: shareApp }, icon('share'), 'Share'),
      h('button', { class: 'btn', 'data-ab': 'continue', title: 'Carry on with this app (and your tutorial step) on another computer or tablet', onclick: continueElsewhere }, icon('carry'), 'Other device')),
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
function keepInRecent(p, key = RECENT_KEY) {
  if (!p || emptyApp(p)) return;
  const json = JSON.stringify(p);
  let list = (key === RECENT_KEY ? recentApps() : (() => { try { return JSON.parse(store((ls) => ls.getItem(key)) || '[]'); } catch { return []; } })()).filter((r) => r.json !== json);
  list.unshift({ name: p.name || 'Untitled app', at: Date.now(), json });
  list = list.slice(0, RECENT_MAX);
  // full storage: drop the oldest until it fits (the app itself is already saved separately)
  while (list.length && !store((ls) => { ls.setItem(key, JSON.stringify(list)); return true; })) list.pop();
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
  reportChange();
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
  // Save goes back to wherever this app was last saved or opened: a drive file, or a file on this computer
  if (!as && saveTo?.drive) {
    const d = drives[saveTo.drive];
    saveToDrive(d, { id: saveTo.id }).catch((e) => { if (e?.code === 'signin') driveBox(d, 'save'); else notify(e?.message || 'Couldn\u2019t save to your drive.'); });
    return;
  }
  // not saved anywhere yet, with drives on offer: ask where (the Save ▾ menu)
  if (!saveTo && Object.keys(drives).length) { saveMenuAt(document.querySelector('[data-ab=save]')); return; }
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
  try { file = await buildSave(S.project, remembered, progressNow()); } catch (e) { notify('Could not save: ' + (e?.message || 'unknown problem')); return; }
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
  try { file = await buildSave(S.project, remembered, progressNow()); } catch (e) { notify('Could not save: ' + (e?.message || 'unknown problem')); return; }
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
  try { await openRead(await readProjectFile(fileObj), handle ? { handle, zip: /\.zip$/i.test(handle.name) } : null); }
  catch (e) { notify('Could not open that file: ' + e.message); }
}
// a project read from a file (on the computer or in a drive); target: where Save goes back to, or null
async function openRead({ project, remembered, progress, missing }, target) {
  // what the app kept while running goes back first, so its pictures and recordings load with the project
  if (remembered) store((ls) => { for (const [k, v] of Object.entries(remembered)) ls.setItem(`${STORE_KEY}.remember.${k}`, JSON.stringify(v)); });
  await loadProject(project);
  if (target) { saveTo = { ...target, kept: !!remembered }; renderTop(); }
  if (missing) notify(`${missing} picture${missing === 1 ? '' : 's'} or recording${missing === 1 ? '' : 's'} weren’t in the file.`);
  if (progress) carryOn({ project, remembered, progress });
}

// ---------------- your drive (src/drive, ui/drive-dialog.js) ----------------
// Sign in with Microsoft or Google and save to an App Builder folder in the student's own drive. Shown only when a
// client ID is set in drive/config.js. A drive save holds everything, like Continue: the app, what it kept, the step.
const drives = {};
for (const id of configured()) drives[id] = id === 'microsoft' ? createOneDrive({ clientId: DRIVE.microsoft.clientId }) : createGoogleDrive({ clientId: DRIVE.google.clientId });
// Save ▾ and Open ▾: this computer, or a drive (each drive's dialog signs in first if needed)
const menuAt = (btn, items) => { const r = btn.getBoundingClientRect(); openMenu({ x: r.left, y: r.bottom + 4, returnFocus: btn, items }); };
const signOuts = () => Object.values(drives).filter((d) => d.signedIn()).map((d) => ({ label: `Sign out of ${d.name}${d.account()?.email ? ' (' + d.account().email + ')' : ''}`, fn: () => { d.signOut(); renderTop(); notify(`Signed out of ${d.name}.`); } }));
function saveMenuAt(btn) {
  menuAt(btn, [...Object.values(drives).map((d) => ({ label: `Save to ${d.name}\u2026`, fn: () => driveBox(d, 'save') })),
    { label: 'Save to this computer\u2026', fn: () => saveFile({ as: true }) }, ...signOuts()]);
}
function openMenuAt(btn) {
  menuAt(btn, [{ label: 'Open from this computer\u2026', fn: openFile },
    ...Object.values(drives).map((d) => ({ label: `Open from ${d.name}\u2026`, fn: () => driveBox(d, 'open') })), ...signOuts()]);
}
function driveBox(d, mode) {
  driveDialog({ d, mode, name: S.project.name, current: saveTo?.drive ? saveTo : null, notify,
    here: mode === 'save' ? () => saveFile({ as: true }) : openFile,
    save: saveToDrive,
    open: async (dd, it) => { await openRead(await readProjectFile(await dd.open(it.id)), { drive: dd.id, id: it.id, name: it.name, zip: /\.zip$/i.test(it.name) }); notify(`Opened ${it.name.replace(/\.app\.(json|zip)$/i, '')} from ${dd.name}.`); },
    removed: (dd, it) => { if (saveTo?.drive === dd.id && saveTo.id === it.id) { saveTo = null; renderTop(); } } }); // the app stays open; Save asks where
}
// Save to a drive: over an app already there (id), or as a new one (name). A drive save holds everything, like Continue:
// the app, what it kept, the tutorial step.
async function saveToDrive(d, { id = null, name = null } = {}) {
  const kept = rememberedNow();
  const file = await buildSave(S.project, Object.keys(kept).length ? kept : null, progressNow());
  missingNote(file);
  const zip = /\.zip$/.test(file.filename), ext = zip ? '.app.zip' : '.app.json';
  let target = id, filename;
  if (id) {
    const was = (saveTo?.drive === d.id && saveTo.id === id) ? saveTo.name : (name || '');
    // the app now needs the other kind of file (it gained or lost pictures): a new file beside it, same name
    if (was && !was.toLowerCase().endsWith(ext)) { target = null; name = was.replace(/\.app\.(json|zip)$/i, ''); }
    else filename = was || null;
  }
  if (!target) {
    const base = saveName({ name: name || S.project.name }, zip);
    const taken = new Set((await d.list()).map((it) => it.name.toLowerCase()));
    filename = base;
    for (let n = 2; taken.has(filename.toLowerCase()); n++) filename = base.replace(/(\.app\.(json|zip))$/i, ` (${n})$1`);
  }
  const done = await d.save({ name: filename, data: file.data, type: file.type, id: target });
  saveTo = { drive: d.id, id: done.id, name: done.name || filename, zip, kept: true };
  renderTop();
  notify(`Saved to ${d.name}: ${saveTo.name.replace(/\.app\.(json|zip)$/i, '')}`);
}

// ---------------- continue on another device (carry.js) ----------------
// Where the student is in this page's guided tutorial (null without one): it goes into saved files and Continue links.
function progressNow() {
  if (!tutorial || !tutorialLink?.id) return null;
  const p = readProgress(store, tutorialLink.id, location.search);
  return p && tutorialTitle ? { ...p, title: tutorialTitle } : p;
}
let tutorialTitle = '';
// Progress that came with a file or link. This page's tutorial: carry on at that step. Another tutorial (or none open,
// e.g. plain App Builder at home): offer to go to it, with the app, what it kept and the step already in place there.
function carryOn({ project, remembered, progress }) {
  if (tutorial && progress.tutorial === tutorialLink?.id) {
    writeProgress(store, progress); tutorial.reload();
    notify(`Carrying on with the tutorial at step ${progress.step + 1}.`);
    return;
  }
  const name = progress.title ? `“${progress.title}”` : 'a guided tutorial';
  const { close } = modal('Carry on with the tutorial?',
    h('p', {}, `This app comes from ${name}, where you were at step ${progress.step + 1}. Go to the tutorial to carry on there, or keep the app open here without it.`),
    [h('button', { class: 'btn', type: 'button', 'data-ab': 'carry-stay', onclick: () => close() }, 'Just the app'),
      h('button', { class: 'btn primary', type: 'button', 'data-ab': 'carry-go', onclick: () => {
        const key = storeKeyFor(progress.link, location.href);
        if (key !== STORE_KEY) {
          // anything already being built there on this computer goes into that page's Recent, never lost
          try { keepInRecent(JSON.parse(store((ls) => ls.getItem(key)) || 'null'), key + '.recent'); } catch { /* none */ }
          store((ls) => ls.setItem(key, JSON.stringify(project)));
          if (remembered) store((ls) => { for (const [k, v] of Object.entries(remembered)) ls.setItem(`${key}.remember.${k}`, JSON.stringify(v)); });
        }
        writeProgress(store, progress);
        location.href = location.pathname + progress.link;
      } }, 'Go to the tutorial')]);
}
async function continueElsewhere() {
  const remembered = rememberedNow(), progress = progressNow();
  const carry = { project: S.project, remembered: Object.keys(remembered).length ? remembered : null, progress };
  const what = 'this app' + (carry.remembered ? ', what it has kept,' : '') + (progress ? ' and your tutorial step' : '');
  if (!fitsInLink(carry)) {
    const { close } = modal('Continue on another device',
      h('div', {},
        h('p', {}, `This app has pictures or recordings of its own, which are too big for a link. Save it as a file instead: it holds ${what}.`),
        h('p', {}, 'Save it somewhere you can reach from the other computer, like your OneDrive or Google Drive, then use Open… in App Builder there.')),
      [h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close'), h('button', { class: 'btn primary', type: 'button', 'data-ab': 'continue-save', onclick: () => { close(); saveFile(); } }, 'Save the file')]);
    return;
  }
  let url;
  try { url = location.origin + location.pathname + tutorialLinkPart(location.search) + '#continue=' + await encodeCarry(carry); } catch (e) { notify('Could not make a link: ' + (e?.message || 'unknown problem')); return; }
  const box = h('input', { class: 'ctl share-link', readonly: '', value: url, 'aria-label': 'Link to carry on with your app', 'data-ab': 'continue-link', onfocus: (e) => e.target.select() });
  const copy = h('button', { class: 'btn primary', type: 'button', 'data-ab': 'continue-copy', onclick: async () => {
    try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied'; } catch { box.focus(); box.select(); copy.textContent = 'Press Ctrl+C to copy'; }
  } }, 'Copy link');
  const qr = qrFor(url);
  const { close } = modal('Continue on another device',
    h('div', {},
      h('p', {}, `Open this link on the other computer to carry on: it brings ${what}. Email it to yourself, or put it somewhere you can reach from there.`),
      box,
      qr ? h('div', { class: 'carry-qr' }, qr, h('p', { class: 'muted small' }, 'Or scan this with a tablet or phone camera.'))
        : h('p', { class: 'muted small' }, 'This app is too big for a QR code: copy the link instead.'),
      h('p', { class: 'muted small' }, 'The link is a copy, made now: changes on the other device don’t come back here. Carry on in one place at a time, and make a new link when you move again. Nothing is uploaded: everything is inside the link.')),
    [h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close'), copy]);
}
// a QR code for the link (an <svg>), or null when the link is too long to scan easily from a screen
const QR_MAX = 2000;
function qrFor(url) {
  if (url.length > QR_MAX) return null;
  try {
    const q = qrcode(0, 'L'); q.addData(url, 'Byte'); q.make();
    const box = h('div', { class: 'qr', 'data-ab': 'continue-qr', role: 'img', 'aria-label': 'QR code of the link' });
    box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    return box;
  } catch { return null; }
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
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (e.shiftKey && Object.keys(drives).length) saveMenuAt(document.querySelector('[data-ab=save]')); else saveFile({ as: e.shiftKey }); return; }
  if (S.tab === 'design' && !typing && design.onKey(e)) e.preventDefault();
});

// a shared link pasted into this same tab only changes the # part, which doesn't reload the page: start again
addEventListener('hashchange', () => { if (/^#(play|open|continue)=/.test(location.hash)) location.reload(); });

// ---------------- guided tutorial: Try the finished app ----------------
// The lesson's finished app, running in a player over the editor: the student's own app is never swapped out.
let getLessonFile = null;
async function playFinished(lesson, ref, { next = '', onNext } = {}) {
  let p;
  try { p = checkProject(await loadRef(lesson, ref, tutorialLink.url, getLessonFile)); } catch { notify('The finished app couldn\u2019t be opened.'); return; }
  await mediaStore.load(p);
  const host = h('div', { class: 'stage-host' }), area = h('div', { class: 'tut-play-stage' }, host);
  const dlg = h('dialog', { class: 'es-dlg tut-play-dlg', 'aria-label': 'The finished app' },
    h('div', { class: 'dlg-head' }, h('div', {}, h('strong', {}, 'The finished app'), h('div', { class: 'muted' }, 'Try it out. When you\u2019re ready, start building your own.')), h('span', { class: 'spacer' }),
      h('button', { class: 'btn', 'data-ab': 'tutorial-play-restart', onclick: () => start() }, '\u21BB Restart'),
      h('button', { class: 'btn primary', 'data-ab': 'tutorial-play-next', onclick: () => { dlg.close(); onNext?.(); } }, next ? 'Start building \u25B8' : 'Back to my app'),
      h('button', { class: 'icon', 'data-ab': 'tutorial-play-close', 'aria-label': 'Close the finished app', onclick: () => dlg.close() }, '\u2715')),
    area);
  document.body.append(dlg);
  dlg.showModal();
  const player = new Player(host, { store: localStore('appbuilder.tutorial.finished.' + tutorialLink.id), media: projectMedia(() => p, { soundBase: MEDIA_SOURCES.soundBase }) });
  player.stage.fitTo(area, () => innerHeight * 0.7);
  const start = () => { player.start(p); player.focus(); };
  start();
  dlg.addEventListener('close', () => { player.stop(); dlg.remove(); useMedia(projectMedia(() => S.project)); refresh(); }); // then the editor's media lookups again, as at the top
}

// ---------------- boot ----------------
let initial = null;
const hadSaved = !!store((ls) => ls.getItem(STORE_KEY));
try { const saved = store((ls) => ls.getItem(STORE_KEY)); if (saved) initial = JSON.parse(saved); } catch { /* ignore */ }
// ?code=<project JSON>: a lesson step's starter (Waypoints playgrounds pass their starter this way)
let codeStart = null;
try { if (QS.get('code')) { const p = JSON.parse(QS.get('code')); codeStart = () => structuredClone(p); } } catch { queueMicrotask(() => notify('The starter project for this step could not be read.')); }
let lessonStart = codeStart || (lessonId && sampleById(lessonId) ? () => sampleById(lessonId) : null);
if (lessonId && !lessonStart) queueMicrotask(() => notify(`There is no lesson called "${lessonId}". Opening your last project instead.`));
// No lesson link: a playground, so everything is offered (Level 4), like MakeCode or Construct. Lessons set their own level.
const playground = () => ({ ...SAMPLES['Minutes and goal (two screens)'](), features: { level: 4 } });
// Async only to load media first (IndexedDB answers later); everything after it runs as before.
boot();
async function boot() {
// a shared link (#play=…): just the working app, no editor (play-page.js)
if (location.hash.startsWith('#play=')) { S.playing = true; await startPlay(location.hash.slice(6), { soundBase: MEDIA_SOURCES.soundBase }); return; }
let lesson = null;
if (tutorialLink?.error) notify(tutorialLink.error);
else if (tutorialLink) {
  try {
    const get = getLessonFile = async (url) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status === 404 ? 'There is no lesson at that address.' : 'The lesson couldn\u2019t be loaded.'); return r.text(); };
    lesson = parseSource(await get(tutorialLink.url));
    const starter = await loadStarter(lesson, tutorialLink.url, get);
    if (starter) lessonStart = () => structuredClone(starter);
    if (!params.level && lesson.level) params.level = lesson.level;
  } catch (e) {
    lesson = null;
    notify(`The tutorial couldn\u2019t be opened: ${/fetch|network/i.test(e.message) ? 'check the internet connection and reload.' : e.message}${hadSaved ? ' Your work on it is still here.' : ''}`);
  }
}
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
// #continue=…: "Continue on another device" from this student's own app (carry.js): the app, what it kept, and the
// tutorial step. The tutorial (started below) reads the step it brought. Your current app goes to Recent.
let carried = null;
if (location.hash.startsWith('#continue=')) {
  const code = location.hash.slice(10);
  window.history.replaceState(null, '', location.pathname + location.search);
  try {
    carried = await decodeCarry(code);
    if (carried.remembered) store((ls) => { for (const [k, v] of Object.entries(carried.remembered)) ls.setItem(`${STORE_KEY}.remember.${k}`, JSON.stringify(v)); });
    await loadProject(carried.project);
    if (carried.progress && lesson && carried.progress.tutorial === tutorialLink.id) { writeProgress(store, carried.progress); carried = null; }
    notify('Carrying on from the other device. The app you had here before is in Recent.');
  } catch { carried = null; notify('That link couldn\u2019t be opened: it may have been cut short.'); }
}
refresh();
const tab = new URLSearchParams(location.search).get('tab');
if (tab && tabViews[tab] !== undefined) setTab(tab);
window.__app = { S, setTab, loadProject }; // handy for debugging and tests
if (lesson) tutorialTitle = lesson.title || '';
if (carried?.progress) carryOn(carried); // a step for a tutorial that isn't open here
if (lesson) tutorial = startTutorial({ tutorial: lesson, id: tutorialLink.id, lessonUrl: tutorialLink.url, getSheet: () => sheetText(S.project), getTab: () => S.tab, getProject: () => S.project, store,
  onPlay: (ref, opts) => playFinished(lesson, ref, opts) });

// An embedding page (a lesson) can start, reset and read the project. See src/embed.js.
embed.start({
  start: (p) => { if (!hadSaved) loadProject(p); else reportChange(); }, // a student's own work wins over the starter
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
    reportChange();
  } catch { /* a broken copy elsewhere: keep ours */ }
});
}
