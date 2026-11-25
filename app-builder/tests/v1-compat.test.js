// The promise made with v1 (tagged app-builder-v1, 26 Nov 2026): projects saved in v1 keep opening in later versions.
// tests/fixtures/v1-project.json is frozen (made once by tools/make-v1-fixture.mjs): an app using every kind of thing
// v1 can save. If this fails, a change broke old projects: add an upgrade step in checkProject, don't edit the fixture.
// The sheet text is checked too, because lesson checks on the tutorials site read it; if it changes on purpose,
// check the lessons (npm run check-appbuilder in waypoints-tutorials) and then update v1-project.sheet.txt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkProject } from '../src/core/project.js';
import { sheetText } from '../src/core/sheet-text.js';
import { validateSheet } from '../src/core/catalog.js';
import { Runtime } from '../src/core/runtime.js';

const load = () => JSON.parse(readFileSync(new URL('./fixtures/v1-project.json', import.meta.url), 'utf8'));
const ctx = () => ({ picked: new Map(), loop: [] });

test('a v1 project still opens, with everything in it', () => {
  const p = checkProject(load());
  assert.deepEqual(p.screens.map((s) => s.name), ['Choose', 'Describe', 'Journal', 'Media']);
  const kinds = new Set(p.screens.flatMap((s) => s.objects.map((o) => o.kind)));
  for (const k of ['button', 'text', 'image', 'list', 'table', 'drawing', 'photo', 'recorder', 'sound', 'video']) assert.ok(kinds.has(k), k);
  const clips = p.variables.find((v) => v.name === 'Clips');
  assert.deepEqual(clips.table.fields.map((f) => f.type), ['text', 'number', 'picture', 'sound', 'link']);
  assert.equal(p.allowCamera && p.allowMic, true);
  assert.equal(p.functions[0].name, 'Bump');
  assert.equal(p.allScreens.events.length, 1);
  for (const s of p.screens) assert.deepEqual(validateSheet(s.events), [], `no problems on ${s.name}`);
});

test('a v1 project reads as the same sheet text (lesson checks depend on it)', () => {
  const want = readFileSync(new URL('./fixtures/v1-project.sheet.txt', import.meta.url), 'utf8');
  assert.equal(sheetText(checkProject(load())), want);
});

test('a v1 project runs: functions, All screens, tables, made pictures', () => {
  let n = 0;
  const rt = new Runtime(checkProject(load()), { hooks: { snapshot: () => `media:0000000${++n}` } });
  const media = rt.project.screens.find((s) => s.name === 'Media');
  rt.start(media.id);
  assert.deepEqual(rt.errors, []);
  const one = (name) => rt.instancesOf(name)[0];
  rt.userChange(one('Pad').id, 1);
  assert.equal(one('Msg').props.text, 'lines: 1');
  rt.click(one('KeepBtn').id);
  assert.equal(rt.globals.get('Clips').at(-1).picture, 'media:00000001');
  rt.click(one('HomeBtn').id); // All screens: Call Bump, then Go to screen Choose
  assert.equal(rt.evalExpr('Saved', ctx()), 1);
  assert.equal(rt.screen.name, 'Choose');
  assert.deepEqual(rt.errors, []);
});
