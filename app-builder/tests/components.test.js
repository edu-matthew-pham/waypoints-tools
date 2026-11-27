import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS, CATEGORIES } from '../src/core/components.js';
import { ICONS, RENDER } from '../src/ui/component-ui.js';
import { LEVELS } from '../src/edu/features.js';
import { newProject, addObject } from '../src/core/project.js';

test('every component is complete: label, hint, category, icon, drawing code, a level', () => {
  for (const [id, c] of Object.entries(COMPONENTS)) {
    assert.equal(c.id, id);
    assert.ok(c.label && c.hint && c.base && c.props, `${id} needs label, hint, base and props`);
    assert.ok(CATEGORIES.includes(c.category), `${id} has an unknown category`);
    assert.ok(ICONS[id], `${id} has no icon in ui/component-ui.js`);
    assert.ok(RENDER[id]?.make && RENDER[id]?.write, `${id} has no make/write in ui/component-ui.js`);
    assert.ok(LEVELS[4].kinds.includes(id), `${id} is not offered at level 4`);
  }
});

test('adding each component to a screen works and names stay unique', () => {
  const p = newProject();
  const s = p.screens[0];
  for (const id of Object.keys(COMPONENTS)) { addObject(s, id); addObject(s, id); }
  const names = s.objects.map((o) => o.name);
  assert.equal(new Set(names).size, names.length);
});

test('a Toggle can look like a tick box: the same on/off, and the sheet text says so', async () => {
  const { sheetText } = await import('../src/core/sheet-text.js');
  const { checkProject, newProject, addObject } = await import('../src/core/project.js');
  const { Runtime } = await import('../src/core/runtime.js');
  const p = checkProject(newProject('Jobs'));
  const t = addObject(p.screens[0], 'toggle').obj; t.name = 'BedJob'; t.instances[0].look = 'tick';
  assert.match(sheetText(p), /object BedJob \(toggle\) text "[^"]*" \(tick box\)/);
  const rt = new Runtime(p, {}); rt.start();
  const inst = rt.instancesOf('BedJob')[0];
  assert.equal(inst.props.look, 'tick');
  rt.userChange(inst.id, true);
  assert.equal(inst.props.on, true);
});
