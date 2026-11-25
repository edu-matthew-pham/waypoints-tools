// Keeps the event-sheet core reusable apart from the editor and the education layer (levels, lessons):
// core/ imports only core/; the player (player.js) only core/ and ui/ (the stage), never state.js, views,
// panels or edu/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const importsOf = (file) => [...readFileSync(file, 'utf8').matchAll(/^\s*import\s[^'"]*['"](\.[^'"]+)['"]/gm)].map((m) => resolve(dirname(file), m[1]));
function reach(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const f of importsOf(file)) reach(f, seen);
  return seen;
}
const rel = (f) => relative(SRC, f).replace(/\\/g, '/');

test('core/ imports nothing outside core/', () => {
  for (const name of readdirSync(join(SRC, 'core'))) {
    for (const f of importsOf(join(SRC, 'core', name))) assert.ok(rel(f).startsWith('core/'), `core/${name} imports ${rel(f)}`);
  }
});

test('the player needs only core/ and the stage (ui/), not the editor or levels', () => {
  const used = [...reach(join(SRC, 'player.js'))].map(rel).filter((f) => f !== 'player.js');
  for (const f of used) assert.ok(f.startsWith('core/') || f.startsWith('ui/'), `player.js reaches ${f}`);
  assert.ok(used.includes('ui/stage.js') && used.includes('core/runtime.js'));
  assert.ok(!used.includes('ui/event-sheet.js'), 'the player should not pull in the event sheet editor');
});
