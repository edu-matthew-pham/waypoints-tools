// Left panel: one project tree (screens > objects > copies) plus whole-app variables.
import { h } from '../ui/dom.js';
import { OBJECT_KINDS } from '../core/catalog.js';
import { addObject, newScreen, duplicateInstance, deleteInstance, isIdentifier, parseValue, sizeOf, isList, isTable, newTable, fieldValue, FIELD_TYPES, pasteRows, linkKeys, linksTo, renameKey, unlinkTable, nestedView } from '../core/project.js';
import { openMenu } from '../ui/menu.js';
import { openObjectPicker } from '../ui/object-picker.js';
import { renameInput } from '../ui/rename-input.js';
import { renameObject, renameVariable, renameField, nameProblem, renameFunction, functionNamesTaken } from '../core/rename.js';
import { newFunction, functionUsers, paramNames, functionsOf } from '../core/functions.js';
import { pickPicture, pickSound } from '../ui/upload.js';
import { VERSION } from '../version.js';
import { assetName, imageData, imageNames, soundNames, soundAssetName } from '../core/assets.js';
import { uploadSize, isRef } from '../core/media.js';
import { keep, usage, mb } from '../media-store.js';
import { S, screen, hooks, showAllScreens, showFunctions } from '../state.js';
import { allScreensEvents } from '../core/shared.js';
import { nowText, liveTable } from '../run-engine.js';

function addRow(placeholder, onAdd, withValue) {
  const key = placeholder.toLowerCase().replace(/[^a-z]+/g, '-');
  const name = h('input', { class: 'ctl', placeholder, 'aria-label': placeholder, 'data-ab': key + '-name' });
  const val = withValue ? h('input', { class: 'ctl small', placeholder: 'start', value: '0', 'aria-label': 'Starting value', 'data-ab': key + '-value' }) : null;
  const go = () => { if (name.value.trim() && onAdd(name.value.trim(), val ? parseValue(val.value) : null) !== false) { name.value = ''; if (val) val.value = '0'; } };
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  val?.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('div', { class: 'add-row' }, name, val, h('button', { class: 'btn', onclick: go, title: 'Add', 'data-ab': key + '-add' }, '+'));
}

// "Remember between visits": a small toggle on a variable, list or table (level 3 and up)
function rememberBtn(v) {
  if (S.rf && !S.rf.remember) return null;
  return h('button', { class: 'icon remember' + (v.remember ? ' on' : ''), type: 'button', 'aria-pressed': String(!!v.remember), 'data-ab': 'remember:' + v.name,
    title: v.remember ? 'Remembered between visits (the app keeps its value in this browser). Click to stop.' : 'Remember between visits: keep its value in this browser when the app is closed and opened again',
    onclick: () => { if (v.remember) delete v.remember; else v.remember = true; hooks.commit(); } }, '\u{1F4BE}');
}

const kindsAllowed = () => Object.entries(OBJECT_KINDS).filter(([k]) => !S.rf || S.rf.kinds.includes(k));

function objectMenu(at, o, inst, returnFocus) {
  const many = o.instances.length > 1;
  openMenu({ x: at.x, y: at.y, returnFocus, items: [
    { label: 'Rename', fn: () => { renamingObj = o.name; hooks.refresh(); } },
    !S.rf || S.rf.instVars || many ? { label: 'Duplicate', fn: () => { const c = duplicateInstance(o, inst, sizeOf(S.project)); S.selId = c.id; hooks.commit(); } } : null,
    { label: many ? 'Delete this copy' : 'Delete', danger: true, fn: () => { deleteInstance(screen(), inst.id); S.selId = null; hooks.commit(); } },
  ] });
}

function objectRow(o) {
  const many = o.instances.length > 1;
  const first = o.instances[0];
  const sel = o.instances.find((i) => i.id === S.selId);
  const on = !!sel;
  if (renamingObj === o.name) {
    const done = () => { renamingObj = null; hooks.refresh(); };
    return h('div', { class: 'tree-row obj on' }, renameInput({
      value: o.name, label: 'Object name', notify: hooks.notify, onDone: done,
      taken: [...screen().objects.map((x) => x.name), ...functionsOf(S.project).map((f) => f.name), ...paramNames(S.project)],
      onSave: (v) => { renameObject(screen(), o.name, v, S.project); renamingObj = null; hooks.commit(); },
    }));
  }
  const row = h('div', { class: 'tree-row obj' + (on ? ' on' : '') },
    h('button', { class: 'obj-btn', 'data-ab': 'object:' + o.name, title: `Select ${o.name} (double-click to rename)`, 'aria-current': on ? 'true' : null,
      ondblclick: () => { renamingObj = o.name; hooks.refresh(); },
      onclick: () => hooks.select(on && many ? S.selId : first.id) },
      h('span', { class: 'obj-name' }, o.name),
      h('span', { class: 'kind' }, OBJECT_KINDS[o.kind]?.label ?? o.kind)),
    many ? h('div', { class: 'chips' }, o.instances.map((i, n) => h('button', {
      class: 'chip' + (i.id === S.selId ? ' on' : ''),
      title: `Select ${o.name} copy ${n + 1}`,
      onclick: () => hooks.select(i.id),
    }, String(n + 1)))) : null,
    on ? h('button', { class: 'icon more', type: 'button', title: 'More', 'aria-label': `More for ${o.name}`, 'data-ab': 'object-menu', 'aria-haspopup': 'menu',
      onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); objectMenu({ x: r.left, y: r.bottom + 4 }, o, sel, e.currentTarget); } }, '\u22ef') : null);
  return row;
}

