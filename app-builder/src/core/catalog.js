import { COMPONENTS } from './components.js';
// The catalog: every condition and action the editor offers.
// Entries are mostly data (label template, params) plus one small function each.
// Adding a feature = adding an entry here. No editor code changes.
//
// Label templates use {param} placeholders; the editor turns them into controls.
// Param types: object, variable, instVar (belongs to the event's `target`),
//              expr, operator, screen, showhide, function (one of the app's functions),
//              args (one value box per parameter of the chosen function: { param: expression })

import { ExprError, fmt, OPERATORS, compare } from './expr.js';

export const OBJECT_KINDS = COMPONENTS; // kept under the old name for the interpreter and project helpers
export { OPERATORS, compare };

// Keys students can pick. e.key is normalised so "a" and "A" are the same key.
export const KEYS = [
  ['any', 'Any key'], ['Enter', 'Enter'], ['Space', 'Space'], ['Escape', 'Escape'],
  ['ArrowUp', 'Up arrow'], ['ArrowDown', 'Down arrow'], ['ArrowLeft', 'Left arrow'], ['ArrowRight', 'Right arrow'],
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').map((c) => [c, c]),
];
export const normaliseKey = (k) => (k === ' ' ? 'Space' : String(k).length === 1 ? String(k).toUpperCase() : String(k));

const obj = (extra = {}) => ({ name: 'target', type: 'object', ...extra });
const expr = (name = 'value', def = '') => ({ name, type: 'expr', default: def });

