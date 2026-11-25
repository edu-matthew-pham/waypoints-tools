import test from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../src/core/runtime.js';
import { check } from '../src/core/expr.js';
import { newProject, addObject, exprScopeFor, scopeFor, newEvent, fieldValue, tableColumns, checkProject } from '../src/core/project.js';
import { sheetText } from '../src/core/sheet-text.js';
import { renameField, renameVariable } from '../src/core/rename.js';
import { defaultParams, ACTIONS, CONDITIONS } from '../src/core/catalog.js';

// A playlist app: a Songs table, a Title and a Length box, an Add button, a Total text.
function playlist() {
  const p = newProject('Playlist');
  p.features = { level: 4 };
  p.variables.push(
    { name: 'Songs', table: { fields: [{ name: 'title', type: 'text' }, { name: 'artist', type: 'text' }, { name: 'length', type: 'number' }] },
      value: [{ title: 'Blue', artist: 'Kai', length: 3 }, { title: 'Arc', artist: 'Mo', length: 5 }] },
    { name: 'total', value: 0 },
    { name: 'longest', value: '' },
  );
  const s = p.screens[0];
  for (const [kind, name] of [['input', 'Title'], ['input', 'Length'], ['button', 'Add'], ['text', 'Total'], ['button', 'Sum'], ['table', 'View']]) {
    const { obj } = addObject(s, kind);
    obj.name = name;
  }
  s.objects.find((o) => o.name === 'View').instances[0].source = 'Songs';
  s.events.push(
    newEvent({ conds: [{ type: 'onClicked', target: 'Add' }], actions: [{ type: 'tableAdd', table: 'Songs', values: { title: 'Title.text', length: 'Length.text' } }] }),
    newEvent({ conds: [{ type: 'onClicked', target: 'Sum' }], actions: [{ type: 'setVar', var: 'total', value: '0' }], children: [
      newEvent({ conds: [{ type: 'forEachRow', table: 'Songs' }], actions: [{ type: 'addTo', var: 'total', value: 'LoopItem.length' }] }),
    ] }),
  );
  return p;
}
const find = (rt, name) => rt.instancesOf(name)[0];
const songs = (rt) => rt.getVar('Songs');

test('a table is a list of records: item(..).field, count, LoopItem.field', () => {
  const rt = new Runtime(playlist());
  rt.start();
  assert.equal(rt.evalExpr('item(Songs, 2).artist', { picked: new Map(), loop: [] }), 'Mo');
  assert.equal(rt.evalExpr('count(Songs)', { picked: new Map(), loop: [] }), 2);
  rt.click(find(rt, 'Sum').id);
  assert.equal(rt.getVar('total'), 8);  // For each row adds every length
});

test('Add a row: one value per field, turned into the field type; empty boxes give "" or 0', () => {
  const rt = new Runtime(playlist());
  rt.start();
  rt.userChange(find(rt, 'Title').id, 'Cove');
  rt.userChange(find(rt, 'Length').id, '4');
  rt.click(find(rt, 'Add').id);
  assert.deepEqual(songs(rt)[2], { title: 'Cove', artist: '', length: 4 });
  rt.userChange(find(rt, 'Length').id, 'four');
  rt.click(find(rt, 'Add').id);
  assert.equal(songs(rt).length, 3);   // not added: length holds numbers
  assert.match(rt.errors.at(-1).message, /number field/);
});

test('Set a field, Remove a row, Sort (numbers by size, text A to Z, stable), Clear', () => {
  const rt = new Runtime(playlist());
  rt.start();
  const ctx = { picked: new Map(), loop: [], clicked: null };
  ACTIONS.tableAdd.run(rt, ctx, { table: 'Songs', values: { title: '"apple"', artist: '"Kai"', length: '10' } });
  ACTIONS.tableSort.run(rt, ctx, { table: 'Songs', field: 'length', dir: 'down' });
  assert.deepEqual(songs(rt).map((r) => r.length), [10, 5, 3]);
  ACTIONS.tableSort.run(rt, ctx, { table: 'Songs', field: 'title', dir: 'up' });
  assert.deepEqual(songs(rt).map((r) => r.title), ['apple', 'Arc', 'Blue']);   // capitals don't change the order
  ACTIONS.tableSort.run(rt, ctx, { table: 'Songs', field: 'artist', dir: 'up' });
  assert.deepEqual(songs(rt).map((r) => r.title), ['apple', 'Blue', 'Arc']);   // the two Kai rows keep their order
  ACTIONS.tableSet.run(rt, ctx, { table: 'Songs', field: 'artist', index: '3', value: '"Lu"' });
  assert.equal(songs(rt)[2].artist, 'Lu');
  assert.throws(() => ACTIONS.tableRemove.run(rt, ctx, { table: 'Songs', index: '9' }), /3 rows, so there is no row 9/);
  ACTIONS.tableRemove.run(rt, ctx, { table: 'Songs', index: '1' });
  assert.equal(songs(rt).length, 2);
  ACTIONS.tableClear.run(rt, ctx, { table: 'Songs' });
  assert.equal(songs(rt).length, 0);
});