// screens whose object list the user has folded away (the screen stays selected)
const collapsed = new Set();
let renaming = null; // id of the screen whose name is being edited
// a new empty screen, opened with its name ready to type (the Map tab's Add screen uses this too)
export function addScreen() {
  const names = new Set(S.project.screens.map((x) => x.name));
  let n = S.project.screens.length + 1; while (names.has('Screen ' + n)) n++;
  const sc2 = newScreen('Screen ' + n); S.project.screens.push(sc2); S.screenId = sc2.id; S.selId = null; renaming = sc2.id; hooks.commit();
}
let renamingObj = null; // name of the object being renamed
let renamingVar = null; // name of the variable being renamed

export function renderSide(el) {
  const sc = screen();

  const startRename = (id) => { renaming = id; hooks.refresh(); };
  const screenMenu = (at, s, returnFocus) => openMenu({ x: at.x, y: at.y, returnFocus, items: [
    { label: 'Rename', fn: () => startRename(s.id) },
    S.project.screens.length > 1 ? { label: 'Delete screen', danger: true, fn: () => {
      S.project.screens = S.project.screens.filter((x) => x !== s);
      S.screenId = S.project.screens[0].id; S.selId = null; hooks.commit();
    } } : null,
  ] });

  const tree = S.project.screens.map((s) => {
    if (s.id !== sc.id) {
      return h('div', { class: 'tree-node' },
        h('div', { class: 'tree-row screen' },
          h('button', { class: 'link', 'data-ab': 'screen:' + s.name, onclick: () => { S.screenId = s.id; S.selId = null; S.sheet = 'screen'; collapsed.delete(s.id); hooks.refresh(); } }, '▸ ' + s.name)));
    }
    const folded = collapsed.has(s.id);
    let nameEl;
    if (renaming === s.id) {
      let done = false;
      const finish = (save) => {
        if (done) return; done = true; renaming = null;
        const v = nameEl.value.trim();
        if (save && v && v !== s.name) { s.name = v; hooks.commit(); } else hooks.refresh();
      };
      nameEl = h('input', { class: 'ctl', value: s.name, 'aria-label': 'Screen name' });
      nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
      nameEl.addEventListener('blur', () => finish(true));
      queueMicrotask(() => { nameEl.focus(); nameEl.select(); });
    } else {
      nameEl = h('span', { class: 'screen-name', title: 'Double-click to rename', ondblclick: () => startRename(s.id) }, s.name);
    }
    const row = h('div', { class: 'tree-row screen on' },
      h('button', { class: 'caret', type: 'button', 'aria-expanded': String(!folded), title: folded ? 'Show objects' : 'Hide objects',
        onclick: () => { if (folded) collapsed.delete(s.id); else collapsed.add(s.id); hooks.refresh(); } }, folded ? '▸' : '▾'),
      nameEl,
      h('button', { class: 'icon more', type: 'button', title: 'More', 'aria-label': 'More for this screen', 'data-ab': 'screen-menu', 'aria-haspopup': 'menu',
        onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); screenMenu({ x: r.left, y: r.bottom + 4 }, s, e.currentTarget); } }, '\u22ef'));
    return h('div', { class: 'tree-node open' }, row,
      folded ? null : h('div', { class: 'tree-children' },
        ...(s.objects.length ? s.objects.map(objectRow) : [h('p', { class: 'muted' }, 'Nothing on this screen yet.')]),
        h('button', { class: 'btn add-obj', type: 'button', 'data-ab': 'add-object', onclick: () => openObjectPicker({
          allowed: kindsAllowed().map(([k]) => k),
          onPick: (k) => { const { inst } = addObject(s, k, sizeOf(S.project)); S.selId = inst.id; hooks.commit(); },
        }) }, '+ Add object')));
  });

  const vars = S.project.variables.map((v, i) => Array.isArray(v.value) ? null : h('div', { class: 'var' },
    renamingVar === v.name
      ? renameInput({ value: v.name, label: 'Variable name', notify: hooks.notify, taken: usedNames(),
        onDone: () => { renamingVar = null; hooks.refresh(); },
        onSave: (nv) => { renameVariable(S.project, v.name, nv); renamingVar = null; hooks.commit(); } })
      : h('button', { class: 'vname link-name', type: 'button', title: 'Click to rename (events are updated too)', onclick: () => { renamingVar = v.name; hooks.refresh(); } }, v.name),
    h('input', { class: 'ctl small', value: String(v.value), title: 'Starting value', 'aria-label': `Starting value of ${v.name}`, onchange: (e) => { v.value = parseValue(e.target.value); hooks.commit(); } }),
    h('span', { class: 'now', 'data-now': v.name }, nowText(v.name)),
    rememberBtn(v),
    h('button', { class: 'icon danger', title: 'Delete variable', onclick: () => { S.project.variables.splice(i, 1); hooks.commit(); } }, '×')));

  el.replaceChildren(
    h('h3', {}, 'Project'),
    h('div', { class: 'tree' }, ...tree, showAllScreens() ? allScreensRow() : null, showFunctions() ? functionsRows() : null),
    h('button', { class: 'btn add-screen', type: 'button', 'data-ab': 'add-screen', onclick: addScreen }, '+ Screen'),
    h('h3', {}, 'Variables (whole app)'),
    ...(vars.some(Boolean) ? [h('div', { class: 'var var-head' }, h('span', { class: 'vname' }), h('span', { class: 'col-start' }, 'starts at'), h('span', { class: 'col-now' }, 'now'), h('span', { class: 'col-x' })), ...vars.filter(Boolean)] : [h('p', { class: 'muted' }, 'None yet.')]),
    addRow('New variable', (name, value) => {
      if (!isIdentifier(name)) { hooks.notify('Variable names use letters, numbers and _ only, and can’t start with a number.'); return false; }
      if (S.project.variables.some((v) => v.name === name)) { hooks.notify('There is already a variable called ' + name); return false; }
      if (usedNames().includes(name)) { hooks.notify(`${name} is already the name of a function or a parameter; pick another name`); return false; }
      S.project.variables.push({ name, value }); hooks.commit();
    }, true),
    ...(!S.rf || S.rf.lists ? listSection() : []),
    ...(!S.rf || S.rf.tables || S.project.variables.some(isTable) ? tableSection() : []),
    // Pictures and sounds: one list of the app's own uploads (thumbnails, and a speaker for sounds), with both upload
    // buttons. Built-in pictures and sounds need no upload.
    ...(!S.rf || S.rf.kinds.includes('image') || S.rf.kinds.includes('sound') ? [
      h('h3', {}, 'Pictures and sounds (whole app)'),
      ...(S.project.assets.length || S.project.sounds?.length ? [h('div', { class: 'pic-list' },
        S.project.assets.map((a) => h('div', { class: 'var pic-row' },
          h('img', { src: imageData(S.project, a.name), alt: '' }), h('span', { class: 'vname' }, a.name),
          h('span', { class: 'muted start-count' }, `${Math.round(uploadSize(a) / 1024)} KB`),
          h('button', { class: 'icon danger', title: 'Delete picture', onclick: () => {
            const users = pictureUsers(a.name);
            if (users.length) { hooks.notify(`${a.name} is still used by ${users.join(', ')}. Change those first.`); return; }
            S.project.assets = S.project.assets.filter((x) => x !== a); hooks.commit();
          } }, '×'))),
        (S.project.sounds || []).map((a) => h('div', { class: 'var pic-row' },
          h('span', { class: 'snd-ico', 'aria-hidden': 'true' }, '🔊'), h('span', { class: 'vname' }, a.name),
          h('span', { class: 'muted start-count' }, `${Math.round(uploadSize(a) / 1024)} KB`),
          h('button', { class: 'icon danger', title: 'Delete sound', onclick: () => {
            const users = soundUsers(a.name);
            if (users.length) { hooks.notify(`${a.name} is still used by ${users.join(', ')}. Change those first.`); return; }
            S.project.sounds = S.project.sounds.filter((x) => x !== a); hooks.commit();
          } }, '×'))))]
        : [h('p', { class: 'muted' }, 'Built-in pictures and sounds are ready to use. Upload your own here, or on an Image or a Sound.')]),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn add-screen', type: 'button', onclick: () => pickPicture(async ({ fileName, data }) => {
          const name = assetName(S.project, fileName);
          S.project.assets.push({ name, ...await keep(data) }); hooks.commit();
        }, hooks.notify), 'data-ab': 'upload-picture' }, '+ Upload picture'),
        h('button', { class: 'btn add-screen', type: 'button', onclick: () => pickSound(async ({ fileName, data }) => {
          const name = soundAssetName(S.project, fileName);
          S.project.sounds.push({ name, ...await keep(data), title: fileName.replace(/\.[^.]*$/, '') }); hooks.commit();
        }, hooks.notify), 'data-ab': 'side-upload-sound' }, '+ Upload sound'))] : []),
    ...(S.project.assets.length || S.project.sounds?.length ? [storageNote()] : []),
    h('p', { class: 'muted legal' }, h('span', { 'data-ab': 'version' }, `App Builder ${VERSION}. `), 'Free for education. Commercial use by permission only.'),
  );
}

