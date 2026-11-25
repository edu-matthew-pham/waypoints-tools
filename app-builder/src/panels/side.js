// Left panel: one project tree (screens > objects > copies) plus whole-app variables.
import { h } from '../ui/dom.js';
import { OBJECT_KINDS } from '../core/catalog.js';
import { addObject, newScreen, duplicateInstance, deleteInstance, isIdentifier, parseValue, sizeOf, isList, isTable, newTable, fieldValue, FIELD_TYPES, pasteRows } from '../core/project.js';
import { openMenu } from '../ui/menu.js';
import { openObjectPicker } from '../ui/object-picker.js';
import { renameInput } from '../ui/rename-input.js';
import { renameObject, renameVariable, renameField, nameProblem } from '../core/rename.js';
import { pickPicture } from '../ui/upload.js';
import { assetName } from '../core/assets.js';
import { S, screen, hooks } from '../state.js';
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
      taken: screen().objects.map((x) => x.name),
      onSave: (v) => { renameObject(screen(), o.name, v); renamingObj = null; hooks.commit(); },
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
          h('button', { class: 'link', 'data-ab': 'screen:' + s.name, onclick: () => { S.screenId = s.id; S.selId = null; collapsed.delete(s.id); hooks.refresh(); } }, '▸ ' + s.name)));
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
      ? renameInput({ value: v.name, label: 'Variable name', notify: hooks.notify, taken: S.project.variables.map((x) => x.name),
        onDone: () => { renamingVar = null; hooks.refresh(); },
        onSave: (nv) => { renameVariable(S.project, v.name, nv); renamingVar = null; hooks.commit(); } })
      : h('button', { class: 'vname link-name', type: 'button', title: 'Click to rename (events are updated too)', onclick: () => { renamingVar = v.name; hooks.refresh(); } }, v.name),
    h('input', { class: 'ctl small', value: String(v.value), title: 'Starting value', 'aria-label': `Starting value of ${v.name}`, onchange: (e) => { v.value = parseValue(e.target.value); hooks.commit(); } }),
    h('span', { class: 'now', 'data-now': v.name }, nowText(v.name)),
    rememberBtn(v),
    h('button', { class: 'icon danger', title: 'Delete variable', onclick: () => { S.project.variables.splice(i, 1); hooks.commit(); } }, '×')));

  el.replaceChildren(
    h('h3', {}, 'Project'),
    h('div', { class: 'tree' }, ...tree),
    h('button', { class: 'btn add-screen', type: 'button', 'data-ab': 'add-screen', onclick: () => {
      const names = new Set(S.project.screens.map((x) => x.name));
      let n = S.project.screens.length + 1; while (names.has('Screen ' + n)) n++;
      const sc2 = newScreen('Screen ' + n); S.project.screens.push(sc2); S.screenId = sc2.id; S.selId = null; renaming = sc2.id; hooks.commit();
    } }, '+ Screen'),
    h('h3', {}, 'Variables (whole app)'),
    ...(vars.some(Boolean) ? [h('div', { class: 'var var-head' }, h('span', { class: 'vname' }), h('span', { class: 'col-start' }, 'starts at'), h('span', { class: 'col-now' }, 'now'), h('span', { class: 'col-x' })), ...vars.filter(Boolean)] : [h('p', { class: 'muted' }, 'None yet.')]),
    addRow('New variable', (name, value) => {
      if (!isIdentifier(name)) { hooks.notify('Variable names use letters, numbers and _ only, and can’t start with a number.'); return false; }
      if (S.project.variables.some((v) => v.name === name)) { hooks.notify('There is already a variable called ' + name); return false; }
      S.project.variables.push({ name, value }); hooks.commit();
    }, true),
    ...(!S.rf || S.rf.lists ? listSection() : []),
    ...(!S.rf || S.rf.tables || S.project.variables.some(isTable) ? tableSection() : []),
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
      }, hooks.notify), 'data-ab': 'upload-picture' }, '+ Upload picture')] : []),
    ...(S.project.sounds?.length ? [
      h('h3', {}, 'Sounds (whole app)'),
      h('div', { class: 'pic-list' }, S.project.sounds.map((a) => h('div', { class: 'var' },
        h('span', { class: 'vname' }, '🔊 ' + a.name),
        h('span', { class: 'muted start-count' }, `${Math.round(a.data.length * 0.75 / 1024)} KB`),
        h('button', { class: 'icon danger', title: 'Delete sound', onclick: () => {
          const users = soundUsers(a.name);
          if (users.length) { hooks.notify(`${a.name} is still used by ${users.join(', ')}. Change those first.`); return; }
          S.project.sounds = S.project.sounds.filter((x) => x !== a); hooks.commit();
        } }, '\u00d7'))))] : []),
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

