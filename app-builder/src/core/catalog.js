import { COMPONENTS } from './components.js';
// The catalog: every condition and action the editor offers.
// Entries are mostly data (label template, params) plus one small function each.
// Adding a feature = adding an entry here. No editor code changes.
//
// Label templates use {param} placeholders; the editor turns them into controls.
// Param types: object, variable, instVar (belongs to the event's `target`),
//              expr, operator, screen, showhide

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
      default: out[prm.name] = prm.default ?? '';
    }
  }
  return out;
}

// Structural checks the editor shows as warnings. Returns [{ id, message }].
export function validateSheet(events, depth = 0, out = [], underTrigger = false) {
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
    if (trigs.length && depth > 0) out.push({ id: ev.id, message: "Triggers can't go in sub-events." });
    if (ev.else && !prevOk) out.push({ id: ev.id, message: 'Else needs a normal (non-trigger) event right above it.' });
    if (ev.else && trigs.length) out.push({ id: ev.id, message: "An Else event can't have a trigger." });
    const onceAt = (ev.conds || []).findIndex((c) => c.type === 'triggerOnce');
    if (onceAt >= 0 && onceAt !== ev.conds.length - 1) out.push({ id: ev.id, message: 'Trigger once should be the last condition (it only looks at the ones above it).' });
    if (onceAt >= 0 && (trigs.length || underTrigger)) out.push({ id: ev.id, message: 'Trigger once is only needed in events checked every tick. ⚡ events already run once.' });
    prevOk = ev.else ? prevOk : trigs.length === 0;
    if (ev.children?.length) validateSheet(ev.children, depth + 1, out, underTrigger || trigs.length > 0);
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
  'setSize.value': 'A number of pixels, or a calculation like (water / goal) * 300.',
  'setText.value': 'The text to show. Put words in "quotes" and join pieces with &, e.g. "Total: " & minutes',
  'setSlider.value': "A number between the slider's smallest and largest. " + NUM_OR_CALC,
  'setInst.value': 'The new value: a number, "text in quotes", or a calculation like done + 1.',
  'addToInst.value': 'How much to add. ' + NUM_OR_CALC,
  'setVar.value': 'The new value: a number, "text in quotes", or a calculation like score + 1.',
  'addTo.value': 'How much to add. ' + NUM_OR_CALC,
  'subtractFrom.value': 'How much to take away. ' + NUM_OR_CALC,
};
for (const table of [CONDITIONS, ACTIONS]) {
  for (const [id, e] of Object.entries(table)) {
    for (const p of e.params) if (p.type === 'expr') p.help = PARAM_HELP[`${id}.${p.name}`] || 'A value: a number, "text in quotes", a variable, or a calculation.';
  }
}

// true if any event on a screen reacts to the keyboard (the preview then asks the user to click it first)
export function usesKeys(events = []) {
  return events.some((ev) => (ev.conds || []).some((c) => CONDITIONS[c.type]?.keyed || c.type === 'keyHeld') || usesKeys(ev.children));
}
