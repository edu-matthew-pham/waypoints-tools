import test from 'node:test';
import assert from 'node:assert/strict';
import { screenMap, mapProblems } from '../src/core/map.js';
import { SAMPLES } from '../src/samples.js';
import { newProject, newScreen, newEvent } from '../src/core/project.js';

const go = (to, conds = [], extra = {}) => newEvent({ conds, actions: [{ type: 'goToScreen', screen: to }], ...extra });
const click = (target) => ({ type: 'onClicked', target });

function threeScreens() {
  const p = newProject();
  const [home] = p.screens; home.name = 'Home';
  const add = newScreen('Add'), saved = newScreen('Saved'), spare = newScreen('Spare');
  p.screens.push(add, saved, spare);
  home.events.push(go(add.id, [click('AddButton')]));
  add.events.push(go(saved.id, [click('SaveButton')]), go(home.id, [click('BackButton')]));
  return { p, home, add, saved, spare };
}

test('links come from Go to screen actions, labelled with their conditions', () => {
  const { p, home, add, saved } = threeScreens();
  const m = screenMap(p);
  assert.deepEqual(m.links, [
    { from: home.id, to: add.id, labels: ['AddButton is clicked'] },
    { from: add.id, to: saved.id, labels: ['SaveButton is clicked'] },
    { from: add.id, to: home.id, labels: ['BackButton is clicked'] },
  ]);
  const byName = Object.fromEntries(m.screens.map((s) => [s.name, s]));
  assert.equal(byName.Home.first, true);
  assert.deepEqual([byName.Home.depth, byName.Add.depth, byName.Saved.depth], [0, 1, 2]);
  assert.equal(byName.Saved.deadEnd, true);
  assert.equal(byName.Spare.reachable, false);
  assert.equal(byName.Spare.depth, null);
  // something that only goes out is still unreachable
  p.screens[3].events.push(go(p.screens[0].id));
  assert.equal(mapProblems(screenMap(p)).at(-1), 'Nothing goes to Spare, so the app can never show it.');
  p.screens[3].events = [];
  assert.deepEqual(mapProblems(m), [
    'Saved has no way out to another screen.',
    'Spare isn’t linked to any other screen yet.',
  ]);
});

test('sub-events carry their parents’ conditions; several events make one link', () => {
  const { p, home, saved } = threeScreens();
  const parent = newEvent({ conds: [click('DoneButton')], children: [go(home.id, [{ type: 'compareVar', variable: 'x', op: '=', value: '1' }]), go(home.id, [], { else: true })] });
  saved.events.push(parent);
  const link = screenMap(p).links.find((l) => l.from === saved.id);
  assert.equal(link.labels.length, 2);
  assert.match(link.labels[0], /^DoneButton is clicked, /);
  assert.equal(link.labels[1], 'DoneButton is clicked, otherwise');
});

test('a link to a deleted screen is reported, and going to the same screen is not an arrow', () => {
  const { p, spare } = threeScreens();
  spare.events.push(go('gone'), go(spare.id));
  const s = screenMap(p).screens.find((x) => x.id === spare.id);
  assert.deepEqual(s.broken, ['all the time']);
  assert.equal(s.deadEnd, true);
  assert.ok(!screenMap(p).links.some((l) => l.from === spare.id));
});

test('one screen: no flags; every sample maps without throwing', () => {
  const m = screenMap(newProject());
  assert.deepEqual(mapProblems(m), []);
  for (const make of Object.values(SAMPLES)) screenMap(make());
  const two = screenMap(SAMPLES['Minutes and goal (two screens)']());
  assert.equal(two.screens.length, 2);
  assert.ok(two.links.length >= 1);
});
