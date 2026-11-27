// Colours while the app runs (1.11): Set {target} colour, Set screen background.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../src/core/runtime.js';
import { checkProject } from '../src/core/project.js';
import { colourValue } from '../src/core/colour.js';
import { sheetText } from '../src/core/sheet-text.js';
import { resolve } from '../src/edu/features.js';

const W = (name, kind, extra = {}) => ({ name, kind, instanceVars: [], instances: [{ id: name, x: 0, y: 0, w: 100, h: 30, text: '', visible: true, vars: {}, ...extra }] });
const app = (actions) => checkProject({ version: 1, name: 'Dark', device: 'web', features: { level: 2 }, variables: [{ name: 'Dark', value: false }],
  screens: [{ id: 'main', name: 'Home', objects: [W('Mode', 'button', { text: '🌙 Dark' }), W('Title', 'text'), W('Bar', 'shape')],
    events: [{ id: 'e1', else: false, conds: [{ type: 'onClicked', target: 'Mode' }], actions, children: [] }] }] });

test('colour values: names (spaces allowed), codes; anything else is a plain message', () => {
  assert.equal(colourValue('black'), 'black');
  assert.equal(colourValue('Light Blue'), 'lightblue');
  assert.equal(colourValue('#1C2333'), '#1c2333');
  assert.equal(colourValue(' #fff '), '#fff');
  assert.throws(() => colourValue('blurple'), /isn.t a colour App Builder knows/);
  assert.throws(() => colourValue('#12345'), /isn.t a colour/);
});

test('Set colour (Box, Text, Button) and Set screen background, while running', () => {
  const p = app([{ type: 'setBackground', value: '"#1c2333"' }, { type: 'setColour', target: 'Title', value: '"white"' },
    { type: 'setColour', target: 'Mode', value: '"gold"' }, { type: 'setColour', target: 'Bar', value: '"teal"' }]);
  const rt = new Runtime(p, {}); rt.start();
  assert.equal(rt.background ?? null, null, 'as designed until an event sets it');
  rt.click(rt.instancesOf('Mode')[0].id);
  assert.deepEqual(rt.errors, []);
  assert.equal(rt.background, '#1c2333');
  assert.equal(rt.instancesOf('Title')[0].props.color, 'white');
  assert.equal(rt.instancesOf('Mode')[0].props.color, 'gold');
  assert.equal(rt.instancesOf('Bar')[0].props.color, 'teal');
  assert.match(sheetText(p), /Set screen background to "#1c2333"/);
  assert.match(sheetText(p), /Set Title colour to "white"/);
});

test('a colour the app doesn’t know is an error in the event, not a crash', () => {
  const rt = new Runtime(app([{ type: 'setColour', target: 'Title', value: '"blurple"' }]), {}); rt.start();
  rt.click(rt.instancesOf('Mode')[0].id);
  assert.match(rt.errors[0].message, /isn.t a colour/);
});

test('both are offered from Level 2 (the chores lesson’s light/dark button)', () => {
  const rf = resolve({ level: 2 });
  const allowed = (t) => !rf.act || rf.act.has(t);
  assert.ok(allowed('setColour') && allowed('setBackground'));
});
