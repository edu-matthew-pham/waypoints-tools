// Design tab: drag-and-drop stage + properties panel.
import { h } from '../ui/dom.js';
import { Stage } from '../ui/stage.js';
import { OBJECT_KINDS } from '../core/catalog.js';
import { duplicateInstance, deleteInstance, findInstance, isIdentifier, parseValue } from '../core/project.js';
import { S, screen, hooks } from '../state.js';

export function initDesign(root) {
  const stageHost = h('div', { class: 'stage-host' });
  const title = h('div', { class: 'screen-title' });
  const props = h('div', { class: 'props' });
  root.append(h('div', { class: 'stage-col' }, title, stageHost), props);

  const stage = new Stage(stageHost, {
    design: true,
    on: {
      select: (id) => hooks.select(id),
      move: (id, patch) => { Object.assign(findInstance(screen(), id).inst, patch); sync(); renderProps(true); },
      commit: () => hooks.commit(),
    },
  });

  const items = () => screen().objects.flatMap((o) => o.instances.map((i) => ({ id: i.id, kind: o.kind, props: i })));
  function sync() { stage.sync(items()); stage.setSelected(S.selId); }

  function numField(label, key, inst, min = 0) {
    const input = h('input', { class: 'ctl small', type: 'number', value: inst[key], min, 'aria-label': label, 'data-k': key,
      oninput: () => { inst[key] = Math.max(min, Math.round(Number(input.value) || 0)); sync(); },
      onchange: () => hooks.commit() });
    return h('label', { class: 'f' }, h('span', {}, label), input);
  }

  function renderProps(light) {
    const hit = S.selId && findInstance(screen(), S.selId);
    if (!hit) {
      props.replaceChildren(h('h3', {}, 'Properties'), h('p', { class: 'muted' }, 'Click something on the screen to edit it, or add an object from the left. Drag to move; drag the corner to resize.'));
      return;
    }
    if (light) { // while dragging, just refresh the numbers
      props.querySelectorAll('input[data-k]').forEach((el) => { el.value = hit.inst[el.dataset.k]; });
      return;
    }
    const { obj, inst } = hit;
    const n = obj.instances.indexOf(inst) + 1;
    const text = h('input', { class: 'ctl', value: inst.text, 'aria-label': 'Text', oninput: (e) => { inst.text = e.target.value; sync(); }, onchange: () => hooks.commit() });
    const showCopies = !S.rf || S.rf.instVars;
    const ivars = obj.instanceVars.map((v) => {
      const cur = v.name in inst.vars ? inst.vars[v.name] : v.value;
      return h('div', { class: 'var' },
        h('span', { class: 'vname' }, v.name),
        h('input', { class: 'ctl small', value: String(cur), 'aria-label': `${v.name} for this copy`, onchange: (e) => { inst.vars[v.name] = parseValue(e.target.value); hooks.commit(); } }),
        h('button', { class: 'icon danger', title: `Remove ${v.name} from every ${obj.name}`, onclick: () => {
          obj.instanceVars = obj.instanceVars.filter((x) => x !== v);
          obj.instances.forEach((i) => delete i.vars[v.name]);
          hooks.commit();
        } }, '×'));
    });
    const addVar = (() => {
      const name = h('input', { class: 'ctl', placeholder: 'Variable name', 'aria-label': 'Variable name' });
      const val = h('input', { class: 'ctl small', placeholder: 'start', value: '0', 'aria-label': 'Starting value' });
      const go = () => {
        const nm = name.value.trim();
        if (!nm) return;
        if (!isIdentifier(nm) || ['text', 'x', 'y', 'w', 'h', 'visible'].includes(nm)) { hooks.notify('Pick a different name: letters, numbers and _ only, and not text, x, y, w, h or visible.'); return; }
        if (obj.instanceVars.some((v) => v.name === nm)) { hooks.notify(`${obj.name} already has ${nm}`); return; }
        obj.instanceVars.push({ name: nm, value: parseValue(val.value) });
        hooks.commit();
      };
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      return h('div', { class: 'add-row' }, name, val, h('button', { class: 'btn', onclick: go, title: 'Add' }, '+'));
    })();

    props.replaceChildren(
      h('h3', {}, obj.name, h('small', {}, ` ${OBJECT_KINDS[obj.kind]?.label ?? obj.kind}${obj.instances.length > 1 ? ` · copy ${n} of ${obj.instances.length}` : ''}`)),
      h('label', { class: 'f wide' }, h('span', {}, obj.kind === 'input' ? 'Starting text' : 'Text'), text),
      h('div', { class: 'grid4' }, numField('X', 'x', inst), numField('Y', 'y', inst), numField('Width', 'w', inst, 24), numField('Height', 'h', inst, 20)),
      h('label', { class: 'f check' }, h('input', { type: 'checkbox', checked: inst.visible !== false, onchange: (e) => { inst.visible = e.target.checked; hooks.commit(); } }), h('span', {}, 'Visible at start')),
      ...(showCopies || ivars.length ? [
        h('h4', {}, 'Each copy remembers…'),
        ...(ivars.length ? ivars : [h('p', { class: 'muted' }, 'No variables of its own. Add one so each copy can have its own value (like done, or hearts).')]),
        showCopies ? addVar : null] : []),
      h('div', { class: 'btn-row' },
        showCopies || obj.instances.length > 1 ? h('button', { class: 'btn', onclick: () => { const c = duplicateInstance(obj, inst); S.selId = c.id; hooks.commit(); } }, 'Duplicate (new copy)') : null,
        h('button', { class: 'btn danger', onclick: () => { deleteInstance(screen(), inst.id); S.selId = null; hooks.commit(); } }, 'Delete')),
    );
  }

  // arrows nudge, Delete removes. Returns true if it handled the key.
  function onKey(e) {
    const hit = S.selId && findInstance(screen(), S.selId);
    if (!hit) return false;
    const step = e.shiftKey ? 10 : 1;
    const move = { ArrowLeft: ['x', -step], ArrowRight: ['x', step], ArrowUp: ['y', -step], ArrowDown: ['y', step] }[e.key];
    if (move) { hit.inst[move[0]] = Math.max(0, hit.inst[move[0]] + move[1]); sync(); renderProps(true); hooks.commit(); return true; }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteInstance(screen(), S.selId); S.selId = null; hooks.commit(); return true; }
    return false;
  }

  return {
    render() { title.textContent = screen().name; sync(); renderProps(); },
    select() { stage.setSelected(S.selId); renderProps(); },
    onKey,
  };
}
