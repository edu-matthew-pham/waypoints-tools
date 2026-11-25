// Functions (core/functions.js): named, whole-app pieces of event sheet with parameters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../src/core/runtime.js';
import { newProject, newScreen, newEvent, addObject, checkProject, exprScopeFor } from '../src/core/project.js';
import { isSequence, functionUsers, newFunction, callsInExpr, showsAsList, givesValue } from '../src/core/functions.js';
import { renameFunction, renameParam, addParam, removeParam, renameObject, renameVariable, functionNamesTaken, paramNamesTaken, nameProblem } from '../src/core/rename.js';
import { validateSheet } from '../src/core/catalog.js';
import { check } from '../src/core/expr.js';
import { sheetText } from '../src/core/sheet-text.js';
import { screenMap } from '../src/core/map.js';
import { resolve, canUse } from '../src/edu/features.js';
import { starterOf } from '../src/samples.js';

const click = (target) => ({ type: 'onClicked', target });
const call = (fn, args = {}) => ({ type: 'callFunction', fn, args });
const named = (screen, kind, name) => { const { obj } = addObject(screen, kind); obj.name = name; return obj; };
const clickBy = (rt, name, i = 0) => rt.click(rt.instancesOf(name)[i].id);
const fn = (name, params, actions, extra = {}) => ({ id: 'f' + name, name, params, events: [newEvent({ actions })], ...extra });

// Home: a Save button, an Entry input and a Note text. Other: just a Save button.
function app() {
  const p = checkProject(newProject());
  p.variables.push({ name: 'total', value: 0 }, { name: 'log', value: [] });
  const home = p.screens[0];
  const other = newScreen('Other');
  p.screens.push(other);
  named(home, 'button', 'Save'); named(home, 'input', 'Entry'); named(home, 'text', 'Note');
  named(other, 'button', 'Save');
  return { p, home, other };
}

test('checkProject adds an empty functions list, and a function always has one event', () => {
  const p = checkProject({ screens: [{ id: 's', name: 'A' }], functions: [{ name: 'F' }] });
  assert.equal(p.functions[0].params.length, 0);
  assert.equal(p.functions[0].events.length, 1);
  assert.ok(p.functions[0].id);
  assert.deepEqual(checkProject({ screens: [{ id: 's', name: 'A' }] }).functions, []);
});

test('a call runs the function there and then, with its parameters as plain names', () => {
  const { p, home } = app();
  p.functions.push(fn('SaveEntry', ['text'], [{ type: 'listAdd', value: 'text', list: 'log' }, { type: 'setText', target: 'Note', value: '"Saved " & text' }]));
  home.events.push(newEvent({ conds: [click('Save')], actions: [call('SaveEntry', { text: 'Entry.text' }), { type: 'addTo', value: 'count(log)', var: 'total' }] }));
  const rt = new Runtime(p);
  rt.start();
  rt.typeInto(rt.instancesOf('Entry')[0].id, 'piano');
  clickBy(rt, 'Save');
  assert.deepEqual(rt.getVar('log'), ['piano']);
  assert.equal(rt.instancesOf('Note')[0].props.text, 'Saved piano');
  assert.equal(rt.getVar('total'), 1); // the event carried on after the call
  assert.deepEqual(rt.errors, []);
});

