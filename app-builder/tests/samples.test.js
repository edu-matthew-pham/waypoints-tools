import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES, SAMPLE_IDS, sampleById, practiceTracker, choresChecklist, waterTracker, valuesJournal, creatureStats } from '../src/samples.js';
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

test('practice tracker: adds what was typed and shows the total', () => {
  const rt = new Runtime(practiceTracker()); rt.start();
  rt.userChange('t2', '15'); rt.click('t3'); rt.click('t3');
  assert.equal(text(rt, 'TotalText'), "You've practised 30 minutes");
  assert.deepEqual(rt.errors, []);
});

test('chores checklist: each box ticks and unticks on its own', () => {
  const rt = new Runtime(choresChecklist()); rt.start();
  rt.click('c0b');
  assert.equal(text(rt, 'BedBox'), '✅');
  assert.equal(text(rt, 'FeedBox'), '⬜');
  rt.click('c0b');
  assert.equal(text(rt, 'BedBox'), '⬜');
});

test('water tracker: stops at the goal, Every tick keeps the text right, Reset works', () => {
  const rt = new Runtime(waterTracker()); rt.start(); rt.tick();
  for (let i = 0; i < 12; i++) { rt.click('w2'); rt.tick(); }
  assert.equal(rt.getVar('Glasses'), 8);
  assert.equal(text(rt, 'GlassText'), 'Glasses: 8 of 8');
  rt.click('w3'); rt.tick();
  assert.equal(text(rt, 'GlassText'), 'Glasses: 0 of 8');
  assert.deepEqual(rt.errors, []);
});

test('Construct habits: uppercase() works, Name.Text gets a friendly hint', () => {
  const p = practiceTracker();
  const sc = exprScopeFor(p, p.screens[0]);
  assert.equal(check('uppercase(TextInput.text)', sc), null);
  assert.match(check('int(TextInput.Text)', sc), /Use TextInput.text \(small letters\)/);
});

test('values journal: choose a value, describe it, see it in the list', () => {
  const rt = new Runtime(valuesJournal()); rt.start();
  rt.click('v1b');                                   // Courage
  assert.equal(rt.screenId, 'describe');
  assert.equal(text(rt, 'Question'), 'What did you do to show Courage?');
  rt.userChange('j4', 'Spoke up in class'); rt.click('j5');
  assert.equal(rt.screenId, 'journal');
  assert.deepEqual(rt.globals.get('Journal'), ['COURAGE: Spoke up in class']);
  assert.equal(text(rt, 'Count'), 'Entries: 1');
  assert.deepEqual(rt.errors, []);
});

test('creature stats: clicking a copy shows that copy’s own stats', () => {
  const rt = new Runtime(creatureStats()); rt.start();
  rt.click('k1');
  assert.equal(text(rt, 'NameText'), 'Tide');
  assert.equal(text(rt, 'DefenceText'), 'Defence: 90');
  assert.equal(rt.instancesOf('DefenceBar')[0].props.w, 180);
  rt.click('k2');
  assert.equal(text(rt, 'NameText'), 'Zip');
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
