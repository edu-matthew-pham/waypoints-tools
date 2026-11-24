// Left panel: one project tree (screens > objects > copies) plus whole-app variables.
import { h } from '../ui/dom.js';
import { OBJECT_KINDS } from '../core/catalog.js';
import { addObject, newScreen, duplicateInstance, deleteInstance, isIdentifier, parseValue, sizeOf } from '../core/project.js';
import { openMenu } from '../ui/menu.js';
import { openObjectPicker } from '../ui/object-picker.js';
import { renameInput } from '../ui/rename-input.js';
import { renameObject, renameVariable } from '../core/rename.js';
import { pickPicture } from '../ui/upload.js';
import { assetName } from '../core/assets.js';
import { S, screen, hooks } from '../state.js';

function addRow(placeholder, onAdd, withValue) {
  const name = h('input', { class: 'ctl', placeholder, 'aria-label': placeholder });
  const val = withValue ? h('input', { class: 'ctl small', placeholder: 'start', value: '0', 'aria-label': 'Starting value' }) : null;
  const go = () => { if (name.value.trim() && onAdd(name.value.trim(), val ? parseValue(val.value) : null) !== false) name.value = ''; };
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('div', { class: 'add-row' }, name, val, h('button', { class: 'btn', onclick: go, title: 'Add' }, '+'));
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
      taken: screen().objects.map((x) => x.name),
      onSave: (v) => { renameObject(screen(), o.name, v); renamingObj = null; hooks.commit(); },
    }));
  }
  const row = h('div', { class: 'tree-row obj' + (on ? ' on' : '') },
    h('button', { class: 'obj-btn', title: `Select ${o.name} (double-click to rename)`, 'aria-current': on ? 'true' : null,
      ondblclick: () => { renamingObj = o.name; hooks.refresh(); },
      onclick: () => hooks.select(on && many ? S.selId : first.id) },
      h('span', { class: 'obj-name' }, o.name),
      h('span', { class: 'kind' }, OBJECT_KINDS[o.kind]?.label ?? o.kind)),
    many ? h('div', { class: 'chips' }, o.instances.map((i, n) => h('button', {
      class: 'chip' + (i.id === S.selId ? ' on' : ''),
      title: `Select ${o.name} copy ${n + 1}`,
      onclick: () => hooks.select(i.id),
    }, String(n + 1)))) : null,
    on ? h('button', { class: 'icon more', type: 'button', title: 'More', 'aria-label': `More for ${o.name}`, 'aria-haspopup': 'menu',
      onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); objectMenu({ x: r.left, y: r.bottom + 4 }, o, sel, e.currentTarget); } }, '\u22ef') : null);
  return row;
}

