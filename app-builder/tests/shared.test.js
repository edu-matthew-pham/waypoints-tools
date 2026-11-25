// The All screens sheet (core/shared.js): events that run on every screen, objects matched by name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../src/core/runtime.js';
import { newProject, newScreen, newEvent, addObject, checkProject } from '../src/core/project.js';
import { sharedEventsFor, objectsMentioned, objectNames, allObjectsScreen } from '../src/core/shared.js';
import { renameObject, renameInstVar, renameVariable, renameField } from '../src/core/rename.js';
import { sheetText } from '../src/core/sheet-text.js';
import { screenMap } from '../src/core/map.js';
import { resolve } from '../src/edu/features.js';

const click = (target) => ({ type: 'onClicked', target });
const go = (screen) => ({ type: 'goToScreen', screen });
const add = (value, v = 'n') => ({ type: 'addTo', value: String(value), var: v });
const named = (screen, kind, name) => { const { obj } = addObject(screen, kind); obj.name = name; return obj; };
const clickBy = (rt, name) => rt.click(rt.instancesOf(name)[0].id);

// Home and Settings both have a HomeButton; Settings also has a Back button. Help has no HomeButton.
function app() {
  const p = newProject();
  p.variables.push({ name: 'n', value: 0 });
  const home = p.screens[0];
  const settings = newScreen('Settings'), help = newScreen('Help');
  p.screens.push(settings, help);
  named(home, 'button', 'HomeButton'); named(home, 'button', 'GoSettings');
  named(settings, 'button', 'HomeButton'); named(settings, 'text', 'Title');
  named(help, 'text', 'Title');
  home.events.push(newEvent({ conds: [click('GoSettings')], actions: [go(settings.id)] }));
  p.allScreens = { events: [newEvent({ conds: [click('HomeButton')], actions: [go(home.id)] })] };
  return { p, home, settings, help };
}

test('checkProject adds an empty All screens sheet', () => {
  const p = checkProject({ screens: [{ id: 's', name: 'A' }] });
  assert.deepEqual(p.allScreens, { events: [] });
});

test('objectsMentioned: object params and Name.x in value boxes, never loop or table names', () => {
  const { p } = app();
  const known = objectNames(p);
  const ev = newEvent({ conds: [{ type: 'onStart' }], actions: [{ type: 'setText', target: 'Title', value: 'HomeButton.text & LoopItem.x & n' }],
    children: [newEvent({ actions: [{ type: 'tableAdd', table: 'T', values: { a: 'GoSettings.text' } }] })] });
  assert.deepEqual([...objectsMentioned(ev, known)].sort(), ['GoSettings', 'HomeButton', 'Title']);
});

test('a shared event runs on each screen that has its objects, and is skipped quietly where one is missing', () => {
  const { p, home, settings, help } = app();
  p.allScreens.events.push(newEvent({ conds: [{ type: 'onStart' }], actions: [add(1)] }));          // no objects: every screen
  p.allScreens.events.push(newEvent({ conds: [{ type: 'onStart' }], actions: [{ type: 'setText', target: 'Title', value: '"Hi"' }] }));
  assert.equal(sharedEventsFor(p, home).length, 2);   // HomeButton + start; no Title on Home
  assert.equal(sharedEventsFor(p, settings).length, 3);
  assert.equal(sharedEventsFor(p, help).length, 2);   // no HomeButton on Help

  const rt = new Runtime(p);
  rt.start(help.id);
  assert.equal(rt.getVar('n'), 1);
  assert.equal(rt.instancesOf('Title')[0].props.text, 'Hi');
  assert.deepEqual(rt.errors, []);                   // skipped, not a problem

  rt.start(home.id);
  clickBy(rt, 'GoSettings');
  assert.equal(rt.screen.name, 'Settings');
  clickBy(rt, 'HomeButton');                          // the shared event, on Settings
  assert.equal(rt.screen.name, 'Home');
  assert.deepEqual(rt.errors, []);
});

test('shared events run first, as their own chain: an Else on a screen never follows a shared event', () => {
  const { p, home } = app();
  p.variables.push({ name: 'log', value: '' });
  const say = (t) => ({ type: 'setVar', var: 'log', value: `log & "${t}"` });
  p.allScreens.events.push(newEvent({ conds: [{ type: 'onStart' }], actions: [say('a')] }));
  home.events.push(newEvent({ conds: [{ type: 'onStart' }], actions: [say('b')] }));
  // every tick: a shared event that doesn't pass, then an Else at the top of Home's sheet
  p.allScreens.events.push(newEvent({ conds: [{ type: 'compareVar', var: 'n', op: '=', value: '99' }], actions: [add(1)] }));
  home.events.unshift(newEvent({ else: true, actions: [add(100)] }));
  const rt = new Runtime(p);
  rt.start(home.id);
  assert.equal(rt.getVar('log'), 'ab');
  rt.tick();
  assert.equal(rt.getVar('n'), 0);
});