export const CONDITIONS = {
  onStart: {
    category: 'Screen', label: 'On start of screen', trigger: 'start', params: [],
  },
  onClicked: {
    category: 'Object', label: '{target} is clicked', trigger: 'clicked', object: 'target',
    params: [obj()],
  },
  onChanged: {
    category: 'Object', label: '{target} text changes', trigger: 'changed', object: 'target',
    params: [obj({ kinds: ['input'] })],
  },
  onPressed: {
    category: 'Object', label: '{target} is pressed', trigger: 'pressed', object: 'target', params: [obj()],
  },
  onReleased: {
    category: 'Object', label: '{target} is released', trigger: 'released', object: 'target', params: [obj()],
  },
  onToggled: {
    category: 'Object', label: '{target} is switched', trigger: 'changed', object: 'target',
    params: [obj({ kinds: ['toggle'] })],
  },
  onSlid: {
    category: 'Object', label: '{target} is moved', trigger: 'changed', object: 'target',
    params: [obj({ kinds: ['slider'] })],
  },
  onSubmitted: {
    category: 'Object', label: 'Enter is pressed in {target}', trigger: 'submitted', object: 'target',
    params: [obj({ kinds: ['input'] })],
  },
  onDrawn: {
    category: 'Object', label: '{target} is drawn on', trigger: 'changed', object: 'target',
    params: [obj({ kinds: ['drawing'] })],
    help: 'Runs each time the user finishes a line. Drawing.lines is how many lines there are.',
  },
  onKey: {
    category: 'Keyboard', label: 'Key {key} is pressed', trigger: 'keyDown', keyed: true,
    params: [{ name: 'key', type: 'key' }],
  },
  onKeyUp: {
    category: 'Keyboard', label: 'Key {key} is released', trigger: 'keyUp', keyed: true,
    params: [{ name: 'key', type: 'key' }],
  },
  keyHeld: {
    category: 'Keyboard', label: 'Key {key} is held down',
    params: [{ name: 'key', type: 'key' }],
    test: (rt, ctx, p) => (p.key === 'any' ? rt.keysDown.size > 0 : rt.keysDown.has(p.key)),
  },
  compareText: {
    category: 'Object', label: '{target} text {op} {value}',
    params: [obj(), { name: 'op', type: 'operator' }, expr()],
    // Picking: keeps only the copies whose text matches.
    test: (rt, ctx, p) => {
      const keep = rt.pickList(ctx, p.target).filter((inst) => compare(inst.props.text, p.op, rt.evalExpr(p.value, rt.ctxWith(ctx, p.target, inst))));
      ctx.picked.set(p.target, keep);
      return keep.length > 0;
    },
  },
  isOn: {
    category: 'Object', label: '{target} is {state}',
    params: [obj({ kinds: ['toggle'] }), { name: 'state', type: 'onoff' }],
    // Picking: keeps only the toggles in that state.
    test: (rt, ctx, p) => {
      const want = p.state !== 'off';
      const keep = rt.pickList(ctx, p.target).filter((inst) => !!inst.props.on === want);
      ctx.picked.set(p.target, keep);
      return keep.length > 0;
    },
  },
  isPlaying: {
    category: 'Object', label: '{target} is playing',
    params: [obj({ kinds: ['sound', 'video'] })],
    // Picking: keeps only the sounds (or videos) that are playing.
    test: (rt, ctx, p) => {
      const keep = rt.pickList(ctx, p.target).filter((inst) => !!inst.props.playing);
      ctx.picked.set(p.target, keep);
      return keep.length > 0;
    },
  },
  onEnded: {
    category: 'Object', label: '{target} finishes playing', trigger: 'ended', object: 'target',
    params: [obj({ kinds: ['sound', 'video'] })],
  },
  onEvery: {
    category: 'System', label: 'Every {seconds} seconds', trigger: 'timer', timer: 'every',
    params: [expr('seconds', '1')],
  },
  onAfter: {
    category: 'System', label: 'After {seconds} seconds', trigger: 'timer', timer: 'after',
    params: [expr('seconds', '3')],
  },
  triggerOnce: {
    category: 'System', label: 'Trigger once while true', params: [], once: true,
    help: 'Runs the event once when the conditions above become true, then waits until they are false again. Once for the whole event, not once per copy. Keep it last.',
    // the runtime handles this one itself (it needs to remember the event between ticks)
  },
  onItemClicked: {
    category: 'Object', label: 'An item in {target} is clicked', trigger: 'itemClicked', object: 'target',
    params: [obj({ kinds: ['list', 'table'] })],
    help: 'ClickedItem is the item (or row) that was clicked, and ClickedIndex is its number (from 1). For a table, ClickedItem.title is one field of that row.',
  },
  forEachRow: {
    category: 'Tables', label: 'For each row in table {table}', loop: 'each',
    params: [{ name: 'table', type: 'table' }],
    help: 'Runs the event once for every row. Inside it, LoopItem is the row (LoopItem.title is one field) and LoopIndex is its number (from 1).',
  },
  forEach: {
    category: 'Lists', label: 'For each item in list {list}', loop: 'each',
    params: [{ name: 'list', type: 'list' }],
    help: 'Runs the event once for every item. Inside it, LoopItem is the item and LoopIndex is its number (from 1).',
  },
  repeat: {
    category: 'System', label: 'Repeat {count} times', loop: 'repeat',
    params: [expr('count', '3')],
    help: 'Runs the event that many times. Inside it, LoopIndex counts 1, 2, 3 ...',
  },
  listHas: {
    category: 'Lists', label: 'List {list} contains {value}',
    params: [{ name: 'list', type: 'list' }, expr()],
    test: (rt, ctx, p) => rt.listOf(p.list).some((x) => compare(x, '=', rt.evalExpr(p.value, ctx))),
  },
  everyTick: {
    category: 'System', label: 'Every tick', params: [],
    test: () => true,
  },
  compareVar: {
    category: 'Variables', label: 'Variable {var} {op} {value}',
    params: [{ name: 'var', type: 'variable' }, { name: 'op', type: 'operator' }, expr()],
    test: (rt, ctx, p) => compare(rt.getVar(p.var), p.op, rt.evalExpr(p.value, ctx)),
  },
  compareValues: {
    category: 'Variables', label: 'Compare {left} {op} {right}',
    params: [expr('left'), { name: 'op', type: 'operator' }, expr('right')],
    test: (rt, ctx, p) => compare(rt.evalExpr(p.left, ctx), p.op, rt.evalExpr(p.right, ctx)),
  },
  compareInst: {
    category: 'Object', label: '{target}: {var} {op} {value}',
    params: [obj(), { name: 'var', type: 'instVar' }, { name: 'op', type: 'operator' }, expr()],
    // Picking: keeps only the copies that pass, so later actions affect just those.
    test: (rt, ctx, p) => {
      const keep = rt.pickList(ctx, p.target).filter((inst) =>
        compare(rt.instVar(inst, p.var), p.op, rt.evalExpr(p.value, rt.ctxWith(ctx, p.target, inst))));
      ctx.picked.set(p.target, keep);
      return keep.length > 0;
    },
  },
};

