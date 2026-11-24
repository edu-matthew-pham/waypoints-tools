// Design tab: drag-and-drop stage + properties panel.
import { h } from '../ui/dom.js';
import { Stage } from '../ui/stage.js';
import { OBJECT_KINDS } from '../core/catalog.js';
import { duplicateInstance, deleteInstance, findInstance, isIdentifier, parseValue, sizeOf } from '../core/project.js';
import { S, screen, hooks } from '../state.js';
import { renameInput } from '../ui/rename-input.js';
import { pickPicture } from '../ui/upload.js';
import { imageNames, imageData, assetName } from '../core/assets.js';
import { renameInstVar } from '../core/rename.js';

let renamingIvar = null;

export function initDesign(root) {
  const stageHost = h('div', { class: 'stage-host' });
  const title = h('div', { class: 'screen-title' });
  const props = h('div', { class: 'props' });
  const stageCol = h('div', { class: 'stage-col' }, title, stageHost);
  root.append(stageCol, props);

  const stage = new Stage(stageHost, {
    design: true,
    on: {
      select: (id) => hooks.select(id),
      move: (id, patch) => { Object.assign(findInstance(screen(), id).inst, patch); sync(); renderProps(true); },
      commit: () => hooks.commit(),
    },
  });

  const listItems = (name) => S.project.variables.find((v) => v.name === name && Array.isArray(v.value))?.value;
  stage.fitTo(stageCol, () => innerHeight - 170);
  const items = () => screen().objects.flatMap((o) => o.instances.map((i) => ({ id: i.id, name: o.name, kind: o.kind, props: o.kind === 'list' ? withItems(i) : i })));
  // a live view of the instance plus its list items, so dragging still moves the real instance
  const withItems = (i) => new Proxy(i, { get: (t, k) => (k === 'items' ? listItems(t.source) : t[k]) });
  function sync() { stage.sync(items()); stage.setSelected(S.selId); }

  function numField(label, key, inst, min = 0) {
    const input = h('input', { class: 'ctl small', type: 'number', value: inst[key], min, 'aria-label': label, 'data-k': key, 'data-ab': 'prop:' + key,
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
    const text = h('input', { class: 'ctl', 'data-ab': 'prop:text', value: inst.text, 'aria-label': 'Text', oninput: (e) => { inst.text = e.target.value; sync(); }, onchange: () => hooks.commit() });
    const showCopies = !S.rf || S.rf.instVars;
    const ivars = obj.instanceVars.map((v) => {
      const cur = v.name in inst.vars ? inst.vars[v.name] : v.value;
      return h('div', { class: 'var' },
        renamingIvar === obj.name + '.' + v.name
          ? renameInput({ value: v.name, label: 'Variable name', notify: hooks.notify, taken: [...obj.instanceVars.map((x) => x.name), 'text', 'x', 'y', 'w', 'h', 'visible', ...(OBJECT_KINDS[obj.kind]?.exposes || [])],
            onDone: () => { renamingIvar = null; renderProps(); },
            onSave: (nv) => { renameInstVar(screen(), obj.name, v.name, nv); renamingIvar = null; hooks.commit(); } })
          : h('button', { class: 'vname link-name', type: 'button', title: 'Click to rename (events are updated too)', onclick: () => { renamingIvar = obj.name + '.' + v.name; renderProps(); } }, v.name),
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

    // extra fields for components that have more than text and size
    const extra = [];
    if (obj.kind === 'toggle') {
      extra.push(h('label', { class: 'f check' }, h('input', { type: 'checkbox', checked: !!inst.on, onchange: (e) => { inst.on = e.target.checked; hooks.commit(); } }), h('span', {}, 'Starts on')));
    }
    if (obj.kind === 'image') {
      const choose = (name) => { inst.image = name; hooks.commit(); };
      extra.push(h('div', { class: 'f wide' }, h('span', {}, 'Picture'),
        h('div', { class: 'pic-grid' },
          ...imageNames(S.project).map((n) => h('button', { class: 'pic' + (inst.image === n ? ' on' : ''), 'data-ab': 'picture:' + n, type: 'button', title: n, 'aria-label': 'Use picture ' + n, 'aria-pressed': String(inst.image === n), onclick: () => choose(n) },
            h('img', { src: imageData(S.project, n), alt: '' }))),
          h('button', { class: 'pic add', 'data-ab': 'upload-picture', type: 'button', title: 'Upload a picture', onclick: () => pickPicture(({ fileName, data }) => {
            const name = assetName(S.project, fileName);
            S.project.assets.push({ name, data });
            choose(name);
          }, hooks.notify) }, '+ Upload'))));
    }
    if (obj.kind === 'list') {
      const lists = S.project.variables.filter((v) => Array.isArray(v.value)).map((v) => v.name);
      const sel = h('select', { class: 'ctl', 'aria-label': 'Shows list', onchange: (e) => { inst.source = e.target.value; hooks.commit(); } },
        h('option', { value: '' }, lists.length ? '\u2014 choose \u2014' : 'Add a list on the left first'),
        lists.map((n) => h('option', { value: n, selected: inst.source === n }, n)));
      extra.push(h('label', { class: 'f wide' }, h('span', {}, 'Shows list'), sel));
    }
    if (obj.kind === 'shape') {
      extra.push(h('label', { class: 'f' }, h('span', {}, 'Colour'), h('input', { type: 'color', value: inst.color || '#2f6fdd', 'aria-label': 'Colour', oninput: (e) => { inst.color = e.target.value; sync(); }, onchange: () => hooks.commit() })));
    }
    if (obj.kind === 'slider') {
      const num = (label, key) => h('label', { class: 'f' }, h('span', {}, label),
        h('input', { class: 'ctl small', type: 'number', value: inst[key], 'aria-label': label, onchange: (e) => {
          inst[key] = Number(e.target.value) || 0;
          if (inst.max <= inst.min) inst.max = inst.min + 1;
          inst.value = Math.max(inst.min, Math.min(inst.max, inst.value));
          hooks.commit();
        } }));
      extra.push(h('div', { class: 'grid4' }, num('Smallest', 'min'), num('Largest', 'max'), num('Starts at', 'value')));
    }

    props.replaceChildren(
      h('h3', {}, obj.name, h('small', {}, ` ${OBJECT_KINDS[obj.kind]?.label ?? obj.kind}${obj.instances.length > 1 ? ` · copy ${n} of ${obj.instances.length}` : ''}`)),
      ...(['slider', 'shape', 'list'].includes(obj.kind) ? [] : [h('label', { class: 'f wide' }, h('span', {}, obj.kind === 'input' ? 'Starting text' : obj.kind === 'toggle' ? 'Label' : obj.kind === 'image' ? 'Description (read aloud by screen readers)' : 'Text'), text)]),
      h('div', { class: 'grid4' }, numField('X', 'x', inst), numField('Y', 'y', inst), numField('Width', 'w', inst, 24), numField('Height', 'h', inst, 20)),
      ...extra,
      h('label', { class: 'f check' }, h('input', { type: 'checkbox', checked: inst.visible !== false, onchange: (e) => { inst.visible = e.target.checked; hooks.commit(); } }), h('span', {}, 'Visible at start')),
      ...(showCopies || ivars.length ? [
        h('h4', {}, 'Each copy remembers…'),
        ...(ivars.length ? ivars : [h('p', { class: 'muted' }, 'No variables of its own. Add one so each copy can have its own value (like done, or hearts).')]),
        showCopies ? addVar : null] : []),
      h('div', { class: 'btn-row' },
        showCopies || obj.instances.length > 1 ? h('button', { class: 'btn', 'data-ab': 'duplicate', onclick: () => { const c = duplicateInstance(obj, inst, sizeOf(S.project)); S.selId = c.id; hooks.commit(); } }, 'Duplicate (new copy)') : null,
        h('button', { class: 'btn danger', 'data-ab': 'delete', onclick: () => { deleteInstance(screen(), inst.id); S.selId = null; hooks.commit(); } }, 'Delete')),
    );
  }

  // arrows nudge, Delete removes. Returns true if it handled the key.
  function onKey(e) {
    const hit = S.selId && findInstance(screen(), S.selId);
    if (!hit) return false;
    const step = e.shiftKey ? 10 : 1;
    const move = { ArrowLeft: ['x', -step], ArrowRight: ['x', step], ArrowUp: ['y', -step], ArrowDown: ['y', step] }[e.key];
    // Alt + arrows resize: the keyboard way to do what dragging the corner handle does
    const grow = e.altKey && { ArrowLeft: ['w', -step], ArrowRight: ['w', step], ArrowUp: ['h', -step], ArrowDown: ['h', step] }[e.key];
    if (grow) { hit.inst[grow[0]] = Math.max(grow[0] === 'w' ? 24 : 20, hit.inst[grow[0]] + grow[1]); sync(); renderProps(true); hooks.commit(); return true; }
    if (move) { hit.inst[move[0]] = Math.max(0, hit.inst[move[0]] + move[1]); sync(); renderProps(true); hooks.commit(); return true; }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteInstance(screen(), S.selId); S.selId = null; hooks.commit(); return true; }
    return false;
  }

  return {
    render() { title.textContent = screen().name; stage.setSize(sizeOf(S.project)); sync(); renderProps(); },
    select() { stage.setSelected(S.selId); renderProps(); },
    onKey,
  };
}
