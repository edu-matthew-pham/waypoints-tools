import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES, y7MusicTracker, y7DailyChores, y7WaterTracker } from '../src/samples.js';
import { Runtime } from '../src/core/runtime.js';
import { validateSheet, CONDITIONS, ACTIONS } from '../src/core/catalog.js';
import { exprScopeFor } from '../src/core/project.js';
import { check } from '../src/core/expr.js';
import { resolve, canUse } from '../src/core/features.js';

test('every sample: no warnings, every value valid, everything allowed at its level', () => {
  for (const [name, make] of Object.entries(SAMPLES)) {
    const p = make();
    const rf = resolve(p.features);
    for (const s of p.screens) {
      assert.deepEqual(validateSheet(s.events), [], name);
      const sc = exprScopeFor(p, s);
      (function walk(evs) {
        for (const ev of evs) {
          for (const c of ev.conds) assert.ok(canUse(rf, 'cond', c.type), `${name}: ${c.type} not in its level`);
          for (const a of ev.actions) assert.ok(canUse(rf, 'act', a.type), `${name}: ${a.type} not in its level`);
          for (const it of [...ev.conds, ...ev.actions]) {
            const entry = CONDITIONS[it.type] || ACTIONS[it.type];
            for (const prm of entry.params) if (prm.type === 'expr') assert.equal(check(it[prm.name], sc), null, `${name}: ${it[prm.name]}`);
          }
          walk(ev.children);
        }
      })(s.events);
      for (const o of s.objects) assert.ok(rf.kinds.includes(o.kind), `${name}: ${o.kind} not in its level`);
    }
  }
});

const text = (rt, n) => rt.instancesOf(n)[0].props.text;

test('Y7 music tracker: adds typed hours, shows Great work at 10', () => {
  const rt = new Runtime(y7MusicTracker()); rt.start();
  rt.userChange('m2', '4'); rt.click('m3'); rt.tick();
  assert.equal(text(rt, 'TextDisplayHours'), 'You have practiced for 4 hours');
  assert.equal(rt.instancesOf('GreatWork')[0].props.visible, false);
  rt.userChange('m2', '6'); rt.click('m3'); rt.tick();
  assert.equal(rt.instancesOf('GreatWork')[0].props.visible, true);
  assert.deepEqual(rt.errors, []);
});

test('Y7 daily chores: each checkbox toggles on its own', () => {
  const rt = new Runtime(y7DailyChores()); rt.start();
  rt.click('d0b');
  assert.equal(text(rt, 'Checkbox_Bed'), '✅');
  assert.equal(text(rt, 'Checkbox_Dog'), '⬜');
  rt.click('d0b');
  assert.equal(text(rt, 'Checkbox_Bed'), '⬜');
});

test('Y7 water tracker: caps at the goal, bar grows, message changes, reset works', () => {
  const rt = new Runtime(y7WaterTracker()); rt.start(); rt.tick();
  assert.equal(text(rt, 'MotivationalMessage'), 'Keep drinking water to reach your goal');
  for (let i = 0; i < 12; i++) { rt.click('w2'); rt.tick(); }
  assert.equal(rt.getVar('waterCount'), 10);
  assert.equal(rt.instancesOf('ProgressBar')[0].props.w, 300);
  assert.match(text(rt, 'MotivationalMessage'), /goal achieved/);
  rt.click('w6'); rt.tick();
  assert.equal(rt.getVar('waterCount'), 0);
  assert.equal(rt.instancesOf('ProgressBar')[0].props.w, 0);
  assert.deepEqual(rt.errors, []);
});

test('Construct habits: uppercase() works, Name.Text gets a friendly hint', () => {
  const p = y7MusicTracker();
  const sc = exprScopeFor(p, p.screens[0]);
  assert.equal(check('uppercase(TextInput.text)', sc), null);
  assert.match(check('int(TextInput.Text)', sc), /Use TextInput.text \(small letters\)/);
});