// screens whose object list the user has folded away (the screen stays selected)
const collapsed = new Set();
let renaming = null; // id of the screen whose name is being edited
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
          h('button', { class: 'link', onclick: () => { S.screenId = s.id; S.selId = null; collapsed.delete(s.id); hooks.refresh(); } }, '▸ ' + s.name)));
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
      h('button', { class: 'icon more', type: 'button', title: 'More', 'aria-label': 'More for this screen', 'aria-haspopup': 'menu',
        onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); screenMenu({ x: r.left, y: r.bottom + 4 }, s, e.currentTarget); } }, '\u22ef'));
    return h('div', { class: 'tree-node open' }, row,
      folded ? null : h('div', { class: 'tree-children' },
        ...(s.objects.length ? s.objects.map(objectRow) : [h('p', { class: 'muted' }, 'Nothing on this screen yet.')]),
        h('button', { class: 'btn add-obj', type: 'button', onclick: () => openObjectPicker({
          allowed: kindsAllowed().map(([k]) => k),
          onPick: (k) => { const { inst } = addObject(s, k, sizeOf(S.project)); S.selId = inst.id; hooks.commit(); },
        }) }, '+ Add object')));
  });

  const vars = S.project.variables.map((v, i) => Array.isArray(v.value) ? null : h('div', { class: 'var' },
    renamingVar === v.name
      ? renameInput({ value: v.name, label: 'Variable name', notify: hooks.notify, taken: S.project.variables.map((x) => x.name),
        onDone: () => { renamingVar = null; hooks.refresh(); },
        onSave: (nv) => { renameVariable(S.project, v.name, nv); renamingVar = null; hooks.commit(); } })
      : h('button', { class: 'vname link-name', type: 'button', title: 'Click to rename (events are updated too)', onclick: () => { renamingVar = v.name; hooks.refresh(); } }, v.name),
    h('input', { class: 'ctl small', value: String(v.value), 'aria-label': `Starting value of ${v.name}`, onchange: (e) => { v.value = parseValue(e.target.value); hooks.commit(); } }),
    h('button', { class: 'icon danger', title: 'Delete variable', onclick: () => { S.project.variables.splice(i, 1); hooks.commit(); } }, '×')));

  el.replaceChildren(
    h('h3', {}, 'Project'),
    h('div', { class: 'tree' }, ...tree),
    h('button', { class: 'btn add-screen', type: 'button', onclick: () => {
      const names = new Set(S.project.screens.map((x) => x.name));
      let n = S.project.screens.length + 1; while (names.has('Screen ' + n)) n++;
      const sc2 = newScreen('Screen ' + n); S.project.screens.push(sc2); S.screenId = sc2.id; S.selId = null; renaming = sc2.id; hooks.commit();
    } }, '+ Screen'),
    h('h3', {}, 'Variables (whole app)'),
    ...(vars.some(Boolean) ? vars.filter(Boolean) : [h('p', { class: 'muted' }, 'None yet.')]),
    addRow('New variable', (name, value) => {
      if (!isIdentifier(name)) { hooks.notify('Variable names use letters, numbers and _ only, and can’t start with a number.'); return false; }
      if (S.project.variables.some((v) => v.name === name)) { hooks.notify('There is already a variable called ' + name); return false; }
      S.project.variables.push({ name, value }); hooks.commit();
    }, true),
    ...(!S.rf || S.rf.lists ? listSection() : []),
    ...(!S.rf || S.rf.kinds.includes('image') ? [
      h('h3', {}, 'Pictures (whole app)'),
      ...(S.project.assets.length ? [h('div', { class: 'pic-list' }, S.project.assets.map((a) => h('div', { class: 'var pic-row' },
        h('img', { src: a.data, alt: '' }), h('span', { class: 'vname' }, a.name),
        h('button', { class: 'icon danger', title: 'Delete picture', onclick: () => {
          const users = pictureUsers(a.name);
          if (users.length) { hooks.notify(`${a.name} is still used by ${users.join(', ')}. Change those first.`); return; }
          S.project.assets = S.project.assets.filter((x) => x !== a); hooks.commit();
        } }, '\u00d7'))))] : [h('p', { class: 'muted' }, 'Built-in pictures are ready to use. Upload your own here or on an Image.')]),
      h('button', { class: 'btn add-screen', type: 'button', onclick: () => pickPicture(({ fileName, data }) => {
        S.project.assets.push({ name: assetName(S.project, fileName), data }); hooks.commit();
      }, hooks.notify) }, '+ Upload picture')] : []),
    h('p', { class: 'muted legal' }, 'Free for education. Commercial use by permission only.'),
  );
}

// objects and events that use a picture (so it isn't deleted out from under them)
function pictureUsers(name) {
  const out = new Set();
  for (const sc of S.project.screens) {
    for (const o of sc.objects) if (o.instances.some((i) => i.image === name)) out.add(o.name);
    (function walk(evs) { for (const ev of evs) { if (ev.actions.some((a) => a.type === 'setImage' && a.image === name)) out.add('an event on ' + sc.name); walk(ev.children || []); } })(sc.events);
  }
  return [...out];
}

// Lists (whole app): name, starting items typed as  a, b, c
function listSection() {
  const rows = S.project.variables.filter((v) => Array.isArray(v.value)).map((v) => h('div', { class: 'list-var' },
    h('div', { class: 'var' },
      renamingVar === v.name
        ? renameInput({ value: v.name, label: 'List name', notify: hooks.notify, taken: S.project.variables.map((x) => x.name),
          onDone: () => { renamingVar = null; hooks.refresh(); },
          onSave: (nv) => { renameVariable(S.project, v.name, nv); renamingVar = null; hooks.commit(); } })
        : h('button', { class: 'vname link-name', type: 'button', title: 'Click to rename (events are updated too)', onclick: () => { renamingVar = v.name; hooks.refresh(); } }, v.name),
      h('span', { class: 'muted' }, `${v.value.length} item${v.value.length === 1 ? '' : 's'}`),
      h('button', { class: 'icon danger', title: 'Delete list', onclick: () => { S.project.variables = S.project.variables.filter((x) => x !== v); hooks.commit(); } }, '\u00d7')),
    h('input', { class: 'ctl list-start', value: v.value.join(', '), placeholder: 'Starting items, e.g. Milk, Eggs', 'aria-label': `Starting items of ${v.name}`,
      onchange: (e) => { v.value = e.target.value.split(',').map((x) => x.trim()).filter(Boolean).map(parseValue); hooks.commit(); } })));
  return [
    h('h3', {}, 'Lists (whole app)'),
    ...(rows.length ? rows : [h('p', { class: 'muted' }, 'None yet.')]),
    addRow('New list', (name) => {
      if (!isIdentifier(name)) { hooks.notify('List names use letters, numbers and _ only, and can\u2019t start with a number.'); return false; }
      if (S.project.variables.some((v) => v.name === name)) { hooks.notify('There is already something called ' + name); return false; }
      S.project.variables.push({ name, value: [] }); hooks.commit();
    }),
  ];
}