test('a run never changes the project, and list actions refuse a table', () => {
  const p = playlist();
  const rt = new Runtime(p);
  rt.start();
  ACTIONS.tableClear.run(rt, { picked: new Map(), loop: [] }, { table: 'Songs' });
  assert.equal(p.variables[0].value.length, 2);
  assert.throws(() => rt.listChange('Songs', () => {}), /is a table/);
  assert.throws(() => rt.setVar('Songs', 1), /is a table/);
});

test('a variable can hold one row; its fields read with a dot', () => {
  const rt = new Runtime(playlist());
  rt.start();
  const ctx = { picked: new Map(), loop: [] };
  rt.setVar('longest', rt.evalExpr('item(Songs, 2)', ctx));
  assert.equal(rt.evalExpr('longest.title & " by " & longest.artist', ctx), 'Arc by Mo');
  assert.throws(() => rt.evalExpr('longest.colour', ctx), /no field "colour"\. The fields are title, artist, length/);
  assert.throws(() => rt.evalExpr('total.title', ctx), /isn't a row of a table/);
});

test('clicking a row of a Table object: ClickedIndex and ClickedItem.field', () => {
  const p = playlist();
  p.screens[0].events.push(newEvent({ conds: [{ type: 'onItemClicked', target: 'View' }], actions: [{ type: 'setText', target: 'Total', value: 'ClickedIndex & ": " & ClickedItem.title' }] }));
  const rt = new Runtime(p);
  rt.start();
  rt.itemClick(find(rt, 'View').id, 2);
  assert.equal(find(rt, 'Total').props.text, '2: Arc');
});

test('remember between visits: saved on change, loaded on start, forgotten on request', () => {
  const saved = new Map();
  const store = { load: (n) => saved.get(n), save: (n, v) => (v === undefined ? saved.delete(n) : saved.set(n, structuredClone(v))) };
  const p = playlist();
  p.variables[0].remember = true;
  const rt = new Runtime(p, { store });
  rt.start();
  rt.userChange(find(rt, 'Title').id, 'Cove');
  rt.click(find(rt, 'Add').id);
  assert.equal(saved.get('Songs').length, 3);
  const again = new Runtime(p, { store });
  again.start();
  assert.equal(again.getVar('Songs').length, 3);                 // a return visit
  again.forget();
  const fresh = new Runtime(p, { store });
  fresh.start();
  assert.equal(fresh.getVar('Songs').length, 2);                 // a first visit again
  const blocked = new Runtime(p, { store: { load: () => { throw new Error('no storage'); }, save: () => { throw new Error('no storage'); } } });
  blocked.start();
  blocked.click(find(blocked, 'Add').id);                         // storage blocked: still runs
  assert.equal(blocked.getVar('Songs').length, 3);
});

test('editor: static check knows fields; scope lists tables apart from lists; defaults fill a field', () => {
  const p = playlist();
  const sc = exprScopeFor(p, p.screens[0]);
  assert.equal(check('LoopItem.title', sc), null);
  assert.equal(check('item(Songs, 1).length + 1', sc), null);
  assert.match(check('LoopItem.Title', sc), /Use \.title/);
  assert.match(check('item(Songs, 1).colour', sc), /No table has a field called "colour"/);
  const scope = scopeFor(p, p.screens[0]);
  assert.deepEqual(scope.tables, ['Songs']);
  assert.deepEqual(scope.lists, []);
  assert.deepEqual(defaultParams(ACTIONS.tableSort, scope), { table: 'Songs', field: 'title', dir: 'up' });
  assert.equal(CONDITIONS.forEachRow.loop, 'each');
});

test('sheet text shows tables, remembered values and the Add a row values', () => {
  const p = playlist();
  p.variables[0].remember = true;
  const t = sheetText(p);
  assert.match(t, /^table Songs = \[title, artist, length\] 2 rows \(remembered\)$/m);
  assert.match(t, /object View \(table\) text "" shows Songs/);
  assert.match(t, /do: Add a row to table Songs: title = Title\.text, length = Length\.text/);
  assert.match(t, /> when For each row in table Songs \| do: Add LoopItem\.length to variable total/);
});

test('renaming a field updates rows, actions and every .field; renaming a table updates its uses', () => {
  const p = playlist();
  const s = p.screens[0];
  s.events.push(newEvent({ conds: [{ type: 'onStart' }], actions: [{ type: 'tableSort', table: 'Songs', field: 'length', dir: 'up' }, { type: 'setText', target: 'Total', value: 'item(Songs, 1).length & " " & Total.text' }] }));
  renameField(p, 'Songs', 'length', 'minutes');
  assert.deepEqual(Object.keys(p.variables[0].value[0]), ['title', 'artist', 'minutes']);
  assert.equal(s.events[0].actions[0].values.minutes, 'Length.text');      // the Length object is not a field: left alone
  assert.equal(s.events[1].children[0].actions[0].value, 'LoopItem.minutes');
  assert.equal(s.events[2].actions[0].field, 'minutes');
  assert.equal(s.events[2].actions[1].value, 'item(Songs, 1).minutes & " " & Total.text');
  renameVariable(p, 'Songs', 'Tracks');
  assert.equal(s.events[0].actions[0].table, 'Tracks');
  assert.equal(s.objects.find((o) => o.name === 'View').instances[0].source, 'Tracks');
  assert.equal(s.events[2].actions[1].value, 'item(Tracks, 1).minutes & " " & Total.text');
});

test('field values, Table object columns, older files', () => {
  assert.deepEqual(fieldValue('number', ' 4 '), { value: 4 });
  assert.deepEqual(fieldValue('number', ''), { value: 0 });
  assert.ok(fieldValue('number', 'x').error);
  assert.deepEqual(fieldValue('text', 7), { value: '7' });
  const p = playlist();
  assert.deepEqual(tableColumns(p, { source: 'Songs', columns: '' }), ['title', 'artist', 'length']);
  assert.deepEqual(tableColumns(p, { source: 'Songs', columns: 'length, nope, title' }), ['length', 'title']);
  const old = checkProject({ screens: [{ id: 's', name: 'S' }], variables: [{ name: 'T', table: {} }] });
  assert.deepEqual(old.variables[0], { name: 'T', table: { fields: [] }, value: [] });
});

test('a clicked row stays selected until its table changes', () => {
  const p = playlist();
  p.screens[0].events.push(newEvent({ conds: [{ type: 'onItemClicked', target: 'View' }], actions: [] }));
  const rt = new Runtime(p);
  rt.start();
  const view = find(rt, 'View');
  rt.itemClick(view.id, 2);
  assert.equal(view.selected, 2);
  rt.tableChange('Songs', (rows) => rows.pop());
  assert.equal(view.selected, 0);
});

test('paste rows from a spreadsheet: header skipped, numbers checked, rows added', async () => {
  const { pasteRows, parseCells } = await import('../src/core/project.js');
  assert.deepEqual(parseCells('a\t"b\tc"\n"say ""hi"""\t2\n'), [['a', 'b\tc'], ['say "hi"', '2']]);
  assert.deepEqual(parseCells('x,y\n1,2'), [['x', 'y'], ['1', '2']]);
  const t = playlist().variables[0];
  let r = pasteRows(t, 'Title\tArtist\tLength\nCove\tAva\t4\nDune\tBo\t2\textra', { row: 3 });
  assert.deepEqual(r, { rows: 2, skipped: 1 });
  assert.deepEqual(t.value.map((x) => x.title), ['Blue', 'Arc', 'Cove', 'Dune']);
  assert.equal(t.value[2].length, 4);
  r = pasteRows(t, 'Mo\tlong', { row: 1, field: 'artist' });
  assert.match(r.error, /row 1, length/);
  assert.equal(t.value[0].artist, 'Kai');
  r = pasteRows(t, 'Zed\nYo', { row: 1, field: 'artist' });
  assert.deepEqual([t.value[0].artist, t.value[1].artist], ['Zed', 'Yo']);
});