// The All screens sheet: events that run on every screen. Opens it in the Events tab.
function allScreensRow() {
  const n = allScreensEvents(S.project).length;
  const on = S.sheet === 'all' && S.tab === 'events';
  return h('div', { class: 'tree-node' }, h('div', { class: 'tree-row screen all-screens' + (on ? ' on' : '') },
    h('button', { class: 'link', type: 'button', 'data-ab': 'all-screens', 'aria-current': on ? 'true' : null,
      title: 'Events that run on every screen, like a Home button on each one',
      onclick: () => { S.sheet = 'all'; if (S.tab === 'events') hooks.refresh(); else hooks.setTab('events'); } },
    '\u29c9 All screens', h('span', { class: 'kind' }, n ? `${n} event${n === 1 ? '' : 's'}` : 'events'))));
}

// Names a whole-app variable, list or table can't take: other variables, functions and parameters
// (a parameter is a plain name inside its function, so the two would mean the same thing there)
function usedNames() { return [...S.project.variables.map((x) => x.name), ...functionsOf(S.project).map((f) => f.name), ...paramNames(S.project)]; }

// Functions (Level 4): named pieces of event sheet any event can call. Each opens in the Events tab.
let renamingFn = null; // id of the function being renamed
function functionsRows() {
  const fns = functionsOf(S.project);
  const open = (f) => { S.sheet = 'fn:' + f.id; if (S.tab === 'events') hooks.refresh(); else hooks.setTab('events'); };
  const row = (f) => {
    const on = S.sheet === 'fn:' + f.id && S.tab === 'events';
    if (renamingFn === f.id) {
      return h('div', { class: 'tree-row fn on' }, renameInput({ value: f.name, label: 'Function name', notify: hooks.notify,
        taken: functionNamesTaken(S.project, f.name),
        onDone: () => { renamingFn = null; hooks.refresh(); },
        onSave: (v) => { renameFunction(S.project, f.name, v); renamingFn = null; hooks.commit(); } }));
    }
    const menu = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      openMenu({ x: r.left, y: r.bottom + 4, returnFocus: e.currentTarget, items: [
        { label: 'Rename', fn: () => { renamingFn = f.id; hooks.refresh(); } },
        { label: 'Delete function', danger: true, fn: () => {
          const users = functionUsers(S.project, f.name).filter((w) => w !== f.name);
          if (users.length) { hooks.notify(`${f.name} is still called on ${users.join(', ')}. Remove those calls first.`); return; }
          S.project.functions = fns.filter((x) => x !== f);
          if (S.sheet === 'fn:' + f.id) S.sheet = 'screen';
          hooks.commit();
        } },
      ] });
    };
    return h('div', { class: 'tree-row fn' + (on ? ' on' : '') },
      h('button', { class: 'link', type: 'button', 'data-ab': 'function:' + f.name, 'aria-current': on ? 'true' : null, title: `Open ${f.name} (double-click to rename)`,
        ondblclick: () => { renamingFn = f.id; hooks.refresh(); }, onclick: () => open(f) },
      `${f.name}(${f.params.join(', ')})`),
      on ? h('button', { class: 'icon more', type: 'button', title: 'More', 'aria-label': `More for ${f.name}`, 'data-ab': 'function-menu', 'aria-haspopup': 'menu', onclick: menu }, '\u22ef') : null);
  };
  return h('div', { class: 'tree-node fns' },
    h('div', { class: 'tree-row screen fns-head' }, h('span', { class: 'fns-title', title: 'Named lists of actions that any event can call, like SaveEntry(text)' }, '\u0192 Functions'),
      h('span', { class: 'kind' }, fns.length ? `${fns.length}` : '')),
    h('div', { class: 'tree-children' },
      ...fns.map(row),
      h('button', { class: 'btn add-obj', type: 'button', 'data-ab': 'add-function', title: 'A named list of actions you can call from any event', onclick: () => {
        const taken = new Set(functionNamesTaken(S.project));
        let name = 'MyFunction', n = 2;
        while (taken.has(name)) name = 'MyFunction' + n++;
        const f = newFunction(S.project, name);
        renamingFn = f.id; S.sheet = 'fn:' + f.id;
        if (S.tab !== 'events') hooks.setTab('events');
        hooks.commit();
      } }, '+ Function')));
}

