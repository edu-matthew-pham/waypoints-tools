// Recorder (ROADMAP §10 step 3): recordings kept as references; trim is a play range on the reference.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../src/core/runtime.js';
import { newProject, addObject, newEvent, checkProject, FIELD_TYPES } from '../src/core/project.js';
import { isRef, refFile, refRange, withRange, collectRefs, refsInText, setMediaUrl, clearMediaUrls, mediaSrc, isPictureValue, isSoundValue } from '../src/core/media.js';
import { soundInfo } from '../src/core/assets.js';
import { resolve, canUse } from '../src/edu/features.js';

test('a reference can carry a play range; the file is the part before #', () => {
  const r = 'media:0a0b0c0d#t=1.2,4.5';
  assert.ok(isRef(r) && isRef('media:0a0b0c0d'));
  assert.ok(!isRef('media:0a0b0c0d#t=x,4') && !isRef('media:0a0b0c0d#t=1'));
  assert.equal(refFile(r), 'media:0a0b0c0d');
  assert.deepEqual(refRange(r), [1.2, 4.5]);
  assert.equal(refRange('media:0a0b0c0d'), null);
  assert.equal(withRange(r, 0, 6, 6), 'media:0a0b0c0d', 'the whole recording: no range');
  assert.equal(withRange('media:0a0b0c0d', 0.53, 3.04, 6), 'media:0a0b0c0d#t=0.5,3');
  assert.deepEqual([...collectRefs({ a: r, b: ['media:0a0b0c0d'] })], ['media:0a0b0c0d'], 'tidy and loading see one file');
  assert.deepEqual([...refsInText(JSON.stringify({ a: r }))], ['media:0a0b0c0d']);
});

test('a trimmed recording plays from its object URL with the range; recordings are not pictures', () => {
  clearMediaUrls();
  setMediaUrl('media:0a0b0c0d', 'blob:rec', 'audio/webm');
  setMediaUrl('media:11111111', 'blob:pic', 'image/png');
  assert.equal(mediaSrc('media:0a0b0c0d#t=1,2'), 'blob:rec#t=1,2');
  assert.equal(soundInfo(checkProject(newProject('x')), 'media:0a0b0c0d#t=1,2').src, 'blob:rec#t=1,2');
  assert.ok(isSoundValue('media:0a0b0c0d') && !isPictureValue('media:0a0b0c0d'));
  assert.ok(isPictureValue('media:11111111') && !isSoundValue('media:11111111'));
  clearMediaUrls();
});

function app() {
  const p = checkProject(newProject('Voices'));
  const s = p.screens[0];
  for (const [kind, name] of [['recorder', 'Mic'], ['sound', 'Player'], ['text', 'Msg']]) addObject(s, kind).obj.name = name;
  p.variables.push({ name: 'Clips', table: { fields: [{ name: 'sound', type: 'sound' }] }, value: [] });
  s.events.push(newEvent({ conds: [{ type: 'onRecorded', target: 'Mic' }], actions: [
    { type: 'setText', target: 'Msg', value: 'Mic.length & " s"' },
    { type: 'tableAdd', table: 'Clips', values: { sound: 'Mic.sound' } },
    { type: 'setSoundNamed', target: 'Player', name: 'Mic.sound' }] }));
  return p;
}
const one = (rt, n) => rt.instancesOf(n)[0];

test('finishing a recording runs the event; trim changes Recorder.sound but not rows kept before', () => {
  const rt = new Runtime(app());
  rt.start();
  const mic = one(rt, 'Mic');
  rt.userChange(mic.id, { recording: true });
  assert.equal(mic.props.recording, true);
  assert.equal(rt.globals.get('Clips').length, 0, 'starting to record is not finishing');
  rt.userChange(mic.id, { ref: 'media:0a0b0c0d', length: 6.04 });
  assert.equal(one(rt, 'Msg').props.text, '6 s');
  assert.equal(rt.globals.get('Clips')[0].sound, 'media:0a0b0c0d');
  assert.equal(one(rt, 'Player').props.sound, 'media:0a0b0c0d', 'Set sound to the one named takes a recording');
  rt.userChange(mic.id, { trim: [1, 3.5] });
  const ctx = { picked: new Map(), loop: [] };
  assert.equal(rt.evalExpr('Mic.sound', ctx), 'media:0a0b0c0d#t=1,3.5');
  rt.userChange(mic.id, { trim: [5, 99] });
  assert.equal(rt.evalExpr('Mic.sound', ctx), 'media:0a0b0c0d#t=5,6', 'trim stays inside the recording');
  assert.equal(rt.globals.get('Clips')[0].sound, 'media:0a0b0c0d');
});

test('before any recording, Recorder.sound is empty and Set sound to the one named says so', () => {
  const rt = new Runtime(app());
  rt.start();
  assert.equal(rt.evalExpr('Mic.sound', { picked: new Map(), loop: [] }), '');
  assert.equal(rt.hasSound(''), false);
});

test('sound is a field type, the Recorder is offered from level 3', () => {
  assert.ok(FIELD_TYPES.some(([t]) => t === 'sound'));
  assert.ok(resolve({ level: 3 }).kinds.includes('recorder') && !resolve({ level: 2 }).kinds.includes('recorder'));
  assert.ok(canUse(resolve({ level: 3 }), 'cond', 'onRecorded'));
});
