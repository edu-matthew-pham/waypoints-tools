// Continue on another device (src/carry.js): the app, what it kept and the tutorial step travel together, in a
// Continue link or a saved file, and come back the same. Older files and links without progress still open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storeKeyFor, readProgress, writeProgress, tutorialLinkPart, fitsInLink, encodeCarry, decodeCarry, validProgress, progressKeys } from '../src/carry.js';
import { encodeApp } from '../src/core/share-link.js';
import { buildSave, readProjectFile } from '../src/project-file.js';

const v1 = () => JSON.parse(readFileSync(new URL('./fixtures/v1-project.json', import.meta.url), 'utf8'));
const HERE = 'https://tools.learningwaypoints.com/app-builder/';
const fakeStore = () => { const m = new Map(); const ls = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; return { m, store: (fn) => fn(ls) }; };
const progress = { tutorial: 'code/apps/practice-tracker', link: '?lesson=code/apps/practice-tracker&level=2', step: 3, tried: ['1:0', '2:play'], title: 'A practice tracker' };

test('each App Builder address keeps its app under the same key as before', () => {
  assert.equal(storeKeyFor('', HERE), 'appbuilder.prototype.v1');
  assert.equal(storeKeyFor('?sample=water', HERE), 'appbuilder.lesson.water');
  assert.equal(storeKeyFor('?lesson=code/apps/practice-tracker', HERE), 'appbuilder.tutorial.code/apps/practice-tracker');
  assert.equal(storeKeyFor('?lesson=code/apps/x&store=abc', HERE), 'appbuilder.store.abc');
  assert.equal(storeKeyFor('?id=step-2', HERE), 'appbuilder.store.step-2');
});

test('a Continue link keeps the tutorial, level and lock, and drops the rest', () => {
  assert.equal(tutorialLinkPart('?lesson=code/apps/x&level=2&lock=1&tab=events'), '?lesson=code%2Fapps%2Fx&level=2&lock=1');
  assert.equal(storeKeyFor(tutorialLinkPart('?lesson=code/apps/x&level=2'), HERE), 'appbuilder.tutorial.code/apps/x');
  assert.equal(tutorialLinkPart(''), '');
});

test('tutorial progress is read from, and written back to, the tutorial panel’s own keys', () => {
  const a = fakeStore();
  assert.equal(readProgress(a.store, progress.tutorial, progress.link), null, 'not started: nothing to carry');
  assert.ok(writeProgress(a.store, progress));
  assert.equal(a.m.get(progressKeys(progress.tutorial).step), '3');
  const back = readProgress(a.store, progress.tutorial, progress.link);
  assert.deepEqual(back, { tutorial: progress.tutorial, link: '?lesson=code%2Fapps%2Fpractice-tracker&level=2', step: 3, tried: ['1:0', '2:play'] });
  assert.ok(!writeProgress(a.store, { tutorial: '', step: 1, tried: [] }), 'a broken one is ignored');
  assert.ok(!validProgress({ tutorial: 'x', step: -1, tried: [] }));
});

test('the app, what it kept and the step go into a Continue link and come back the same', async () => {
  const carry = { project: v1(), remembered: { scores: [3, 4] }, progress };
  const code = await encodeCarry(carry);
  assert.match(code, /^z\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeCarry(code), carry);
  const plain = await decodeCarry(await encodeCarry({ project: v1() }));
  assert.equal(plain.progress, null); assert.equal(plain.remembered, null);
});

test('a share link or a cut-short link isn’t taken for a Continue link', async () => {
  await assert.rejects(decodeCarry(await encodeApp(v1())), /isn’t a Continue link/);
  const code = await encodeCarry({ project: v1(), progress });
  await assert.rejects(decodeCarry(code.slice(0, code.length / 2)));
});

test('apps or kept data with their own pictures or recordings don’t fit in a link', () => {
  assert.ok(fitsInLink({ project: v1(), remembered: null }));
  assert.ok(!fitsInLink({ project: { ...v1(), assets: [{ name: 'cat', data: 'media:00000001' }] } }));
  assert.ok(!fitsInLink({ project: v1(), remembered: { photos: ['media:00000002'] } }));
});

test('a saved file carries the tutorial step, and older files without one still open', async () => {
  const file = await buildSave(v1(), null, progress);
  const back = await readProjectFile(new TextEncoder().encode(file.data));
  assert.deepEqual(back.progress, progress);
  assert.deepEqual(back.project, v1(), 'progress isn’t left inside the project');
  const old = await readProjectFile(new TextEncoder().encode(JSON.stringify(v1())));
  assert.equal(old.progress, null);
  const broken = await readProjectFile(new TextEncoder().encode(JSON.stringify({ ...v1(), progress: { step: 'two' } })));
  assert.equal(broken.progress, null);
});
