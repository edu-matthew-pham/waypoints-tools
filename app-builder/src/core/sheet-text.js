// The whole project as plain text, one line per event, written the way the event sheet reads.
// Used by pages that embed App Builder (lesson checks look for phrases in it) and by people reading a
// project without opening it. Stable on purpose: change the wording only with the checks that use it.
//
//   screen Home
//   variable Minutes = 0
//   list Journal = ["a", "b"]
//   object SaveButton (button) text "Save"
//   event: when SaveButton is clicked | do: Add 15 to variable Minutes; Set TotalText text to "You've " & Minutes
//   event: when SaveButton is clicked > when TotalText text = "x" | do: ...      (a sub-event repeats its parents)
//   event: else | do: ...
import { entryFor, KEYS } from './catalog.js';
import { COMPONENTS } from './components.js';

const SHOW = { showhide: { show: 'Show', hide: 'Hide' }, onoff: { on: 'on', off: 'off' }, posSize: { w: 'width', h: 'height', x: 'x position', y: 'y position' } };
const KEY_NAMES = Object.fromEntries(KEYS);

function itemText(kind, item, screens) {
  const entry = entryFor(kind, item.type);
  if (!entry) return `(unknown ${item.type})`;
  return entry.label.replace(/\{(\w+)\}/g, (m, name) => {
    const prm = entry.params.find((p) => p.name === name);
    const v = item[name] ?? '';
    if (!prm) return m;
    if (prm.type === 'screen') return screens.find((s) => s.id === v)?.name ?? v;
    if (prm.type === 'key') return KEY_NAMES[v] ?? v;
    if (SHOW[prm.type]) return SHOW[prm.type][v] ?? v;
    return String(v);
  });
}

export function sheetText(project) {
  const out = [];
  const val = (v) => JSON.stringify(v);
  for (const v of project.variables || []) out.push(Array.isArray(v.value) ? `list ${v.name} = ${val(v.value)}` : `variable ${v.name} = ${val(v.value)}`);
  for (const s of project.screens || []) {
    out.push(`screen ${s.name}`);
    for (const o of s.objects || []) {
      const i = o.instances[0] || {};
      out.push(`object ${o.name} (${COMPONENTS[o.kind]?.label.toLowerCase() ?? o.kind}) text ${val(i.text ?? '')}${o.instances.length > 1 ? ` copies ${o.instances.length}` : ''}`);
      for (const iv of o.instanceVars || []) out.push(`object variable ${o.name}.${iv.name} = ${val(iv.value)}`);
    }
    const walk = (events, path) => {
      for (const ev of events || []) {
        const conds = (ev.conds || []).map((c) => 'when ' + itemText('cond', c, project.screens));
        const here = [...(ev.else ? ['else'] : []), ...conds].join(' and ') || 'always';
        const full = [...path, here];
        const acts = (ev.actions || []).map((a) => itemText('act', a, project.screens)).join('; ');
        out.push(`event: ${full.join(' > ')} | do: ${acts}`);
        walk(ev.children, full);
      }
    };
    walk(s.events, []);
  }
  return out.join('\n');
}