test('a return value makes a function usable as a value: Total(price, qty)', () => {
  const { p, home } = app();
  p.functions.push(fn('Total', ['price', 'qty'], [{ type: 'setReturn', value: 'price * qty' }]));
  p.functions.push(fn('Hello', [], [{ type: 'setText', target: 'Note', value: '"hi"' }]));
  home.events.push(newEvent({ conds: [{ type: 'onStart' }], actions: [{ type: 'setVar', var: 'total', value: 'Total(3, 4) + Total(1, 1)' }] }));
  home.events.push(newEvent({ conds: [click('Save')], actions: [{ type: 'setVar', var: 'total', value: 'Hello()' }] }));
  const rt = new Runtime(p);
  rt.start();
  assert.equal(rt.getVar('total'), 13);
  clickBy(rt, 'Save');
  assert.equal(rt.getVar('total'), 13); // Hello gives nothing back: a problem, and total is unchanged
  assert.match(rt.errors[0].message, /Hello doesn't give a value back yet/);
});

test('Copy picked: off, a call starts with every copy; on, it works on the copies the caller picked', () => {
  const { p, home } = app();
  const tile = named(home, 'button', 'Tile');
  tile.instances.push({ ...tile.instances[0], id: 'tile2' }, { ...tile.instances[0], id: 'tile3' });
  p.functions.push(fn('Mark', [], [{ type: 'setText', target: 'Tile', value: '"X"' }]));
  home.events.push(newEvent({ conds: [click('Tile')], actions: [call('Mark')] }));
  let rt = new Runtime(p);
  rt.start();
  clickBy(rt, 'Tile', 1);
  assert.deepEqual(rt.instancesOf('Tile').map((i) => i.props.text), ['X', 'X', 'X']);

  p.functions[0].copyPicked = true;
  rt = new Runtime(p);
  rt.start();
  clickBy(rt, 'Tile', 1);
  assert.deepEqual(rt.instancesOf('Tile').map((i) => i.props.text), ['Button', 'X', 'Button']);
});

test('conditions, sub-events and Else work inside a function', () => {
  const { p, home } = app();
  const grade = {
    id: 'fGrade', name: 'Grade', params: ['mark'], events: [
      newEvent({ conds: [{ type: 'compareValues', left: 'mark', op: '≥', right: '50' }], actions: [{ type: 'setReturn', value: '"pass"' }],
        children: [newEvent({ conds: [{ type: 'compareValues', left: 'mark', op: '≥', right: '80' }], actions: [{ type: 'setReturn', value: '"great"' }] })] }),
      newEvent({ else: true, actions: [{ type: 'setReturn', value: '"try again"' }] }),
    ],
  };
  p.functions.push(grade);
  assert.equal(isSequence(grade), false);
  home.events.push(newEvent({ conds: [{ type: 'onStart' }], actions: [{ type: 'listAdd', list: 'log', value: 'Grade(30)' }, { type: 'listAdd', list: 'log', value: 'Grade(60)' }, { type: 'listAdd', list: 'log', value: 'Grade(90)' }] }));
  const rt = new Runtime(p);
  rt.start();
  assert.deepEqual(rt.getVar('log'), ['try again', 'pass', 'great']);
  assert.deepEqual(validateSheet(grade.events, 0, [], false, true), []);
});

test('objects are matched by name: an action on an object the screen lacks is skipped quietly', () => {
  const { p, home, other } = app();
  p.functions.push(fn('Saved', [], [{ type: 'setText', target: 'Note', value: '"Saved"' }, { type: 'addTo', value: '1', var: 'total' }, { type: 'setVar', var: 'total', value: 'total + len(Entry.text)' }]));
  p.functions.push({ id: 'fCheck', name: 'Check', params: [], events: [newEvent({ conds: [{ type: 'compareText', target: 'Note', op: '=', value: '""' }], actions: [{ type: 'addTo', value: '100', var: 'total' }] }), newEvent({ else: true, actions: [{ type: 'addTo', value: '10', var: 'total' }] })] });
  p.allScreens.events.push(newEvent({ conds: [click('Save')], actions: [call('Saved'), call('Check')] }));
  const rt = new Runtime(p);
  rt.start(other.id);
  clickBy(rt, 'Save');
  assert.equal(rt.getVar('total'), 11); // +1; Entry.text and Note skipped; Check: no Note, so false, and Else runs
  assert.deepEqual(rt.errors, []);
  rt.start(home.id);
  clickBy(rt, 'Save');
  assert.equal(rt.instancesOf('Note')[0].props.text, 'Saved');
  assert.equal(rt.getVar('total'), 11); // 1 + len("") = 1, then Note isn't "" so +10
});

test('calls inside calls, and a function calling itself forever is stopped with a clear problem', () => {
  const { p, home } = app();
  p.functions.push(fn('Double', ['n'], [{ type: 'setReturn', value: 'n * 2' }]));
  p.functions.push(fn('Quad', ['n'], [{ type: 'setReturn', value: 'Double(Double(n))' }]));
  p.functions.push(fn('Forever', [], [call('Forever')]));
  home.events.push(newEvent({ conds: [{ type: 'onStart' }], actions: [{ type: 'setVar', var: 'total', value: 'Quad(5)' }] }));
  home.events.push(newEvent({ conds: [click('Save')], actions: [call('Forever')] }));
  const rt = new Runtime(p);
  rt.start();
  assert.equal(rt.getVar('total'), 20);
  clickBy(rt, 'Save');
  assert.equal(rt.errors.length, 1);
  assert.match(rt.errors[0].message, /^Forever: Forever was called inside itself more than 50 times/);
});

test('problems inside a function name it; a missing value for a parameter is a problem', () => {
  const { p, home } = app();
  p.functions.push(fn('Bad', ['n'], [{ type: 'addTo', value: 'n', var: 'total' }]));
  home.events.push(newEvent({ conds: [{ type: 'onStart' }], actions: [call('Bad', { n: '"abc"' }), call('Bad', {})] }));
  const rt = new Runtime(p);
  rt.start();
  assert.deepEqual(rt.errors.map((e) => e.message).map((m) => m.slice(0, 20)), ['Bad: Adding needs nu', 'Bad needs a value fo']);
});

test('Set return value outside a function, and triggers inside one, are flagged', () => {
  const evs = [newEvent({ actions: [{ type: 'setReturn', value: '1' }] })];
  assert.match(validateSheet(evs)[0].message, /only works inside a function/);
  assert.deepEqual(validateSheet(evs, 0, [], false, true), []);
  assert.match(validateSheet([newEvent({ conds: [{ type: 'onStart' }] })], 0, [], false, true)[0].message, /can't go in a function/);
});

test('value boxes check the app’s functions and how many values they need; parameters are names inside', () => {
  const { p, home } = app();
  p.functions.push(fn('Total', ['price', 'qty'], []));
  const outside = exprScopeFor(p, home);
  assert.equal(check('Total(1, 2)', outside), null);
  assert.equal(check('Total(1)', outside), 'Total() needs 2 values (price, qty)');
  assert.match(check('price * 2', outside), /no variable called "price"/);
  const inside = exprScopeFor(p, home, p.functions[0]);
  assert.equal(check('price * qty', inside), null);
  assert.deepEqual(callsInExpr('Total(1, 2) & "Total(" & round(x)', new Set(['Total'])), ['Total']);
});

test('renaming a function updates calls and values; renaming a parameter updates its uses and every call', () => {
  const { p, home } = app();
  p.functions.push(fn('Total', ['price', 'qty'], [{ type: 'setReturn', value: 'price * qty & " price"' }]));
  p.functions.push(fn('Show', ['row'], [{ type: 'setText', target: 'Note', value: 'row.title & Total(1, 2)' }]));
  home.events.push(newEvent({ conds: [click('Save')], actions: [call('Show', { row: 'item(log, 1)' }), { type: 'setVar', var: 'total', value: 'Total(2, 3) + 1' }] }));
  p.allScreens.events.push(newEvent({ actions: [call('Total', { price: '1', qty: '2' })] }));

  renameFunction(p, 'Total', 'Cost');
  assert.equal(p.functions[0].name, 'Cost');
  assert.equal(home.events[0].actions[1].value, 'Cost(2, 3) + 1');
  assert.equal(p.functions[1].events[0].actions[0].value, 'row.title & Cost(1, 2)');
  assert.equal(p.allScreens.events[0].actions[0].fn, 'Cost');

  renameParam(p, 'Cost', 'qty', 'amount');
  assert.deepEqual(p.functions[0].params, ['price', 'amount']);
  assert.equal(p.functions[0].events[0].actions[0].value, 'price * amount & " price"'); // "price" in quotes stays
  assert.deepEqual(Object.keys(p.allScreens.events[0].actions[0].args), ['price', 'amount']);
  renameParam(p, 'Show', 'row', 'song');
  assert.equal(p.functions[1].events[0].actions[0].value, 'song.title & Cost(1, 2)');

  addParam(p, 'Cost', 'tax');
  assert.deepEqual(p.functions[0].params, ['price', 'amount', 'tax']);
  removeParam(p, 'Cost', 'price');
  assert.deepEqual(p.allScreens.events[0].actions[0].args, { amount: '2' });
});

test('other renames reach inside functions; names that would clash are refused', () => {
  const { p, home, other } = app();
  p.functions.push(fn('Saved', ['text'], [{ type: 'setText', target: 'Note', value: 'Note.text & text & total' }]));
  renameVariable(p, 'total', 'sum');
  assert.equal(p.functions[0].events[0].actions[0].value, 'Note.text & text & sum');
  renameObject(home, 'Note', 'Message', p); // only Home has a Note, so the function follows
  assert.equal(p.functions[0].events[0].actions[0].target, 'Message');
  assert.equal(p.functions[0].events[0].actions[0].value, 'Message.text & text & sum');
  named(other, 'text', 'Message');
  renameObject(home, 'Message', 'Msg', p); // Other still has a Message: the function keeps the name
  assert.equal(p.functions[0].events[0].actions[0].target, 'Message');

  assert.ok(nameProblem('sum', functionNamesTaken(p)));        // a variable
  assert.ok(nameProblem('Save', functionNamesTaken(p)));       // an object
  assert.ok(nameProblem('round', functionNamesTaken(p)));      // built in
  assert.equal(nameProblem('Saved', functionNamesTaken(p, 'Saved')), '');
  assert.ok(nameProblem('sum', paramNamesTaken(p, p.functions[0])));
  assert.ok(nameProblem('LoopItem', paramNamesTaken(p, p.functions[0])));
  assert.equal(nameProblem('qty', paramNamesTaken(p, p.functions[0])), '');
});

test('sheet text: a function line, then its events; calls read "Call F with a = …"', () => {
  const { p, home } = app();
  p.functions.push(fn('SaveEntry', ['text'], [{ type: 'listAdd', value: 'text', list: 'log' }], { copyPicked: true }));
  p.functions.push(fn('Refresh', [], []));
  home.events.push(newEvent({ conds: [click('Save')], actions: [call('SaveEntry', { text: 'Entry.text' }), call('Refresh')] }));
  const lines = sheetText(p).split('\n');
  const at = lines.indexOf('function SaveEntry(text) (only the picked ones)');
  assert.ok(at > 0);
  assert.equal(lines[at + 1], 'event: always | do: Add text to the end of list log');
  assert.equal(lines[at + 2], 'function Refresh()');
  assert.ok(at < lines.indexOf('screen Home'));
  assert.ok(lines.includes('event: when Save is clicked | do: Call SaveEntry with text = Entry.text; Call Refresh'));
});

test('the map follows calls: a function that goes to a screen gives an arrow from every screen that calls it', () => {
  const { p, home, other } = app();
  const third = newScreen('Done');
  p.screens.push(third);
  p.functions.push(fn('Finish', [], [{ type: 'goToScreen', screen: third.id }]));
  p.functions.push(fn('Wrap', [], [call('Finish'), call('Wrap')])); // calls itself too: followed once
  home.events.push(newEvent({ conds: [click('Save')], actions: [call('Wrap')] }));
  p.allScreens.events.push(newEvent({ conds: [{ type: 'onKey', key: 'Escape' }], actions: [call('Finish')] }));
  const map = screenMap(p);
  const from = (s) => map.links.find((l) => l.from === s.id && l.to === third.id);
  assert.deepEqual(from(home).labels, ['Key Escape is pressed, via Finish (all screens)', 'Save is clicked, via Wrap, via Finish']);
  assert.deepEqual(from(home).kinds, ['key', 'click']);
  assert.ok(from(other));
  assert.equal(map.screens.find((s) => s.id === third.id).reachable, true);
});

test('functions are Level 4 (or a lesson that lists them); a new project offers everything', () => {
  assert.equal(resolve({ level: 3 }).functions, false);
  assert.equal(canUse(resolve({ level: 3 }), 'act', 'callFunction'), false);
  assert.equal(resolve({ level: 4 }).functions, true);
  const lesson = resolve({ level: 2, allow: { act: ['callFunction'] } });
  assert.equal(lesson.functions, true);
  assert.equal(lesson.tables, false);
  assert.equal(newProject().features.level, 4);
});

test('a function shows as a list until "+ Check"; it gives a value back once it has Set return value', () => {
  const f = fn('F', [], [{ type: 'setText', target: 'Note', value: '"x"' }]);
  assert.equal(showsAsList(f), true);
  f.asSheet = true;
  assert.equal(showsAsList(f), false);
  assert.equal(givesValue(f), false);
  f.events[0].actions.push({ type: 'setReturn', value: '1' });
  assert.equal(givesValue(f), true);
  const { p } = app();
  p.functions.push(f);
  const f2 = checkProject(JSON.parse(JSON.stringify(p))).functions[0];
  assert.equal(f2.asSheet, true); // kept when saved and opened
});

test('helpers: new functions get a free name; users list where a function is called; starters drop functions', () => {
  const { p, home } = app();
  const a = newFunction(p), b = newFunction(p);
  assert.deepEqual([a.name, b.name], ['MyFunction', 'MyFunction2']);
  assert.equal(isSequence(a), true);
  home.events.push(newEvent({ actions: [{ type: 'setVar', var: 'total', value: 'MyFunction()' }] }));
  p.allScreens.events.push(newEvent({ actions: [call('MyFunction')] }));
  b.events[0].actions.push(call('MyFunction'));
  assert.deepEqual(functionUsers(p, 'MyFunction'), ['Home', 'All screens', 'MyFunction2']);
  assert.deepEqual(starterOf(p).functions, []);
});

test('a function warns where it uses an object that a screen calling it lacks', async () => {
  const { missingObjectNotes, screensCalling } = await import('../src/core/functions.js');
  const { p, home, other } = app();
  const saved = { id: 'fSaved', name: 'Saved', params: [], events: [
    newEvent({ conds: [{ type: 'compareText', target: 'Note', op: '=', value: '""' }], actions: [{ type: 'addTo', value: '100', var: 'total' }] }),
    newEvent({ else: true, actions: [{ type: 'addTo', value: '10', var: 'total' }] }),
  ] };
  p.functions.push(saved, fn('Wrap', [], [call('Saved')]));
  home.events.push(newEvent({ conds: [click('Save')], actions: [call('Saved')] }));
  assert.deepEqual(missingObjectNotes(p, saved), []); // only Home calls it, and Home has a Note
  other.events.push(newEvent({ conds: [click('Save')], actions: [call('Wrap')] })); // Other calls it through Wrap
  assert.deepEqual(screensCalling(p, 'Saved').map((s) => s.name), ['Home', 'Other']);
  const notes = missingObjectNotes(p, saved);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, saved.events[0].id);
  assert.match(notes[0].message, /^Other has no Note but calls Saved: there, a check on Note counts as false/);
});
