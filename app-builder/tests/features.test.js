import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, canUse, fromParams, LEVELS } from '../src/core/features.js';
import { CONDITIONS, ACTIONS } from '../src/core/catalog.js';
import { newProject, checkProject } from '../src/core/project.js';
import { musicTracker, dailyChores } from '../src/samples.js';

test('no features set: everything is available (older projects)', () => {
  const rf = resolve(undefined);
  assert.equal(rf.cond, null);
  assert.equal(rf.sub, true);
  assert.equal(canUse(rf, 'cond', 'compareInst'), true);
  assert.equal(checkProject({ screens: [{ id: 's', objects: [], events: [] }] }).features.level, 4);
});

test('level 1 is just when/do', () => {
  const rf = resolve({ level: 1 });
  assert.equal(canUse(rf, 'cond', 'onClicked'), true);
  assert.equal(canUse(rf, 'cond', 'compareVar'), false);
  assert.equal(canUse(rf, 'act', 'setText'), true);
  assert.equal(canUse(rf, 'act', 'setInst'), false);
  assert.equal(rf.sub, false);
  assert.equal(rf.else, false);
  assert.equal(rf.instVars, false);
  assert.deepEqual(rf.kinds, ['button', 'text']);
});

test('level 2 adds conditions, sub-events, Else, inputs; level 3 adds copies', () => {
  const l2 = resolve({ level: 2 });
  assert.equal(canUse(l2, 'cond', 'compareVar'), true);
  assert.equal(canUse(l2, 'cond', 'onChanged'), true);
  assert.equal(canUse(l2, 'cond', 'compareInst'), false);
  assert.equal(l2.sub && l2.else, true);
  assert.equal(l2.instVars, false);
  assert.ok(l2.kinds.includes('input'));
  const l3 = resolve({ level: 3 });
  assert.equal(canUse(l3, 'cond', 'compareInst'), true);
  assert.equal(canUse(l3, 'act', 'addToInst'), true);
  assert.equal(l3.instVars, true);
});

test('a lesson allow-list overrides the level (like a tutorial toolbox)', () => {
  const rf = resolve({ level: 4, allow: { cond: ['onClicked'], act: ['setText'] } });
  assert.equal(canUse(rf, 'cond', 'onClicked'), true);
  assert.equal(canUse(rf, 'cond', 'compareVar'), false);
  assert.equal(canUse(rf, 'act', 'setText'), true);
  assert.equal(canUse(rf, 'act', 'addTo'), false);
  assert.equal(rf.custom, true);
  assert.equal(resolve({ level: 1, ui: { else: true } }).else, true);
});

test('URL params: level, allow (unknown ids dropped), lock', () => {
  const p = fromParams('?level=1&allow=onClicked,addTo,bogus&lock=1');
  assert.equal(p.level, 1);
  assert.deepEqual(p.allow, { cond: ['onClicked'], act: ['addTo'] });
  assert.equal(p.locked, true);
  assert.deepEqual(fromParams('?level=9'), { locked: false });
});

test('every catalog entry is assigned to a level, so new entries are not forgotten', () => {
  const l3c = new Set(LEVELS[3].cond), l3a = new Set(LEVELS[3].act);
  for (const id of Object.keys(CONDITIONS)) assert.ok(l3c.has(id), `condition ${id} is not in any level 1-3 (add it to features.js)`);
  for (const id of Object.keys(ACTIONS)) assert.ok(l3a.has(id), `action ${id} is not in any level 1-3 (add it to features.js)`);
});

test('samples and new projects carry sensible levels', () => {
  assert.equal(musicTracker().features.level, 2);
  assert.equal(dailyChores().features.level, 3);
  assert.equal(newProject().features.level, 2);
});