export const ACTIONS = {
  setText: {
    category: 'Object', label: 'Set {target} text to {value}',
    params: [obj(), expr()],
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst, c) => rt.setProp(inst, 'text', fmt(rt.evalExpr(p.value, c)))),
  },
  setImage: {
    category: 'Object', label: 'Set {target} picture to {image}',
    params: [obj({ kinds: ['image'] }), { name: 'image', type: 'picture' }],
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst) => rt.setProp(inst, 'image', p.image)),
  },
  setImageFrom: {
    category: 'Object', label: 'Set {target} picture to the one in {value}',
    params: [obj({ kinds: ['image'] }), expr('value', 'ClickedItem.picture')],
    help: 'Worked out when the app runs: a picture someone made (Drawing.picture, Photo.picture), a table field that holds one (ClickedItem.picture), or the name of a picture.',
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst, c) => rt.setProp(inst, 'image', rt.pictureValue(rt.evalExpr(p.value, c)))),
  },
  clearDrawing: {
    category: 'Object', label: 'Clear {target}',
    params: [obj({ kinds: ['drawing'] })],
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst) => rt.drawing(inst, 'clear')),
  },
  undoDrawing: {
    category: 'Object', label: 'Undo the last line on {target}',
    params: [obj({ kinds: ['drawing'] })],
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst) => rt.drawing(inst, 'undo')),
  },
  setPenColour: {
    category: 'Object', label: 'Set {target} pen colour to {value}',
    params: [obj({ kinds: ['drawing'] }), expr('value', '"red"')],
    help: 'A colour name in quotes, like "red" or "blue", or a code like "#2f6fdd". Lines already drawn keep their colour.',
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst, c) => rt.setProp(inst, 'color', fmt(rt.evalExpr(p.value, c)).trim())),
  },
  setPenSize: {
    category: 'Object', label: 'Set {target} pen size to {value}',
    params: [obj({ kinds: ['drawing'] }), expr('value', '8')],
    help: 'How thick the next lines are, in pixels: 1 to 40.',
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst, c) => {
      const n = Number(rt.evalExpr(p.value, c));
      if (!Number.isFinite(n)) throw new ExprError('The pen size must be a number, like 8');
      rt.setProp(inst, 'pen', Math.max(1, Math.min(40, n)));
    }),
  },
  setDrawingBackground: {
    category: 'Object', label: 'Set {target} background to the picture in {value}',
    params: [obj({ kinds: ['drawing'] }), expr('value', 'Photo.picture')],
    help: 'A picture to draw on top of, such as a photo to label. Drawing.picture then includes it. Use "" for none.',
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst, c) => {
      const v = rt.evalExpr(p.value, c);
      rt.setProp(inst, 'background', v === '' ? '' : rt.pictureValue(v));
      rt.drawing(inst, 'changed');
    }),
  },
  takePhoto: {
    category: 'Object', label: 'Take a photo with {target}',
    params: [obj({ kinds: ['photo'] })],
    help: 'Photo.picture is then the photo, ready to show in an Image or keep in a table. The camera must be on first: the user taps the Photo to start it.',
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst) => rt.takePhoto(inst)),
  },
  playSound: {
    category: 'Object', label: 'Play {target}',
    params: [obj({ kinds: ['sound', 'video'] })],
    help: 'Plays from the start. A browser only plays sound after the user has clicked or pressed something in the app.',
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst) => rt.media(inst, 'play')),
  },
  stopSound: {
    category: 'Object', label: 'Stop {target}',
    params: [obj({ kinds: ['sound', 'video'] })],
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst) => rt.media(inst, 'stop')),
  },
  setSound: {
    category: 'Object', label: 'Set {target} sound to {sound}',
    params: [obj({ kinds: ['sound'] }), { name: 'sound', type: 'sound' }],
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst) => { rt.media(inst, 'stop'); rt.setProp(inst, 'sound', p.sound); }),
  },
  setSoundNamed: {
    category: 'Object', label: 'Set {target} sound to the one named {name}',
    params: [obj({ kinds: ['sound'] }), expr('name', 'ClickedItem.sound')],
    help: 'The name is worked out when the app runs, so a table can have a field naming each row\'s sound: ClickedItem.sound.',
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst, c) => {
      const name = fmt(rt.evalExpr(p.name, c));
      if (!rt.hasSound(name)) throw new ExprError(`There is no sound called "${name}"`);
      rt.media(inst, 'stop'); rt.setProp(inst, 'sound', name);
    }),
  },
  setVideo: {
    category: 'Object', label: 'Set {target} video to {link}',
    params: [obj({ kinds: ['video'] }), expr('link', 'ClickedItem.link')],
    help: 'A link to a video file, such as one on Wikimedia Commons. The name is worked out when the app runs, so a table field can hold each row\'s link.',
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst, c) => { rt.media(inst, 'stop'); rt.setProp(inst, 'link', fmt(rt.evalExpr(p.link, c)).trim()); }),
  },
  openLink: {
    category: 'System', label: 'Open link {link} in a new tab',
    params: [expr('link', '"https://commons.wikimedia.org"')],
    help: 'Opens a web page in a new browser tab (the app keeps running). Only http and https links open.',
    run: (rt, ctx, p) => {
      const link = fmt(rt.evalExpr(p.link, ctx)).trim();
      if (!/^https?:\/\//i.test(link)) throw new ExprError(`"${link}" isn't a web link (it should start with https://)`);
      rt.openLink(link);
    },
  },
  setSize: {
    category: 'Object', label: 'Set {target} {prop} to {value}',
    params: [obj(), { name: 'prop', type: 'posSize' }, expr()],
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst, c) => {
      const v = num(rt.evalExpr(p.value, c));
      rt.setProp(inst, p.prop, p.prop === 'w' || p.prop === 'h' ? Math.max(0, v) : v);
    }),
  },
  setOn: {
    category: 'Object', label: 'Turn {target} {state}',
    params: [obj({ kinds: ['toggle'] }), { name: 'state', type: 'onoff' }],
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst) => rt.setProp(inst, 'on', p.state !== 'off')),
  },
  setSlider: {
    category: 'Object', label: 'Set {target} value to {value}',
    params: [obj({ kinds: ['slider'] }), expr()],
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst, c) => rt.setProp(inst, 'value', clampTo(inst, num(rt.evalExpr(p.value, c))))),
  },
  setVisible: {
    category: 'Object', label: '{visible} {target}',
    params: [{ name: 'visible', type: 'showhide' }, obj()],
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst) => rt.setProp(inst, 'visible', p.visible !== 'hide')),
  },
  setInst: {
    category: 'Object', label: 'Set {target} {var} to {value}',
    params: [obj(), { name: 'var', type: 'instVar' }, expr()],
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst, c) => rt.setInstVar(inst, p.var, rt.evalExpr(p.value, c))),
  },
  addToInst: {
    category: 'Object', label: 'Add {value} to {target} {var}',
    params: [expr(), obj(), { name: 'var', type: 'instVar' }],
    run: (rt, ctx, p) => rt.each(ctx, p.target, (inst, c) =>
      rt.setInstVar(inst, p.var, num(rt.instVar(inst, p.var)) + num(rt.evalExpr(p.value, c)))),
  },
  setVar: {
    category: 'Variables', label: 'Set variable {var} to {value}',
    params: [{ name: 'var', type: 'variable' }, expr()],
    run: (rt, ctx, p) => rt.setVar(p.var, rt.evalExpr(p.value, ctx)),
  },
  addTo: {
    category: 'Variables', label: 'Add {value} to variable {var}',
    params: [expr(), { name: 'var', type: 'variable' }],
    run: (rt, ctx, p) => rt.setVar(p.var, num(rt.getVar(p.var)) + num(rt.evalExpr(p.value, ctx))),
  },
  subtractFrom: {
    category: 'Variables', label: 'Subtract {value} from variable {var}',
    params: [expr(), { name: 'var', type: 'variable' }],
    run: (rt, ctx, p) => rt.setVar(p.var, num(rt.getVar(p.var)) - num(rt.evalExpr(p.value, ctx))),
  },
  listAdd: {
    category: 'Lists', label: 'Add {value} to the end of list {list}',
    params: [expr(), { name: 'list', type: 'list' }],
    run: (rt, ctx, p) => rt.listChange(p.list, (l) => l.push(rt.evalExpr(p.value, ctx))),
  },
  listRemoveAt: {
    category: 'Lists', label: 'Remove item {index} from list {list}',
    params: [expr('index', '1'), { name: 'list', type: 'list' }],
    run: (rt, ctx, p) => { const i = num(rt.evalExpr(p.index, ctx)); rt.listChange(p.list, (l) => { rt.checkIndex(l, i); l.splice(i - 1, 1); }); },
  },
  listRemoveValue: {
    category: 'Lists', label: 'Remove {value} from list {list}',
    params: [expr(), { name: 'list', type: 'list' }],
    run: (rt, ctx, p) => { const v = rt.evalExpr(p.value, ctx); rt.listChange(p.list, (l) => { const i = l.findIndex((x) => compare(x, '=', v)); if (i >= 0) l.splice(i, 1); }); },
  },
  listSet: {
    category: 'Lists', label: 'Set item {index} of list {list} to {value}',
    params: [expr('index', '1'), { name: 'list', type: 'list' }, expr()],
    run: (rt, ctx, p) => { const i = num(rt.evalExpr(p.index, ctx)); const v = rt.evalExpr(p.value, ctx); rt.listChange(p.list, (l) => { rt.checkIndex(l, i); l[i - 1] = v; }); },
  },
  listClear: {
    category: 'Lists', label: 'Clear list {list}',
    params: [{ name: 'list', type: 'list' }],
    run: (rt, ctx, p) => rt.listChange(p.list, (l) => { l.length = 0; }),
  },
  tableAdd: {
    category: 'Tables', label: 'Add a row to table {table}: {values}',
    params: [{ name: 'table', type: 'table' }, { name: 'values', type: 'fields' }],
    run: (rt, ctx, p) => {
      const row = {};
      for (const f of rt.fieldsOf(p.table)) {
        const src = p.values?.[f.name];
        row[f.name] = rt.toField(p.table, f.name, src == null || String(src).trim() === '' ? (f.type === 'number' ? 0 : '') : rt.evalExpr(src, ctx));
      }
      rt.tableChange(p.table, (t) => t.push(row));
    },
  },
  tableSet: {
    category: 'Tables', label: 'Set {field} of row {index} in table {table} to {value}',
    params: [{ name: 'field', type: 'field' }, expr('index', '1'), { name: 'table', type: 'table' }, expr()],
    run: (rt, ctx, p) => {
      const i = num(rt.evalExpr(p.index, ctx));
      const v = rt.toField(p.table, p.field, rt.evalExpr(p.value, ctx));
      rt.tableChange(p.table, (t) => { rt.checkRow(t, i, p.table); t[i - 1] = { ...t[i - 1], [p.field]: v }; });
    },
  },
  tableRemove: {
    category: 'Tables', label: 'Remove row {index} from table {table}',
    params: [expr('index', '1'), { name: 'table', type: 'table' }],
    run: (rt, ctx, p) => { const i = num(rt.evalExpr(p.index, ctx)); rt.tableChange(p.table, (t) => { rt.checkRow(t, i, p.table); t.splice(i - 1, 1); }); },
  },
  tableClear: {
    category: 'Tables', label: 'Clear table {table}',
    params: [{ name: 'table', type: 'table' }],
    run: (rt, ctx, p) => rt.tableChange(p.table, (t) => { t.length = 0; }),
  },
  tableSort: {
    category: 'Tables', label: 'Sort table {table} by {field} {dir}',
    params: [{ name: 'table', type: 'table' }, { name: 'field', type: 'field' }, { name: 'dir', type: 'sortdir' }],
    run: (rt, ctx, p) => {
      const type = rt.fieldType(p.table, p.field);
      const sign = p.dir === 'down' ? -1 : 1;
      const key = (r) => r[p.field];
      const cmp = type === 'number'
        ? (a, b) => (Number(key(a)) || 0) - (Number(key(b)) || 0)
        : (a, b) => String(key(a)).localeCompare(String(key(b)), undefined, { sensitivity: 'base', numeric: true });
      rt.tableChange(p.table, (t) => { const sorted = [...t].sort((a, b) => sign * cmp(a, b)); t.splice(0, t.length, ...sorted); }); // stable: equal rows keep their order
    },
  },
  callFunction: {
    category: 'Functions', label: 'Call {fn} {args}',
    params: [{ name: 'fn', type: 'function' }, { name: 'args', type: 'args' }],
    help: 'Runs the function\'s actions now, then carries on with this event. Each value you give is a parameter: a plain name inside the function.',
    run: (rt, ctx, p) => rt.callFunction(p.fn, rt.argValues(p.fn, p.args, ctx), ctx),
  },
  setReturn: {
    category: 'Functions', label: 'Set return value to {value}',
    params: [expr()],
    help: 'Only inside a function. The value the function gives back when it is used in a value box, like Total(price, qty).',
    run: (rt, ctx, p) => rt.setReturn(ctx, rt.evalExpr(p.value, ctx)),
  },
  goToScreen: {
    category: 'Screen', label: 'Go to screen {screen}',
    params: [{ name: 'screen', type: 'screen' }],
    run: (rt, ctx, p) => rt.goTo(p.screen),
  },
};