test('a screen change from a shared event: that screen’s own events don’t also run for it', () => {
  const { p, settings } = app();
  settings.events.push(newEvent({ conds: [click('HomeButton')], actions: [add(5)] }));
  const rt = new Runtime(p);
  rt.start(settings.id);
  clickBy(rt, 'HomeButton');
  assert.equal(rt.screen.name, 'Home');
  assert.equal(rt.getVar('n'), 0);
});

test('shared timers and every-tick events run too', () => {
  const { p, home } = app();
  p.allScreens.events.push(newEvent({ conds: [{ type: 'onEvery', seconds: '1' }], actions: [add(1)] }));
  p.allScreens.events.push(newEvent({ conds: [], actions: [add(10)] }));
  const rt = new Runtime(p);
  rt.start(home.id);
  assert.equal(rt.needsTick, true);
  rt.advance(1000);
  assert.equal(rt.getVar('n'), 1);
  rt.tick();
  assert.equal(rt.getVar('n'), 11);
});

test('allObjectsScreen: one object per name, object variables merged', () => {
  const { p, home, settings } = app();
  home.objects[0].instanceVars.push({ name: 'a', value: 1 });
  settings.objects[0].instanceVars.push({ name: 'b', value: 2 }, { name: 'a', value: 9 });
  const all = allObjectsScreen(p);
  assert.deepEqual(all.objects.map((o) => o.name), ['HomeButton', 'GoSettings', 'Title']);
  assert.deepEqual(all.objects[0].instanceVars.map((v) => v.name), ['a', 'b']);
  assert.equal(home.objects[0].instanceVars.length, 1); // the screens are untouched
});

test('renames reach the All screens sheet', () => {
  const { p, home, settings } = app();
  p.allScreens.events.push(newEvent({ conds: [{ type: 'onStart' }], actions: [{ type: 'setText', target: 'Title', value: 'n & Title.text' }] }));
  renameVariable(p, 'n', 'count');
  assert.equal(p.allScreens.events[1].actions[0].value, 'count & Title.text');

  // HomeButton is on two screens: renaming one leaves the shared events alone
  renameObject(home, 'HomeButton', 'HomeBtn', p);
  assert.equal(p.allScreens.events[0].conds[0].target, 'HomeButton');
  renameObject(settings, 'HomeButton', 'HomeBtn', p);   // now none has the old name
  assert.equal(p.allScreens.events[0].conds[0].target, 'HomeBtn');
  renameObject(settings, 'Title', 'Heading');          // no project given: only that screen
  assert.equal(p.allScreens.events[1].actions[0].target, 'Title');

  settings.objects[0].instanceVars.push({ name: 'taps', value: 0 });
  p.allScreens.events.push(newEvent({ actions: [{ type: 'setText', target: 'HomeBtn', value: 'HomeBtn.taps' }] }));
  renameInstVar(settings, 'HomeBtn', 'taps', 'presses', p);
  assert.equal(p.allScreens.events[2].actions[0].value, 'HomeBtn.presses');
});

test('renameField reaches the All screens sheet', () => {
  const { p } = app();
  p.variables.push({ name: 'Songs', table: { fields: [{ name: 'title', type: 'text' }] }, value: [] });
  p.allScreens.events.push(newEvent({ actions: [{ type: 'setVar', var: 'n', value: 'LoopItem.title' }] }));
  renameField(p, 'Songs', 'title', 'name');
  assert.equal(p.allScreens.events[1].actions[0].value, 'LoopItem.name');
});

test('sheet text: an all screens line and its events come before the first screen', () => {
  const { p } = app();
  const lines = sheetText(p).split('\n');
  const i = lines.indexOf('all screens');
  assert.ok(i >= 0 && i < lines.indexOf('screen Home'));
  assert.equal(lines[i + 1], 'event: when HomeButton is clicked | do: Go to screen Home');
  p.allScreens.events = [];
  assert.ok(!sheetText(p).includes('all screens'));
});

test('map: a shared Go to screen is an arrow from each screen it runs on', () => {
  const { p, home, settings, help } = app();
  const m = screenMap(p);
  const from = (s) => m.links.filter((l) => l.from === s.id && l.to === home.id);
  assert.deepEqual(from(settings).map((l) => l.labels), [['HomeButton is clicked (all screens)']]);
  assert.deepEqual(from(help), []);      // no HomeButton there
  assert.deepEqual(from(home), []);      // going to the screen you are on isn't drawn
});

test('features: All screens from Level 3', () => {
  assert.equal(resolve({ level: 2 }).allScreens, false);
  assert.equal(resolve({ level: 3 }).allScreens, true);
  assert.equal(resolve({ level: 4 }).allScreens, true);
  assert.equal(resolve({ level: 2, ui: { allScreens: true } }).allScreens, true);
});