// objects and events that use an uploaded sound
function soundUsers(name) {
  const out = new Set();
  for (const sc of S.project.screens) {
    for (const o of sc.objects) if (o.instances.some((i) => i.sound === name)) out.add(o.name);
    (function walk(evs) { for (const ev of evs) { if (ev.actions.some((a) => a.type === 'setSound' && a.sound === name)) out.add('an event on ' + sc.name); walk(ev.children || []); } })(sc.events);
  }
  return [...out];
}

// Lists (whole app): name, starting items typed as  a, b, c
function listSection() {
  const rows = S.project.variables.filter(isList).map((v) => h('div', { class: 'list-var' },
    h('div', { class: 'var' },
      renamingVar === v.name
        ? renameInput({ value: v.name, label: 'List name', notify: hooks.notify, taken: S.project.variables.map((x) => x.name),
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
      if (S.project.variables.some((v) => v.name === name)) { hooks.notify('There is already something called ' + name); return false; }
      S.project.variables.push({ name, value: [] }); hooks.commit();
    }),
  ];
}

// Tables (whole app): a small spreadsheet per table. Columns are fields (text or number), rows are records.
// What is typed here is the table at the start; while the app runs, the live rows show underneath.
let renamingField = null; // `${table}.${field}` being renamed
const jsonOpen = new Set();  // tables whose JSON view is open

function tableSection() {
  const used = () => S.project.variables.map((x) => x.name);
  const blocks = S.project.variables.filter(isTable).map((v) => {
    const fields = v.table.fields;
    const fieldHead = (f, fi) => {
      if (renamingField === `${v.name}.${f.name}`) {
        return h('th', {}, renameInput({ value: f.name, label: 'Field name', notify: hooks.notify, taken: fields.map((x) => x.name),
          onDone: () => { renamingField = null; hooks.refresh(); },
          onSave: (nv) => { renameField(S.project, v.name, f.name, nv); renamingField = null; hooks.commit(); } }));
      }
      return h('th', {}, h('button', { class: 'link-name fld', type: 'button', 'data-ab': `field-menu:${v.name}.${f.name}`, title: `${f.name}: ${f.type === 'number' ? 'numbers' : 'text'}. Click for options`, 'aria-haspopup': 'menu',
        onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); openMenu({ x: r.left, y: r.bottom + 4, returnFocus: e.currentTarget, items: [
          { label: 'Rename', fn: () => { renamingField = `${v.name}.${f.name}`; hooks.refresh(); } },
          ...FIELD_TYPES.map(([t, label]) => ({ label: (f.type === t ? '✓ ' : '') + label, disabled: f.type === t, fn: () => {
            const bad = v.value.filter((r) => fieldValue(t, r[f.name]).error).length;
            if (bad) { hooks.notify(`${bad} row${bad === 1 ? ' has' : 's have'} text in ${f.name} that isn't a number. Change ${bad === 1 ? 'it' : 'them'} first.`); return; }
            f.type = t; for (const r of v.value) r[f.name] = fieldValue(t, r[f.name]).value; hooks.commit();
          } })),
          fi > 0 ? { label: 'Move left', fn: () => { fields.splice(fi - 1, 0, fields.splice(fi, 1)[0]); hooks.commit(); } } : null,
          fields.length > 1 ? { label: 'Delete field', danger: true, fn: () => { fields.splice(fi, 1); for (const r of v.value) delete r[f.name]; hooks.commit(); } } : null,
        ] }); } }, f.name, h('small', { class: 'ftype' }, f.type === 'number' ? ' 123' : ' abc')));
    };
    const cellInput = (r, ri, f) => h('input', { class: 'cell' + (f.type === 'number' ? ' num' : ''), value: String(r[f.name] ?? ''), 'aria-label': `${v.name} row ${ri + 1} ${f.name}`, 'data-ab': `cell:${v.name}:${ri + 1}:${f.name}`,
      inputmode: f.type === 'number' ? 'decimal' : null,
      onchange: (e) => {
        const res = fieldValue(f.type, e.target.value);
        if (res.error) { hooks.notify(`${f.name} holds numbers: ${res.error}.`); e.target.value = String(r[f.name] ?? ''); return; }
        r[f.name] = res.value; commitKeepFocus(e.target);
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
      onclick: () => pasteDialog(v) }, '📋 Paste rows');
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
        h('button', { class: 'icon danger', title: 'Delete table', onclick: () => { S.project.variables = S.project.variables.filter((x) => x !== v); hooks.commit(); } }, '×')),
      grid,
      h('div', { class: 'tbl-tools' }, addRowBtn, pasteBtn, jsonBtn),
      jsonOpen.has(v.name) ? h('pre', { class: 'json', 'data-ab': `json-view:${v.name}`, 'aria-label': `${v.name} as JSON` }, JSON.stringify(v.value, null, 2)) : null,
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