const clampTo = (inst, n) => Math.max(inst.props.min, Math.min(inst.props.max, n));

function num(v) {
  if (typeof v !== 'number') throw new ExprError(`Adding needs numbers, but this is ${typeof v === 'string' ? `text: "${v}"` : 'not a number'}. Use int(...) to turn text into a number.`);
  return v;
}

// ---- helpers used by the editor ----

export const entryFor = (kind, type) => (kind === 'cond' ? CONDITIONS : ACTIONS)[type];

// scope = { objects: [{name, kind, vars:[names]}], variables:[names], screens:[{id,name}] }
export function defaultParams(entry, scope) {
  const out = {};
  for (const prm of entry.params) {
    switch (prm.type) {
      case 'object': {
        const list = scope.objects.filter((o) => !prm.kinds || prm.kinds.includes(o.kind));
        out[prm.name] = list[0]?.name ?? '';
        break;
      }
      case 'variable': out[prm.name] = scope.variables[0] ?? ''; break;
      case 'list': out[prm.name] = scope.lists?.[0] ?? ''; break;
      case 'table': out[prm.name] = scope.tables?.[0] ?? ''; break;
      case 'field': out[prm.name] = ''; break; // filled in below, once the table is known
      case 'fields': case 'args': out[prm.name] = {}; break;
      case 'function': out[prm.name] = scope.functions?.[0]?.name ?? ''; break;
      case 'sortdir': out[prm.name] = 'up'; break;
      case 'instVar': {
        const t = entry.params.find((x) => x.type === 'object');
        const o = scope.objects.find((x) => x.name === out[t?.name]);
        out[prm.name] = o?.vars[0] ?? '';
        break;
      }
      case 'operator': out[prm.name] = '='; break;
      case 'screen': out[prm.name] = scope.screens[0]?.id ?? ''; break;
      case 'showhide': out[prm.name] = 'show'; break;
      case 'onoff': out[prm.name] = 'on'; break;
      case 'key': out[prm.name] = 'Enter'; break;
      case 'posSize': out[prm.name] = 'w'; break;
      case 'picture': out[prm.name] = scope.pictures?.[0] ?? 'star'; break;
      case 'sound': out[prm.name] = scope.sounds?.[0] ?? 'chime'; break;
      default: out[prm.name] = prm.default ?? '';
    }
  }
  const t = entry.params.find((p) => p.type === 'table');
  for (const prm of entry.params.filter((p) => p.type === 'field')) out[prm.name] = scope.tableFields?.[out[t?.name]]?.[0] ?? '';
  return out;
}

