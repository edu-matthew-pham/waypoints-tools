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

const obj = (extra = {}) => ({ name: 'target', type: 'object', ...extra });
const expr = (name = 'value') => ({ name, type: 'expr' });

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
      default: out[prm.name] = '';
    }
  }
  return out;
}

// Structural checks the editor shows as warnings. Returns [{ id, message }].
export function validateSheet(events, depth = 0, out = []) {
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
    prevOk = ev.else ? prevOk : trigs.length === 0;
    if (ev.children?.length) validateSheet(ev.children, depth + 1, out);
  }
  return out;
}
