import test from 'node:test';
import assert from 'node:assert/strict';
import { renameVariable, renameObject, renameInstVar, nameProblem } from '../src/core/rename.js';
import { musicTracker, dailyChores } from '../src/samples.js';
import { Runtime } from '../src/core/runtime.js';
import { validateSheet } from '../src/core/catalog.js';
import { exprScopeFor } from '../src/core/project.js';
import { check } from '../src/core/expr.js';

const allExprsOk = (p) => p.screens.every((s) => {
  const sc = exprScopeFor(p, s);
  const bad = [];
  (function walk(evs) { for (const ev of evs) { for (const it of [...ev.conds, ...ev.actions]) for (const [k, v] of Object.entries(it)) if (['value', 'left', 'right', 'seconds'].includes(k) && check(v, sc)) bad.push(v); walk(ev.children); } })(s.events);
  assert.deepEqual(bad, []);
  return true;
});

test('rename a variable: dropdowns and expressions on every screen follow; text in quotes is untouched', () => {
  const p = musicTracker();
  p.screens[0].events[0].actions[0].value = '"minutes: " & minutes';
  renameVariable(p, 'minutes', 'practised');
  assert.equal(p.screens[0].events[0].actions[0].value, '"minutes: " & practised');
  assert.equal(p.screens[0].events[1].actions[0].var, 'practised');
  assert.match(p.screens[1].events[0].actions[0].value, /& practised &/);
  allExprsOk(p);
  const rt = new Runtime(p); rt.start(); rt.click('i_add');
  assert.equal(rt.getVar('practised'), 10);
  assert.deepEqual(rt.errors, []);
});

test('rename an object: triggers, targets and Object.property follow', () => {
  const p = musicTracker();
  const s = p.screens[0];
  renameObject(s, 'Total', 'TotalLabel');
  renameObject(s, 'AddBtn', 'PlusTen');
  assert.equal(s.events[1].conds[0].target, 'PlusTen');
  assert.equal(s.events[1].actions[1].target, 'TotalLabel');
  allExprsOk(p);
  assert.deepEqual(validateSheet(s.events), []);
  const rt = new Runtime(p); rt.start(); rt.click('i_add');
  assert.equal(rt.instancesOf('TotalLabel')[0].props.text, 'Total: 10 min');
});

test('rename an object’s own variable: copies keep their values; picking and expressions follow', () => {
  const p = dailyChores();
  const s = p.screens[0];
  const obj = s.objects.find((o) => o.instanceVars.length);
  const old = obj.instanceVars[0].name;
  const before = obj.instances.map((i) => (old in (i.vars || {}) ? i.vars[old] : undefined));
  renameInstVar(s, obj.name, old, 'finished');
  assert.deepEqual(obj.instances.map((i) => (i.vars && 'finished' in i.vars ? i.vars.finished : undefined)), before);
  assert.ok(!JSON.stringify(s.events).includes(`"${old}"`) || old === 'label');
  allExprsOk(p);
  const rt = new Runtime(p); rt.start();
  rt.click(obj.instances[0].id);
  assert.deepEqual(rt.errors, []);
});

test('name problems', () => {
  assert.match(nameProblem('', []), /Type a name/);
  assert.match(nameProblem('9lives', []), /letters, numbers/);
  assert.match(nameProblem('round', []), /built-in/);
  assert.match(nameProblem('goal', ['goal']), /already/);
  assert.equal(nameProblem('score', ['goal']), '');
});