export const SORT_DIRS = [['up', 'A to Z, smallest first'], ['down', 'Z to A, biggest first']];

// Structural checks the editor shows as warnings. Returns [{ id, message }].
// inFunction: the events are a function's body (no triggers there: calling it is what starts it).
export function validateSheet(events, depth = 0, out = [], underTrigger = false, inFunction = false) {
  let prevOk = false; // can an Else follow the previous event?
  for (const ev of events) {
    const trigs = (ev.conds || []).filter((c) => CONDITIONS[c.type]?.trigger);
    (ev.conds || []).forEach((c) => {
      if (!CONDITIONS[c.type]) out.push({ id: ev.id, message: `Unknown condition "${c.type}"` });
    });
    (ev.actions || []).forEach((a) => {
      if (!ACTIONS[a.type]) out.push({ id: ev.id, message: `Unknown action "${a.type}"` });
    });
    if (trigs.length > 1) out.push({ id: ev.id, message: 'An event can have only one trigger.' });
    if (trigs.length && (ev.conds[0] !== trigs[0])) out.push({ id: ev.id, message: 'The trigger must be the first condition.' });
    if (trigs.length && inFunction) out.push({ id: ev.id, message: "Triggers can't go in a function: calling it is what starts it." });
    else if (trigs.length && depth > 0) out.push({ id: ev.id, message: "Triggers can't go in sub-events." });
    if (!inFunction && (ev.actions || []).some((a) => a.type === 'setReturn')) out.push({ id: ev.id, message: 'Set return value only works inside a function.' });
    if (ev.else && !prevOk) out.push({ id: ev.id, message: 'Else needs a normal (non-trigger) event right above it.' });
    if (ev.else && trigs.length) out.push({ id: ev.id, message: "An Else event can't have a trigger." });
    const onceAt = (ev.conds || []).findIndex((c) => c.type === 'triggerOnce');
    if (onceAt >= 0 && onceAt !== ev.conds.length - 1) out.push({ id: ev.id, message: 'Trigger once should be the last condition (it only looks at the ones above it).' });
    if (onceAt >= 0 && (trigs.length || underTrigger)) out.push({ id: ev.id, message: 'Trigger once is only needed in events checked every tick. ⚡ events already run once.' });
    prevOk = ev.else ? prevOk : trigs.length === 0;
    if (ev.children?.length) validateSheet(ev.children, depth + 1, out, underTrigger || trigs.length > 0, inFunction);
  }
  return out;
}