// every event in a list, sub-events included, with where it is ("an event on Home")
function eachEventWhere(cb) {
  const walk = (evs, where) => { for (const ev of evs || []) { cb(ev, where); walk(ev.children, where); } };
  for (const sc of S.project.screens) walk(sc.events, 'an event on ' + sc.name);
  walk(allScreensEvents(S.project), 'an event on All screens');
  for (const f of functionsOf(S.project)) walk(f.events, 'the function ' + f.name);
}

// objects and events that use a picture (so it isn't deleted out from under them)
function pictureUsers(name) {
  const out = new Set();
  for (const sc of S.project.screens) {
    for (const o of sc.objects) if (o.instances.some((i) => i.image === name)) out.add(o.name);
  }
  eachEventWhere((ev, where) => { if (ev.actions.some((a) => a.type === 'setImage' && a.image === name)) out.add(where); });
  for (const sc of S.project.screens) for (const o of sc.objects) if (o.instances.some((i) => i.background === name)) out.add(o.name);
  for (const t of S.project.variables.filter(isTable)) {
    const pf = t.table.fields.filter((f) => f.type === 'picture');
    if (t.value.some((r) => pf.some((f) => r[f.name] === name))) out.add('the table ' + t.name);
  }
  return [...out];
}

// objects and events that use an uploaded sound
function soundUsers(name) {
  const out = new Set();
  for (const sc of S.project.screens) {
    for (const o of sc.objects) if (o.instances.some((i) => i.sound === name)) out.add(o.name);
  }
  eachEventWhere((ev, where) => { if (ev.actions.some((a) => a.type === 'setSound' && a.sound === name)) out.add(where); });
  for (const t of S.project.variables.filter(isTable)) {
    const sf = t.table.fields.filter((f) => f.type === 'sound');
    if (t.value.some((r) => sf.some((f) => r[f.name] === name))) out.add('the table ' + t.name);
  }
  return [...out];
}

