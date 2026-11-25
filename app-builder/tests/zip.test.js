// The small zip writer/reader behind Save and Open (core/zip.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { makeZip, readZip, isZip, crc32 } from '../src/core/zip.js';

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('files go in and come out the same, names in UTF-8', async () => {
  const files = [
    { name: 'project.json', bytes: new TextEncoder().encode(JSON.stringify({ name: 'Café app' })) },
    { name: 'media/0a0b0c0d.png', bytes: Uint8Array.from({ length: 5000 }, (_, i) => i % 251) },
    { name: 'media/élan.webm', bytes: new Uint8Array(0) },
  ];
  const z = makeZip(files);
  assert.ok(isZip(z) && !isZip(new TextEncoder().encode('{}')));
  const back = await readZip(z);
  assert.deepEqual([...back.keys()], files.map((f) => f.name));
  for (const f of files) assert.deepEqual(back.get(f.name), f.bytes);
});

// a zip as Windows or macOS would make it, compressed ("deflated"): built by hand here
function deflatedZip(name, data) {
  const comp = deflateRawSync(data), n = new TextEncoder().encode(name), crc = crc32(data);
  const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8);
  loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(data.length, 22); loc.writeUInt16LE(n.length, 26);
  const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(n.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + n.length, 12); end.writeUInt32LE(30 + n.length + comp.length, 16);
  return new Uint8Array(Buffer.concat([loc, n, comp, cen, n, end]));
}

test('a compressed zip (re-zipped on a computer) opens too', async () => {
  const data = new TextEncoder().encode(JSON.stringify({ rows: Array(200).fill('same text again') }));
  const back = await readZip(deflatedZip('project.json', data));
  assert.deepEqual(back.get('project.json'), data);
});

test('damage and non-zips are reported plainly', async () => {
  const z = makeZip([{ name: 'a.txt', bytes: new TextEncoder().encode('hello') }]);
  z[30 + 5] ^= 0xff; // flip a byte of the file
  await assert.rejects(readZip(z), /damaged/);
  await assert.rejects(readZip(new TextEncoder().encode('not a zip at all, just some text here')), /isn’t a zip/);
});