// One line of help under each value box (like Construct's parameter descriptions).
const NUM_OR_CALC = 'A number, a variable, or a calculation like score + 1.';
const PARAM_HELP = {
  'onEvery.seconds': 'How many seconds between each time. A number like 2 or 0.5, or a variable.',
  'onAfter.seconds': 'How many seconds to wait. A number like 3, or a variable.',
  'compareVar.value': 'What to compare the variable with: a number, "text in quotes", or another variable.',
  'compareValues.left': 'The first value: a variable, a number, "text in quotes", or Object.property.',
  'compareValues.right': 'The value to compare it with.',
  'compareInst.value': 'What to compare with: a number, "text in quotes", or a variable.',
  'compareText.value': 'The text to compare with, in "quotes", e.g. "⬜".',
  'listHas.value': 'The item to look for, e.g. "Milk" or a variable.',
  'listAdd.value': 'The item to add: "text in quotes", a number, or something like Name.text.',
  'listRemoveAt.index': 'Which item: 1 is the first, count(list) is the last.',
  'listRemoveValue.value': 'The item to remove (the first one that matches).',
  'listSet.index': 'Which item: 1 is the first.',
  'listSet.value': 'The new value for that item.',
  'tableSet.index': 'Which row: 1 is the first, LoopIndex inside For each, ClickedIndex when a row is clicked.',
  'tableSet.value': 'The new value for that field: a number, "text in quotes", or something like Name.text.',
  'tableRemove.index': 'Which row: 1 is the first, count(table) is the last, ClickedIndex is the clicked row.',
  'repeat.count': 'How many times: a number or a variable.',
  'setSize.value': 'A number of pixels, or a calculation like (water / goal) * 300.',
  'setText.value': 'The text to show. Put words in "quotes" and join pieces with &, e.g. "Total: " & minutes',
  'setSlider.value': "A number between the slider's smallest and largest. " + NUM_OR_CALC,
  'setInst.value': 'The new value: a number, "text in quotes", or a calculation like done + 1.',
  'addToInst.value': 'How much to add. ' + NUM_OR_CALC,
  'setVar.value': 'The new value: a number, "text in quotes", or a calculation like score + 1.',
  'addTo.value': 'How much to add. ' + NUM_OR_CALC,
  'subtractFrom.value': 'How much to take away. ' + NUM_OR_CALC,
  'setReturn.value': 'What the function gives back: a number, "text in quotes", or a calculation like price * qty.',
};
for (const table of [CONDITIONS, ACTIONS]) {
  for (const [id, e] of Object.entries(table)) {
    for (const p of e.params) if (p.type === 'args') p.help = 'One value for each parameter of the function: a number, "text in quotes", a variable, or something like Entry.text.';
    for (const p of e.params) if (p.type === 'fields') p.help = 'One value for each field: "text in quotes", a number, or something like Title.text. An empty box gives empty text (or 0 for a number field).';
    for (const p of e.params) if (p.type === 'expr') p.help = PARAM_HELP[`${id}.${p.name}`] || 'A value: a number, "text in quotes", a variable, or a calculation.';
  }
}

// true if any event on a screen reacts to the keyboard (the preview then asks the user to click it first)
export function usesKeys(events = []) {
  return events.some((ev) => (ev.conds || []).some((c) => CONDITIONS[c.type]?.keyed || c.type === 'keyHeld') || usesKeys(ev.children));
}