// Lists (whole app): name, starting items typed as  a, b, c
function listSection() {
  const rows = S.project.variables.filter(isList).map((v) => h('div', { class: 'list-var' },
    h('div', { class: 'var' },
      renamingVar === v.name
        ? renameInput({ value: v.name, label: 'List name', notify: hooks.notify, taken: usedNames(),
          onDone: () => { renamingVar = null; hooks.refresh(); },
          onSave: (nv) => { renameVariable(S.project, v.name, nv); renamingVar = null; hooks.commit(); } })
        : h('button', { class: 'vname link-name', type: 'button', title: 'Click to rename (events are updated too)', onclick: () => { renamingVar = v.name; hooks.refresh(); } }, v.name),
      h('span', { class: 'muted start-count' }, `${v.value.length} at start`),
      h('span', { class: 'now', 'data-now': v.name }, nowText(v.name)),
      rememberBtn(v),
      h('button', { class: 'icon danger', title: 'Delete list', onclick: () => { S.project.variables = S.project.variables.filter((x) => x !== v); hooks.commit(); } }, '\u00d7')),
    h('input', { class: 'ctl list-start', value: v.value.join(', '), placeholder: 'Starting items, e.g. Milk, Eggs', 'aria-label': `Starting items of ${v.name}`,
      onchange: (e) => { v.value = e.target.value.split(',').map((x) => x.trim()).filter(Boolean).map(parseValue); hooks.commit(); } })));
  return [
    h('h3', {}, 'Lists (whole app)'),
    ...(rows.length ? rows : [h('p', { class: 'muted' }, 'None yet.')]),
    addRow('New list', (name) => {
      if (!isIdentifier(name)) { hooks.notify('List names use letters, numbers and _ only, and can\u2019t start with a number.'); return false; }
      if (usedNames().includes(name)) { hooks.notify('There is already something called ' + name); return false; }
      S.project.variables.push({ name, value: [] }); hooks.commit();
    }),
  ];
}

// Tables (whole app): a small spreadsheet per table. Columns are fields (text or number), rows are records.
// What is typed here is the table at the start; while the app runs, the live rows show underneath.
let renamingField = null; // `${table}.${field}` being renamed
const jsonOpen = new Set();  // tables whose JSON view is open

