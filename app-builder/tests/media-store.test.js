// Media references (core/media.js): the part of the media store that needs no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isRef, newRef, collectRefs, refsInText, setMediaUrl, clearMediaUrls, mediaSrc, uploadsToMove, uploadSize, dataUrlToBytes, bytesToDataUrl } from '../src/core/media.js';
import { imageData, soundInfo } from '../src/core/assets.js';
import { newProject, checkProject } from '../src/core/project.js';

test('a reference is "media:" and 8 hex digits, and a new one never repeats a taken one', () => {
  assert.ok(isRef('media:7f3a09c2'));
  for (const v of ['media:7f3a', 'media:7F3A09C2', 'star', 'data:image/png;base64,AA', 42, null]) assert.ok(!isRef(v), String(v));
  const taken = new Set();
  for (let i = 0; i < 200; i++) { const r = newRef((x) => taken.has(x)); assert.ok(isRef(r)); assert.ok(!taken.has(r)); taken.add(r); }
});

test('references are found anywhere in a project, its rows and remembered values, and in stored JSON text', () => {
  const p = { assets: [{ name: 'cat', data: 'media:00000001' }], variables: [{ name: 'Log', table: { fields: [] }, value: [{ pic: 'media:00000002', note: 'media: not one' }] }] };
  assert.deepEqual([...collectRefs([p, ['media:00000003']])].sort(), ['media:00000001', 'media:00000002', 'media:00000003']);
  assert.deepEqual([...refsInText(JSON.stringify(p))].sort(), ['media:00000001', 'media:00000002']);
  assert.equal(refsInText(null).size, 0);
});

test('pictures and sounds by name or by reference show the loaded file; old data: uploads still work', () => {
  clearMediaUrls();
  const p = checkProject(newProject('x'));
  p.assets.push({ name: 'cat', data: 'media:0000000a', size: 1234 }, { name: 'old', data: 'data:image/png;base64,AAAA' });
  p.sounds.push({ name: 'band', data: 'media:0000000b' });
  assert.equal(imageData(p, 'cat'), ''); // not loaded yet: nothing to show, no error
  setMediaUrl('media:0000000a', 'blob:cat'); setMediaUrl('media:0000000b', 'blob:band'); setMediaUrl('media:0000000c', 'blob:drawn');
  assert.equal(imageData(p, 'cat'), 'blob:cat');
  assert.equal(imageData(p, 'media:0000000c'), 'blob:drawn'); // e.g. Set image to ClickedItem.picture (later)
  assert.equal(imageData(p, 'old'), 'data:image/png;base64,AAAA');
  assert.ok(imageData(p, 'star').startsWith('data:image/svg'));
  assert.equal(soundInfo(p, 'band').src, 'blob:band');
  assert.equal(mediaSrc('plain text'), 'plain text');
  assert.deepEqual(uploadsToMove(p).map((a) => a.name), ['old']);
  assert.equal(uploadSize(p.assets[0]), 1234);
  assert.equal(uploadSize(p.assets[1]), 3);
  clearMediaUrls();
});

test('data: URLs turn into bytes and back, base64 or not', () => {
  const bytes = Uint8Array.from({ length: 70000 }, (_, i) => (i * 7) % 256);
  const url = bytesToDataUrl(bytes, 'audio/mpeg');
  const back = dataUrlToBytes(url);
  assert.equal(back.type, 'audio/mpeg');
  assert.deepEqual(back.bytes, bytes);
  const svg = dataUrlToBytes('data:image/svg+xml,%3Csvg%2F%3E');
  assert.equal(svg.type, 'image/svg+xml');
  assert.equal(new TextDecoder().decode(svg.bytes), '<svg/>');
  assert.throws(() => dataUrlToBytes('https://example.com/a.png'));
});
