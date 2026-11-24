import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES, SAMPLE_IDS, sampleById, y7MusicTracker, y7DailyChores, y7WaterTracker, y7ValuesJournal } from '../src/samples.js';
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

test('Y7 values journal: choose a value, write, save to the list, see it on the journal screen', () => {
  const rt = new Runtime(y7ValuesJournal()); rt.start();
  rt.click('v1b');                                   // Courage
  assert.equal(rt.screenId, 'entry');
  assert.equal(text(rt, 'TextInstructions'), 'What did you do to demonstrate Courage?');
  rt.userChange('j4', 'Spoke up in class'); rt.click('j5');
  assert.equal(rt.screenId, 'journal');
  assert.deepEqual(rt.globals.get('ArrayJournal'), ['COURAGE: Spoke up in class']);
  assert.equal(text(rt, 'TextSubtitle'), 'Entries so far: 1');
  assert.deepEqual(rt.errors, []);
});

test('web page is the default; older projects stay phone-sized; samples fit the web page', async () => {
  const { newProject, checkProject, sizeOf, addObject } = await import('../src/core/project.js');
  assert.equal(sizeOf(newProject()).w, 800);
  assert.equal(checkProject({ screens: [{ id: 's', objects: [], events: [] }] }).device, 'phone');
  for (const [name, make] of Object.entries(SAMPLES)) {
    const p = make();
    assert.equal(p.device, 'web', name);
    for (const s of p.screens) for (const o of s.objects) for (const i of o.instances) {
      assert.ok(i.x >= 0 && i.y >= 0 && i.x + i.w <= 800 && i.y + i.h <= 600, `${name}: ${o.name} is off the page`);
    }
  }
  const p = newProject();
  const { inst } = addObject(p.screens[0], 'button', sizeOf(p));
  assert.ok(inst.x > 250, 'new objects are centred on the web page');
});

test('lesson links: every id opens a project; starters keep the design but no events or variables', () => {
  for (const id of SAMPLE_IDS) assert.ok(sampleById(id), id);
  assert.equal(sampleById('nope'), null);
  const full = sampleById('water'), start = sampleById('water-start');
  assert.equal(start.screens[0].objects.length, full.screens[0].objects.length);
  assert.deepEqual(start.screens[0].events, []);
  assert.deepEqual(start.variables, []);
  assert.equal(start.device, 'web');
  assert.ok(full.screens[0].events.length > 0, 'starter did not change the full sample');
});