function tableSection() {
  const used = usedNames;
  const blocks = S.project.variables.filter(isTable).map((v) => {
    const fields = v.table.fields;
    const fieldHead = (f, fi) => {
      if (renamingField === `${v.name}.${f.name}`) {
        return h('th', {}, renameInput({ value: f.name, label: 'Field name', notify: hooks.notify, taken: fields.map((x) => x.name),
          onDone: () => { renamingField = null; hooks.refresh(); },
          onSave: (nv) => { renameField(S.project, v.name, f.name, nv); renamingField = null; hooks.commit(); } }));
      }
      return h('th', {}, h('button', { class: 'link-name fld', type: 'button', 'data-ab': `field-menu:${v.name}.${f.name}`, title: `${f.name}: ${f.type === 'number' ? 'numbers' : f.type === 'picture' ? 'pictures' : f.type === 'sound' ? 'sounds' : 'text'}. Click for options`, 'aria-haspopup': 'menu',
        onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); openMenu({ x: r.left, y: r.bottom + 4, returnFocus: e.currentTarget, items: [
          { label: 'Rename', fn: () => { renamingField = `${v.name}.${f.name}`; hooks.refresh(); } },
          ...FIELD_TYPES.map(([t, label]) => ({ label: (f.type === t ? '✓ ' : '') + label, disabled: f.type === t, fn: () => {
            const bad = v.value.filter((r) => fieldValue(t, r[f.name]).error).length;
            if (bad) { hooks.notify(`${bad} row${bad === 1 ? ' has' : 's have'} text in ${f.name} that isn't a number. Change ${bad === 1 ? 'it' : 'them'} first.`); return; }
            f.type = t; delete f.to; for (const r of v.value) r[f.name] = fieldValue(t, r[f.name]).value; hooks.commit();
          } })),
          // advanced: link this field to another table's rows (by that table's first field)
          ...(fi > 0 ? S.project.variables.filter((t) => isTable(t) && t !== v).map((t) => ({ label: (f.type === 'link' && f.to === t.name ? '✓ ' : '') + `Links to ${t.name}`, 'data-ab': `link-to:${t.name}`,
            disabled: f.type === 'link' && f.to === t.name, fn: () => {
              f.type = 'link'; f.to = t.name; for (const r of v.value) r[f.name] = fieldValue('text', r[f.name]).value; hooks.commit();
              hooks.notify(`${f.name} now names a row of ${t.name} (by its ${t.table.fields[0]?.name ?? 'first field'}).`);
            } })) : []),
          fi > 0 ? { label: 'Move left', fn: () => { fields.splice(fi - 1, 0, fields.splice(fi, 1)[0]); hooks.commit(); } } : null,
          fields.length > 1 ? { label: 'Delete field', danger: true, fn: () => { fields.splice(fi, 1); for (const r of v.value) delete r[f.name]; hooks.commit(); } } : null,
        ] }); } }, f.name, h('small', { class: 'ftype' }, f.type === 'number' ? ' 123' : f.type === 'link' ? ` → ${f.to}` : f.type === 'picture' ? ' 🖼' : f.type === 'sound' ? ' 🔊' : ' abc')));
    };
    const cellInput = (r, ri, f) => (f.type === 'link' ? linkCell(r, ri, f) : f.type === 'picture' ? pictureCell(r, ri, f) : f.type === 'sound' ? soundCell(r, ri, f) : textCell(r, ri, f));
    // a sound field: one of the app's sounds at the start (recordings made while the app runs fill it later)
    const soundCell = (r, ri, f) => {
      const cur = String(r[f.name] ?? ''), names = soundNames(S.project), made = isRef(cur) || cur.startsWith('data:');
      return h('select', { class: 'cell', 'aria-label': `${v.name} row ${ri + 1} ${f.name}`, 'data-ab': `cell:${v.name}:${ri + 1}:${f.name}`,
        onchange: (e) => { r[f.name] = e.target.value; commitKeepFocus(e.target); } },
        h('option', { value: '' }, '—'),
        made ? h('option', { value: cur, selected: true }, 'recorded in the app') : null,
        cur && !made && !names.includes(cur) ? h('option', { value: cur, selected: true }, `${cur} (missing)`) : null,
        names.map((n) => h('option', { value: n, selected: n === cur }, n)));
    };
    // a picture field: one of the app's pictures at the start (pictures made while the app runs fill it later)
    const pictureCell = (r, ri, f) => {
      const cur = String(r[f.name] ?? ''), names = imageNames(S.project), made = isRef(cur) || cur.startsWith('data:');
      return h('span', { class: 'cell-pic-pick' },
        cur ? h('img', { class: 'cell-pic', src: imageData(S.project, cur), alt: '' }) : null,
        h('select', { class: 'cell', 'aria-label': `${v.name} row ${ri + 1} ${f.name}`, 'data-ab': `cell:${v.name}:${ri + 1}:${f.name}`,
          onchange: (e) => { r[f.name] = e.target.value; commitKeepFocus(e.target); } },
          h('option', { value: '' }, '—'),
          made ? h('option', { value: cur, selected: true }, 'made in the app') : null,
          cur && !made && !names.includes(cur) ? h('option', { value: cur, selected: true }, `${cur} (missing)`) : null,
          names.map((n) => h('option', { value: n, selected: n === cur }, n))));
    };
    // a linked field: choose one of the other table's keys (a value that isn't one shows as broken)
    const linkCell = (r, ri, f) => {
      const keys = linkKeys(S.project, f.to), cur = String(r[f.name] ?? '');
      const broken = cur !== '' && !keys.includes(cur);
      return h('select', { class: 'cell link' + (broken ? ' broken' : ''), 'aria-label': `${v.name} row ${ri + 1} ${f.name}`, 'data-ab': `cell:${v.name}:${ri + 1}:${f.name}`,
        title: broken ? `No row of ${f.to} is called "${cur}"` : `A row of ${f.to}`,
        onchange: (e) => { r[f.name] = e.target.value; commitKeepFocus(e.target); } },
        h('option', { value: '' }, '—'),
        broken ? h('option', { value: cur, selected: true }, `${cur} (missing)`) : null,
        keys.filter((k, i) => k !== '' && keys.indexOf(k) === i).map((k) => h('option', { value: k, selected: k === cur }, k)));
    };
    const textCell = (r, ri, f) => h('input', { class: 'cell' + (f.type === 'number' ? ' num' : ''), value: String(r[f.name] ?? ''), 'aria-label': `${v.name} row ${ri + 1} ${f.name}`, 'data-ab': `cell:${v.name}:${ri + 1}:${f.name}`,
      inputmode: f.type === 'number' ? 'decimal' : null,
      onchange: (e) => {
        const res = fieldValue(f.type, e.target.value);
        if (res.error) { hooks.notify(`${f.name} holds numbers: ${res.error}.`); e.target.value = String(r[f.name] ?? ''); return; }
        const before = r[f.name];
        r[f.name] = res.value;
        // a key (first field) that other tables link to: their rows follow the new name
        const moved = f === fields[0] && typeof before === 'string' && !v.value.some((x) => x !== r && x[f.name] === before) ? renameKey(S.project, v.name, before, String(res.value)) : 0;
        commitKeepFocus(e.target);
        if (moved) hooks.notify(`${moved} linked row${moved === 1 ? '' : 's'} now say${moved === 1 ? 's' : ''} "${res.value}".`);
      },
      // pasting cells from a spreadsheet (more than one cell) fills the table from here, adding rows as needed
      onpaste: (e) => {
        const text = e.clipboardData?.getData('text/plain') ?? '';
        if (!/[\t\n]/.test(text.replace(/\n+$/, ''))) return;
        e.preventDefault();
        const res = pasteRows(v, text, { row: ri + 1, field: f.name });
        if (res.error) { hooks.notify(`Nothing pasted: ${res.error}.`); return; }
        hooks.commit();
        hooks.notify(`Pasted ${res.rows} row${res.rows === 1 ? '' : 's'}${res.skipped ? `; ${res.skipped} cell${res.skipped === 1 ? '' : 's'} past the last field left out (add a field first)` : ''}.`);
      } });
    const grid = h('div', { class: 'tbl-edit' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', { class: 'rn' }, '#'), fields.map(fieldHead), h('th', { class: 'addf' },
        h('button', { class: 'icon', type: 'button', title: 'Add a field (a column)', 'data-ab': `add-field:${v.name}`, onclick: () => {
          let n = fields.length + 1; while (fields.some((x) => x.name === 'field' + n)) n++;
          const name = 'field' + n; fields.push({ name, type: 'text' }); for (const r of v.value) r[name] = '';
          renamingField = `${v.name}.${name}`; hooks.commit();
        } }, '+')))),
      h('tbody', {}, v.value.map((r, ri) => h('tr', {}, h('td', { class: 'rn' }, String(ri + 1)), fields.map((f) => h('td', {}, cellInput(r, ri, f))),
        h('td', {}, h('button', { class: 'icon danger', type: 'button', title: `Delete row ${ri + 1}`, onclick: () => { v.value.splice(ri, 1); hooks.commit(); } }, '×')))))));
    const addRowBtn = h('button', { class: 'btn small', type: 'button', 'data-ab': `add-row:${v.name}`, onclick: () => {
      v.value.push(Object.fromEntries(fields.map((f) => [f.name, f.type === 'number' ? 0 : ''])));
      hooks.commit();
      queueMicrotask(() => document.querySelector(`[data-ab="cell:${v.name}:${v.value.length}:${fields[0]?.name}"]`)?.focus());
    } }, '+ Row');
    const pasteBtn = h('button', { class: 'btn small', type: 'button', 'data-ab': `paste-rows:${v.name}`, title: 'Paste rows copied from a spreadsheet',
      onclick: () => pasteDialog(v) }, 'Paste rows');
    const jsonBtn = h('button', { class: 'btn small', type: 'button', 'aria-pressed': String(jsonOpen.has(v.name)), 'data-ab': `json:${v.name}`, title: 'See the table as JSON: a list of records, the shape JavaScript and Python use',
      onclick: () => { if (jsonOpen.has(v.name)) jsonOpen.delete(v.name); else jsonOpen.add(v.name); hooks.refresh(); } }, '{ } JSON');
    return h('div', { class: 'table-var' },
      h('div', { class: 'var' },
        renamingVar === v.name
          ? renameInput({ value: v.name, label: 'Table name', notify: hooks.notify, taken: used(),
            onDone: () => { renamingVar = null; hooks.refresh(); },
            onSave: (nv) => { renameVariable(S.project, v.name, nv); renamingVar = null; hooks.commit(); } })
          : h('button', { class: 'vname link-name', type: 'button', title: 'Click to rename (events are updated too)', onclick: () => { renamingVar = v.name; hooks.refresh(); } }, v.name),
        h('span', { class: 'muted start-count' }, `${v.value.length} row${v.value.length === 1 ? '' : 's'} at start`),
        h('span', { class: 'now', 'data-now': v.name }, nowText(v.name)),
        rememberBtn(v),
        h('button', { class: 'icon danger', title: 'Delete table', onclick: () => {
          const links = linksTo(S.project, v.name).filter((l) => l.table !== v);
          unlinkTable(S.project, v.name);
          S.project.variables = S.project.variables.filter((x) => x !== v); hooks.commit();
          if (links.length) hooks.notify(`${links.map((l) => `${l.table.name}.${l.field.name}`).join(', ')} no longer link${links.length === 1 ? 's' : ''} anywhere (now plain text).`);
        } }, '×')),
      grid,
      h('div', { class: 'tbl-tools' }, addRowBtn, pasteBtn, jsonBtn),
      jsonOpen.has(v.name) ? jsonView(v) : null,
      h('div', { class: 'tbl-live', 'data-now-table': v.name }, liveTable(v.name)));
  });
  return [
    h('h3', {}, 'Tables (whole app)'),
    ...(blocks.length ? blocks : [h('p', { class: 'muted' }, 'None yet. A table keeps records: one row each, with the same fields (like title, artist, length).')]),
    addRow('New table', (name) => {
      const why = nameProblem(name, used());
      if (why) { hooks.notify(why); return false; }
      S.project.variables.push(newTable(name)); hooks.commit();
    }),
  ];
}

