// Left panel: one project tree (screens > objects > copies) plus whole-app variables.
import { h } from '../ui/dom.js';
import { OBJECT_KINDS } from '../core/catalog.js';
import { addObject, newScreen, isIdentifier, parseValue } from '../core/project.js';
import { S, screen, hooks } from '../state.js';

function addRow(placeholder, onAdd, withValue) {
  const name = h('input', { class: 'ctl', placeholder, 'aria-label': placeholder });
  const val = withValue ? h('input', { class: 'ctl small', placeholder: 'start', value: '0', 'aria-label': 'Starting value' }) : null;
  const go = () => { if (name.value.trim() && onAdd(name.value.trim(), val ? parseValue(val.value) : null) !== false) name.value = ''; };
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('div', { class: 'add-row' }, name, val, h('button', { class: 'btn', onclick: go, title: 'Add' }, '+'));
}

function objectRow(o) {
  const many = o.instances.length > 1;
  const first = o.instances[0];
  const on = o.instances.some((i) => i.id === S.selId);
  return h('div', { class: 'tree-row obj' + (on ? ' on' : '') },
    h('button', { class: 'obj-btn', title: `Select ${o.name}`, 'aria-current': on ? 'true' : null,
      onclick: () => hooks.select(on && many ? S.selId : first.id) },
      h('span', { class: 'obj-name' }, o.name),
      h('span', { class: 'kind' }, OBJECT_KINDS[o.kind]?.label ?? o.kind)),
    many ? h('div', { class: 'chips' }, o.instances.map((i, n) => h('button', {
      class: 'chip' + (i.id === S.selId ? ' on' : ''),
      title: `Select ${o.name} copy ${n + 1}`,
      onclick: () => hooks.select(i.id),
    }, String(n + 1)))) : null);
}

// screens whose object list the user has folded away (the screen stays selected)
const collapsed = new Set();

export function renderSide(el) {
  const sc = screen();

  const tree = S.project.screens.map((s) => {
    if (s.id !== sc.id) {
      return h('div', { class: 'tree-node' },
        h('div', { class: 'tree-row screen' },
          h('button', { class: 'link', onclick: () => { S.screenId = s.id; S.selId = null; collapsed.delete(s.id); hooks.refresh(); } }, '▸ ' + s.name)));
    }
    const folded = collapsed.has(s.id);
    return h('div', { class: 'tree-node open' },
      h('div', { class: 'tree-row screen on' },
        h('button', { class: 'caret', type: 'button', 'aria-expanded': String(!folded), title: folded ? 'Show objects' : 'Hide objects',
          onclick: () => { if (folded) collapsed.delete(s.id); else collapsed.add(s.id); hooks.refresh(); } }, folded ? '▸' : '▾'),
        h('input', { class: 'ctl', value: s.name, 'aria-label': 'Screen name', oninput: (e) => { s.name = e.target.value; }, onchange: () => hooks.commit() }),
        S.project.screens.length > 1 ? h('button', { class: 'icon danger', title: 'Delete this screen', onclick: () => {
          S.project.screens = S.project.screens.filter((x) => x !== s);
          S.screenId = S.project.screens[0].id; S.selId = null; hooks.commit();
        } }, '×') : null),
      folded ? null : h('div', { class: 'tree-children' },
        ...(s.objects.length ? s.objects.map(objectRow) : [h('p', { class: 'muted' }, 'Nothing on this screen yet.')]),
        h('div', { class: 'add-kinds' }, Object.entries(OBJECT_KINDS).filter(([k]) => !S.rf || S.rf.kinds.includes(k)).map(([k, d]) =>
          h('button', { class: 'btn', onclick: () => { const { inst } = addObject(s, k); S.selId = inst.id; hooks.commit(); } }, '+ ' + d.label)))));
  });

  const vars = S.project.variables.map((v, i) => h('div', { class: 'var' },
    h('span', { class: 'vname' }, v.name),
    h('input', { class: 'ctl small', value: String(v.value), 'aria-label': `Starting value of ${v.name}`, onchange: (e) => { v.value = parseValue(e.target.value); hooks.commit(); } }),
    h('button', { class: 'icon danger', title: 'Delete variable', onclick: () => { S.project.variables.splice(i, 1); hooks.commit(); } }, '×')));

  el.replaceChildren(
    h('h3', {}, 'Project'),
    h('div', { class: 'tree' }, ...tree),
    addRow('New screen', (name) => { const s = newScreen(name); S.project.screens.push(s); S.screenId = s.id; S.selId = null; hooks.commit(); }),
    h('h3', {}, 'Variables (whole app)'),
    ...(vars.length ? vars : [h('p', { class: 'muted' }, 'None yet.')]),
    addRow('New variable', (name, value) => {
      if (!isIdentifier(name)) { hooks.notify('Variable names use letters, numbers and _ only, and can’t start with a number.'); return false; }
      if (S.project.variables.some((v) => v.name === name)) { hooks.notify('There is already a variable called ' + name); return false; }
      S.project.variables.push({ name, value }); hooks.commit();
    }, true),
    h('p', { class: 'muted legal' }, 'Free for education. Commercial use by permission only.'),
  );
}
