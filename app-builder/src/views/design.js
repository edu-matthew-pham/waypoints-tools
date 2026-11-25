// Design tab: drag-and-drop stage + properties panel.
import { h } from '../ui/dom.js';
import { Stage } from '../ui/stage.js';
import { OBJECT_KINDS } from '../core/catalog.js';
import { duplicateInstance, deleteInstance, findInstance, isIdentifier, parseValue, sizeOf, tableColumns, isList, isTable, tableFields } from '../core/project.js';
import { S, screen, hooks } from '../state.js';
import { renameInput } from '../ui/rename-input.js';
import { keep } from '../media-store.js';
import { pickPicture, pickSound } from '../ui/upload.js';
import { imageNames, imageData, assetName, soundNames, soundInfo, soundAssetName, videoSource, BUILTIN_SOUNDS } from '../core/assets.js';
import { renameInstVar } from '../core/rename.js';
import { screenItems } from '../ui/screen-items.js';

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

  stage.fitTo(stageCol, () => innerHeight - 170);
  const items = () => screenItems(S.project, screen());
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
            onSave: (nv) => { renameInstVar(screen(), obj.name, v.name, nv, S.project); renamingIvar = null; hooks.commit(); } })
          : h('button', { class: 'vname link-name', type: 'button', title: 'Click to rename (events are updated too)', onclick: () => { renamingIvar = obj.name + '.' + v.name; renderProps(); } }, v.name),
        h('input', { class: 'ctl small', value: String(cur), 'data-ab': 'objvar:' + v.name, 'aria-label': `${v.name} for this copy`, onchange: (e) => { inst.vars[v.name] = parseValue(e.target.value); hooks.commit(); } }),
        h('button', { class: 'icon danger', title: `Remove ${v.name} from every ${obj.name}`, onclick: () => {
          obj.instanceVars = obj.instanceVars.filter((x) => x !== v);
          obj.instances.forEach((i) => delete i.vars[v.name]);
          hooks.commit();
        } }, '×'));
    });
    const addVar = (() => {
      const name = h('input', { class: 'ctl', placeholder: 'Variable name', 'aria-label': 'Variable name', 'data-ab': 'new-objvar-name' });
      const val = h('input', { class: 'ctl small', placeholder: 'start', value: '0', 'aria-label': 'Starting value', 'data-ab': 'new-objvar-value' });
      const go = () => {
        const nm = name.value.trim();
        if (!nm) return;
        if (!isIdentifier(nm) || ['text', 'x', 'y', 'w', 'h', 'visible'].includes(nm)) { hooks.notify('Pick a different name: letters, numbers and _ only, and not text, x, y, w, h or visible.'); return; }
        if (obj.instanceVars.some((v) => v.name === nm)) { hooks.notify(`${obj.name} already has ${nm}`); return; }
        obj.instanceVars.push({ name: nm, value: parseValue(val.value) });
        hooks.commit();
      };
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      val.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      return h('div', { class: 'add-row' }, name, val, h('button', { class: 'btn', onclick: go, title: 'Add', 'data-ab': 'new-objvar-add' }, '+'));
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
          h('button', { class: 'pic add', 'data-ab': 'upload-picture', type: 'button', title: 'Upload a picture', onclick: () => pickPicture(async ({ fileName, data }) => {
            const name = assetName(S.project, fileName);
            S.project.assets.push({ name, ...await keep(data) });
            choose(name);
          }, hooks.notify) }, '+ Upload'))));
    }
    if (obj.kind === 'sound') {
      const names = soundNames(S.project);
      const sel = h('select', { class: 'ctl', 'aria-label': 'Sound', 'data-ab': 'prop:sound', onchange: (e) => { inst.sound = e.target.value; hooks.commit(); } },
        names.map((n) => { const i = soundInfo(S.project, n); return h('option', { value: n, selected: inst.sound === n }, `${i.title}${BUILTIN_SOUNDS[n]?.effect ? ' (effect)' : ''}`); }));
      let preview = null;
      const listen = h('button', { class: 'btn', type: 'button', 'data-ab': 'listen', title: 'Hear this sound', onclick: () => {
        if (preview && !preview.paused) { preview.pause(); listen.textContent = '▶ Listen'; return; }
        const info = soundInfo(S.project, inst.sound);
        if (!info) return;
        preview = new Audio(info.src);
        preview.onended = preview.onpause = () => { listen.textContent = '▶ Listen'; };
        preview.play().then(() => { listen.textContent = '■ Stop'; }).catch(() => hooks.notify('Could not play that sound here.'));
      } }, '▶ Listen');
      const info = soundInfo(S.project, inst.sound);
      extra.push(h('label', { class: 'f wide' }, h('span', {}, 'Sound'), sel),
        h('div', { class: 'btn-row' }, listen,
          h('button', { class: 'btn', type: 'button', 'data-ab': 'upload-sound', title: 'Upload your own sound (under about 5 MB)', onclick: () => pickSound(async ({ fileName, data }) => {
            const name = soundAssetName(S.project, fileName);
            S.project.sounds.push({ name, ...await keep(data), title: fileName.replace(/\.[^.]*$/, '') });
            inst.sound = name; hooks.commit();
          }, hooks.notify) }, '+ Upload sound')),
        h('p', { class: 'muted small' }, info ? `${info.title}: ${info.credit}. ` : '', 'Leave Text empty to show the sound\u2019s title.'));
    }
    if (obj.kind === 'video') {
      const src = videoSource(inst.link, { allowYoutube: !!S.project.allowYoutube });
      const link = h('input', { class: 'ctl', type: 'url', value: inst.link || '', placeholder: 'https://commons.wikimedia.org/wiki/File:…', 'aria-label': 'Video link', 'data-ab': 'prop:link',
        onchange: (e) => { inst.link = e.target.value.trim(); hooks.commit(); } });
      extra.push(h('label', { class: 'f wide' }, h('span', {}, 'Video link'), link),
        h('p', { class: 'muted small' }, src.kind === 'file' || src.kind === 'youtube' ? `Plays from ${src.from}. ` : src.why + '. ',
          'Find a video on ', h('a', { href: 'https://commons.wikimedia.org/wiki/Category:Videos', target: '_blank', rel: 'noopener' }, 'Wikimedia Commons'),
          ', open its page and paste that link here. Videos are linked, never uploaded.'),
        h('label', { class: 'f check wide' }, h('input', { type: 'checkbox', checked: !!S.project.allowYoutube, 'data-ab': 'allow-youtube',
          onchange: (e) => { S.project.allowYoutube = e.target.checked; hooks.commit(); } }),
          h('span', {}, 'Allow YouTube links in this app (off by default: YouTube is social media, so turn this on only if your school is happy with it)')));
    }
    if (obj.kind === 'drawing') {
      const bg = h('select', { class: 'ctl', 'aria-label': 'Background picture', 'data-ab': 'prop:background', onchange: (e) => { inst.background = e.target.value; hooks.commit(); } },
        h('option', { value: '' }, 'None (white)'),
        imageNames(S.project).map((n) => h('option', { value: n, selected: inst.background === n }, n)));
      extra.push(
        h('label', { class: 'f' }, h('span', {}, 'Pen colour'), h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(inst.color || '') ? inst.color : '#222222', 'aria-label': 'Pen colour', 'data-ab': 'prop:color',
          onchange: (e) => { inst.color = e.target.value; hooks.commit(); } })),
        h('label', { class: 'f' }, h('span', {}, 'Pen size'), h('input', { class: 'ctl small', type: 'number', min: 1, max: 40, value: inst.pen ?? 4, 'aria-label': 'Pen size', 'data-ab': 'prop:pen',
          onchange: (e) => { inst.pen = Math.max(1, Math.min(40, Number(e.target.value) || 4)); hooks.commit(); } })),
        h('label', { class: 'f wide' }, h('span', {}, 'Draw on'), bg),
        h('p', { class: 'muted small' }, 'Users draw with a finger or the mouse. Add buttons with events to change the colour, undo or clear. Drawing.picture is the drawing, ready for an Image or a table.'));
    }
    if (obj.kind === 'recorder') {
      extra.push(
        h('label', { class: 'f check wide' }, h('input', { type: 'checkbox', checked: !!S.project.allowMic, 'data-ab': 'allow-mic',
          onchange: (e) => { S.project.allowMic = e.target.checked; hooks.commit(); } }),
          h('span', {}, 'Allow microphone in this app (off by default; the browser also asks the user, and some school devices block microphones)')),
        h('p', { class: 'muted small' }, 'Users tap ● to record and ■ to stop (up to 20 seconds), then can trim the start and end. Recorder.sound is the recording, ready for a Sound (Set sound to the one named) or a table. Recordings stay in this browser.'));
    }
    if (obj.kind === 'photo') {
      extra.push(
        h('label', { class: 'f check wide' }, h('input', { type: 'checkbox', checked: !!S.project.allowCamera, 'data-ab': 'allow-camera',
          onchange: (e) => { S.project.allowCamera = e.target.checked; hooks.commit(); } }),
          h('span', {}, 'Allow camera in this app (off by default; the browser also asks the user, and some school devices block cameras)')),
        h('label', { class: 'f check wide' }, h('input', { type: 'checkbox', checked: inst.shutter !== false, 'data-ab': 'prop:shutter',
          onchange: (e) => { inst.shutter = e.target.checked; hooks.commit(); } }),
          h('span', {}, 'Show a take-photo button (or hide it and take photos with your own button: Take a photo with)')),
        h('p', { class: 'muted small' }, 'The camera starts when the user taps the Photo. "A photo is taken with" runs when they tap its take-photo button; Photo.picture is the photo, ready for an Image or a table. Photos stay in this browser.'));
    }
    if (obj.kind === 'list') {
      const lists = S.project.variables.filter(isList).map((v) => v.name);
      const sel = h('select', { class: 'ctl', 'aria-label': 'Shows list', onchange: (e) => { inst.source = e.target.value; hooks.commit(); } },
        h('option', { value: '' }, lists.length ? '\u2014 choose \u2014' : 'Add a list on the left first'),
        lists.map((n) => h('option', { value: n, selected: inst.source === n }, n)));
      extra.push(h('label', { class: 'f wide' }, h('span', {}, 'Shows list'), sel));
    }
    if (obj.kind === 'table') {
      const tables = S.project.variables.filter(isTable);
      const sel = h('select', { class: 'ctl', 'aria-label': 'Shows table', 'data-ab': 'prop:source', onchange: (e) => { inst.source = e.target.value; inst.columns = ''; hooks.commit(); } },
        h('option', { value: '' }, tables.length ? '\u2014 choose \u2014' : 'Add a table on the left first'),
        tables.map((v) => h('option', { value: v.name, selected: inst.source === v.name }, v.name)));
      extra.push(h('label', { class: 'f wide' }, h('span', {}, 'Shows table'), sel));
      const all = tableFields(tables.find((v) => v.name === inst.source));
      if (all.length) {
        const shown = new Set(tableColumns(S.project, inst));
        extra.push(h('fieldset', { class: 'f wide cols' }, h('legend', {}, 'Columns to show'),
          all.map((f) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: shown.has(f), 'data-ab': 'column:' + f, onchange: (e) => {
            const next = all.filter((x) => (x === f ? e.target.checked : shown.has(x)));
            inst.columns = next.length === all.length ? '' : next.join(', ');
            if (!next.length) inst.columns = f; // keep at least one column
            hooks.commit();
          } }), h('span', {}, f)))));
      }
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
      ...(['slider', 'shape', 'list', 'table'].includes(obj.kind) ? [] : [h('label', { class: 'f wide' }, h('span', {}, obj.kind === 'input' ? 'Starting text' : obj.kind === 'toggle' ? 'Label' : obj.kind === 'image' || obj.kind === 'video' ? 'Description (read aloud by screen readers)' : obj.kind === 'sound' ? 'Title shown (leave empty for the sound\u2019s own)' : 'Text'), text)]),
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