// Commit, then put the cursor back where the user tabbed or clicked to (the sidebar is redrawn on commit).
// The JSON view of a table: the rows as a list of records. When another table links to this one, it can also show
// the nested version (each row with its linked rows inside), built from the flat tables to look at and copy.
const nestedOpen = new Map(); // table name -> 'Child.field' shown nested, or ''
function jsonView(v) {
  const links = linksTo(S.project, v.name).filter((l) => l.table !== v);
  const pick = nestedOpen.get(v.name) || '';
  const [child, field] = pick.split('.');
  const nested = pick && links.some((l) => l.table.name === child && l.field.name === field);
  const text = JSON.stringify(nested ? nestedView(S.project, v.name, child, field) : v.value, null, 2);
  const copy = h('button', { class: 'btn small', type: 'button', 'data-ab': `json-copy:${v.name}`, onclick: () => {
    navigator.clipboard?.writeText(text).then(() => hooks.notify('Copied.'), () => hooks.notify('Could not copy here: select the text and copy it.'));
  } }, 'Copy');
  return h('div', { class: 'json-wrap' },
    links.length ? h('label', { class: 'json-nest' }, h('span', {}, 'Show '),
      h('select', { class: 'ctl', 'data-ab': `json-nest:${v.name}`, 'aria-label': `Show ${v.name} as`, onchange: (e) => { nestedOpen.set(v.name, e.target.value); hooks.refresh(); } },
        h('option', { value: '' }, `${v.name} only (as stored)`),
        links.map((l) => h('option', { value: `${l.table.name}.${l.field.name}`, selected: pick === `${l.table.name}.${l.field.name}` }, `${l.table.name} grouped by ${l.field.name} (nested)`)))) : null,
    nested ? h('p', { class: 'muted small' }, `Each row of ${v.name} with its ${child} inside. Built from the two flat tables to look at or copy: the app still keeps them flat, so changing a ${child} row changes one place.`) : null,
    h('pre', { class: 'json', 'data-ab': `json-view:${v.name}`, 'aria-label': `${v.name} as JSON` }, text),
    copy);
}

