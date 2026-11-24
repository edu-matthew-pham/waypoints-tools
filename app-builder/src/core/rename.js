// Renaming that keeps the app working: every event and expression that mentions the old name is updated.
// Expressions are rewritten token by token (text in "quotes" is never touched).
import { CONDITIONS, ACTIONS } from './catalog.js';
import { highlight, FUNCTION_NAMES } from './expr.js';
import { isIdentifier } from './project.js';

const RESERVED = new Set([...FUNCTION_NAMES(), 'true', 'false', 'and', 'or', 'not']);

// Why a new name can't be used, or '' if it's fine. taken = names already in use.
export function nameProblem(name, taken) {
  if (!name) return 'Type a name';
  if (!isIdentifier(name)) return 'Use letters, numbers and _ only, and don’t start with a number';
  if (RESERVED.has(name)) return `"${name}" is a built-in word; pick another name`;
  if (taken.includes(name)) return `There is already something called ${name}`;
  return '';
}

function rewrite(src, fn) {
  return highlight(String(src ?? '')).map(([k, t]) => (k === 'name' ? fn(t) : t)).join('');
}

// visit every condition/action in a list of events (and sub-events)
function eachItem(events, cb) {
  for (const ev of events || []) {
    for (const c of ev.conds || []) cb(c, CONDITIONS[c.type]);
    for (const a of ev.actions || []) cb(a, ACTIONS[a.type]);
    eachItem(ev.children, cb);
  }
}
const exprParams = (entry) => (entry?.params || []).filter((p) => p.type === 'expr');

export function renameVariable(project, from, to) {
  const v = project.variables.find((x) => x.name === from);
  if (!v) return;
  v.name = to;
  for (const s of project.screens) {
    for (const o of s.objects) for (const i of o.instances) if (i.source === from) i.source = to; // List components showing it
    eachItem(s.events, (item, entry) => {
      for (const p of entry?.params || []) if ((p.type === 'variable' || p.type === 'list') && item[p.name] === from) item[p.name] = to;
      for (const p of exprParams(entry)) item[p.name] = rewrite(item[p.name], (t) => (t === from ? to : t));
    });
  }
}

export function renameObject(screen, from, to) {
  const o = screen.objects.find((x) => x.name === from);
  if (!o) return;
  o.name = to;
  eachItem(screen.events, (item, entry) => {
    for (const p of entry?.params || []) if (p.type === 'object' && item[p.name] === from) item[p.name] = to;
    for (const p of exprParams(entry)) item[p.name] = rewrite(item[p.name], (t) => (t.startsWith(from + '.') ? to + t.slice(from.length) : t));
  });
}

// an object's own variable (instance variable)
export function renameInstVar(screen, objName, from, to) {
  const o = screen.objects.find((x) => x.name === objName);
  const iv = o?.instanceVars.find((x) => x.name === from);
  if (!iv) return;
  iv.name = to;
  for (const inst of o.instances) if (inst.vars && from in inst.vars) { inst.vars[to] = inst.vars[from]; delete inst.vars[from]; }
  eachItem(screen.events, (item, entry) => {
    const objP = (entry?.params || []).find((p) => p.type === 'object');
    for (const p of entry?.params || []) if (p.type === 'instVar' && objP && item[objP.name] === objName && item[p.name] === from) item[p.name] = to;
    for (const p of exprParams(entry)) item[p.name] = rewrite(item[p.name], (t) => (t === `${objName}.${from}` ? `${objName}.${to}` : t));
  });
}
