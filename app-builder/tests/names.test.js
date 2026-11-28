// "Did you mean …?" for names that aren't there (src/core/names.js), in the editor's checks and the running app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { closest, meant } from '../src/core/names.js';
import { check } from '../src/core/expr.js';
import { Runtime } from '../src/core/runtime.js';
import { newProject, addObject, newEvent, exprScopeFor } from '../src/core/project.js';

test('closest: other capitals, a letter or two off, a swap; nothing when far or tied', () => {
  assert.equal(closest('MinutesInputs', ['MinutesInput', 'SaveButton']), 'MinutesInput');
  assert.equal(closest('minutesinput', ['MinutesInput']), 'MinutesInput');
  assert.equal(closest('Minuts', ['Minutes', 'Glasses']), 'Minutes');
  assert.equal(closest('Mintues', ['Minutes']), 'Minutes', 'two letters swapped');
  assert.equal(closest('SaveButon', ['SaveButton', 'TotalText']), 'SaveButton');
  assert.equal(closest('Total', ['Glasses', 'Minutes']), '', 'nothing close');
  assert.equal(closest('Box3', ['Box1', 'Box2']), '', 'two equally close: no guess');
  assert.equal(closest('ab', ['xy']), '');
  assert.equal(closest('', ['a']), '');
  assert.equal(meant('Minuts', ['Minutes']), ' Did you mean Minutes?');
  assert.equal(meant('Zzz', ['Minutes']), '');
});

function app() {
  const p = newProject('Tracker'), s = p.screens[0];
  addObject(s, 'input').obj.name = 'MinutesInput';
  addObject(s, 'button').obj.name = 'SaveButton';
  addObject(s, 'text').obj.name = 'TotalText';
  p.variables.push({ name: 'Minutes', value: 0 });
  return p;
}

test('the editor\'s check suggests the closest object, variable or property', () => {
  const p = app(), sc = exprScopeFor(p, p.screens[0]);
  assert.equal(check('int(MinutesInputs.text)', sc), 'There\'s no object called "MinutesInputs" on this screen. Did you mean MinutesInput?');
  assert.equal(check('Minuts + 1', sc), 'There\'s no variable called "Minuts". Did you mean Minutes?');
  assert.equal(check('MinutesInput.txt', sc), 'MinutesInput has no property "txt". Did you mean text?');
  assert.equal(check('MinutesInput.Text', sc), 'Use MinutesInput.text (small letters), not MinutesInput.Text', 'capitals keep their own message');
  assert.match(check('TotalText + 1', sc), /TotalText is an object, not a variable: use one of its properties, like TotalText\.text/);
  assert.equal(check('Glasses', sc), 'There\'s no variable called "Glasses".', 'nothing close: no guess');
  assert.equal(check('rando(1, 6)', sc), 'There\'s no function called "rando". Did you mean random?');
  assert.equal(check('Minutes + int(MinutesInput.text)', sc), null);
});

test('the running app says the same when an event uses a misspelt name', () => {
  const p = app();
  p.screens[0].events.push(newEvent({ conds: [{ type: 'onClicked', target: 'SaveButton' }], actions: [{ type: 'addTo', var: 'Minutes', value: 'int(MinutesInputs.text)' }, { type: 'setVar', var: 'Minuts', value: '1' }] }));
  const rt = new Runtime(p);
  rt.start();
  rt.click(rt.instancesOf('SaveButton')[0].id);
  const msgs = rt.errors.map((e) => e.message);
  assert.ok(msgs.some((m) => /no object called "MinutesInputs".*Did you mean MinutesInput\?/.test(m)), msgs.join(' | '));
  assert.ok(msgs.some((m) => /no variable called "Minuts"\. Did you mean Minutes\?/.test(m)), msgs.join(' | '));
});