// Paste rows: a box to paste cells copied from a spreadsheet (one row per line). They are added after the last row,
// in field order; a first line with the field names is skipped.
function pasteDialog(v) {
  const box = h('textarea', { class: 'ctl paste-box', rows: '8', spellcheck: 'false', 'aria-label': `Rows to add to ${v.name}`, 'data-ab': 'paste-text',
    placeholder: v.table.fields.map((f) => f.name).join('\t') + '\n…' });
  const dlg = h('dialog', { class: 'es-dlg', 'aria-label': `Paste rows into ${v.name}` },
    h('div', { class: 'dlg-head' }, h('strong', {}, `Paste rows into ${v.name}`)),
    h('div', { class: 'dlg-body' },
      h('p', { class: 'muted' }, `Copy rows from a spreadsheet and paste them here, one row per line. Columns go into the fields in order (${v.table.fields.map((f) => f.name).join(', ')}) and are added after the last row.`),
      box),
    h('div', { class: 'dlg-foot' }, h('span', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', 'data-ab': 'paste-add', onclick: () => {
        const res = pasteRows(v, box.value, { row: v.value.length + 1 });
        if (res.error) { hooks.notify(`Nothing added: ${res.error}.`); return; }
        dlg.close(); hooks.commit();
        hooks.notify(`Added ${res.rows} row${res.rows === 1 ? '' : 's'}${res.skipped ? `; ${res.skipped} cell${res.skipped === 1 ? '' : 's'} past the last field left out` : ''}.`);
      } }, 'Add rows')));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  box.focus();
}

function commitKeepFocus(input) {
  const where = () => document.activeElement?.getAttribute?.('data-ab');
  setTimeout(() => { // after focus has moved to the next cell
    const next = document.activeElement !== input ? where() : input.getAttribute('data-ab');
    hooks.commit();
    if (next) document.querySelector(`[data-ab="${CSS.escape(next)}"]`)?.focus();
  }, 0);
}

// How much this browser holds for App Builder (projects, pictures, recordings), filled in when the browser says.
function storageNote() {
  const p = h('p', { class: 'muted small', 'data-ab': 'media-usage', title: 'Pictures and recordings are kept in this browser on this computer. Nothing is sent anywhere. Save makes a copy you can keep.' });
  usage().then((u) => { if (u?.quota) p.textContent = `Kept in this browser: ${mb(u.usage)} used of about ${mb(u.quota)}. Save keeps a copy.`; });
  return p;
}
