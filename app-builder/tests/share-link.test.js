// Share by link (core/share-link.js): the whole app inside the link, compressed; apps with their own media can't.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeApp, decodeApp, canShareByLink, linkKey } from '../src/core/share-link.js';

const v1 = () => JSON.parse(readFileSync(new URL('./fixtures/v1-project.json', import.meta.url), 'utf8'));

test('an app goes into a link and comes back the same, and the link is URL-safe and fairly short', async () => {
  const p = v1();
  const code = await encodeApp(p);
  assert.match(code, /^z\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeApp(code), p);
  assert.ok(code.length < JSON.stringify(p).length / 3, `compressed: ${code.length} vs ${JSON.stringify(p).length}`);
});

test('apps with their own pictures or sounds are shared as a file, not a link', () => {
  const p = v1();
  assert.ok(canShareByLink(p));
  assert.ok(!canShareByLink({ ...p, assets: [{ name: 'cat', data: 'media:00000001' }] }));
  assert.ok(!canShareByLink({ ...p, sounds: [{ name: 'beat', data: 'media:00000002' }] }));
});

test('a cut-short or wrong link is reported, not half-opened; each link gets its own storage key', async () => {
  const code = await encodeApp(v1());
  await assert.rejects(decodeApp(code.slice(0, code.length / 2)));
  await assert.rejects(decodeApp('hello'), /isn’t a shared app/);
  assert.equal(linkKey(code), linkKey(code));
  assert.notEqual(linkKey(code), linkKey(code + 'x'));
  assert.equal(await decodeApp('j.' + Buffer.from('{"a":1}').toString('base64url')).then((x) => x.a), 1);
});
