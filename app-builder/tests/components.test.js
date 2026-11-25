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
