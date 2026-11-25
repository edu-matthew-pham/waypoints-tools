// Renaming that keeps the app working: every event and expression that mentions the old name is updated.
// Expressions are rewritten token by token (text in "quotes" is never touched).
import { CONDITIONS, ACTIONS } from './catalog.js';
import { highlight, FUNCTION_NAMES, LOOP_NAMES } from './expr.js';
import { isIdentifier } from './project.js';
import { allScreensEvents, objectNames } from './shared.js';
import { functionsOf, findFunction } from './functions.js';

// The sheets whose objects are matched by name (any screen's): the All screens sheet and every function's body
const wholeAppSheets = (project) => [allScreensEvents(project), ...functionsOf(project).map((f) => f.events)];
// each sheet's events with the object names its expressions can mean: every screen, then the whole-app sheets
const sheets = (project) => {
  const all = objectNames(project);
  return [
    ...project.screens.map((s) => ({ events: s.events, objects: new Set(s.objects.map((o) => o.name)) })),
    ...wholeAppSheets(project).map((events) => ({ events, objects: all })),
  ];
};

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
// rewrite every value box of an item: expr params and the per-field boxes of "Add a row"
function eachExpr(item, entry, fn) {
  for (const p of exprParams(entry)) item[p.name] = fn(item[p.name]);
  for (const p of (entry?.params || []).filter((x) => x.type === 'fields')) {
    const vals = item[p.name] || {};
    for (const k of Object.keys(vals)) vals[k] = fn(vals[k]);
  }
}

export function renameVariable(project, from, to) {
  const v = project.variables.find((x) => x.name === from);
  if (!v) return;
  v.name = to;
  for (const t of project.variables) for (const f of t.table?.fields || []) if (f.type === 'link' && f.to === from) f.to = to;
  for (const s of project.screens) for (const o of s.objects) for (const i of o.instances) if (i.source === from) i.source = to; // List and Table components showing it
  for (const { events, objects } of sheets(project)) {
    eachItem(events, (item, entry) => {
      for (const p of entry?.params || []) if (['variable', 'list', 'table'].includes(p.type) && item[p.name] === from) item[p.name] = to;
      eachExpr(item, entry, (src) => rewrite(src, (t) => (t === from ? to : t.startsWith(from + '.') && !objects.has(from) ? to + t.slice(from.length) : t)));
    });
  }
}

// project (optional): the All screens sheet and functions follow too, but only if no other screen still has an object
// called from (objects there are matched by name, so the others would lose their shared events).
export function renameObject(screen, from, to, project) {
  const o = screen.objects.find((x) => x.name === from);
  if (!o) return;
  o.name = to;
  const fix = (events) => eachItem(events, (item, entry) => {
    for (const p of entry?.params || []) if (p.type === 'object' && item[p.name] === from) item[p.name] = to;
    eachExpr(item, entry, (src) => rewrite(src, (t) => (t.startsWith(from + '.') ? to + t.slice(from.length) : t)));
  });
  fix(screen.events);
  if (project && !project.screens.some((s) => s !== screen && s.objects.some((x) => x.name === from))) wholeAppSheets(project).forEach(fix);
}

// an object's own variable (instance variable)
// project (optional): the All screens sheet follows too, unless another screen's objName still has a variable called from
export function renameInstVar(screen, objName, from, to, project) {
  const o = screen.objects.find((x) => x.name === objName);
  const iv = o?.instanceVars.find((x) => x.name === from);
  if (!iv) return;
  iv.name = to;
  for (const inst of o.instances) if (inst.vars && from in inst.vars) { inst.vars[to] = inst.vars[from]; delete inst.vars[from]; }
  const fix = (events) => eachItem(events, (item, entry) => {
    const objP = (entry?.params || []).find((p) => p.type === 'object');
    for (const p of entry?.params || []) if (p.type === 'instVar' && objP && item[objP.name] === objName && item[p.name] === from) item[p.name] = to;
    eachExpr(item, entry, (src) => rewrite(src, (t) => (t === `${objName}.${from}` ? `${objName}.${to}` : t)));
  });
  fix(screen.events);
  const stillThere = (s) => s !== screen && s.objects.some((x) => x.name === objName && x.instanceVars.some((v) => v.name === from));
  if (project && !project.screens.some(stillThere)) wholeAppSheets(project).forEach(fix);
}

// A field of a table. Its rows, the Table objects showing it, the actions that name it and every
// ".field" in a value box are updated. A ".field" on a row is changed wherever the name before the dot isn't
// an object (LoopItem.artist, ClickedItem.artist, item(Songs, 1).artist), so another table's field with the same
// name changes too: rename fields that are only in one table, or check those boxes after.
export function renameField(project, tableName, from, to) {
  const v = project.variables.find((x) => x.name === tableName && x.table);
  const f = v?.table.fields.find((x) => x.name === from);
  if (!f) return;
  f.name = to;
  v.value = v.value.map((r) => Object.fromEntries(Object.entries(r).map(([k, x]) => [k === from ? to : k, x])));
  for (const s of project.screens) for (const o of s.objects) for (const i of o.instances) if (i.source === tableName && i.columns) i.columns = i.columns.split(',').map((c) => (c.trim() === from ? to : c.trim())).join(', ');
  for (const { events, objects } of sheets(project)) {
    eachItem(events, (item, entry) => {
      const t = (entry?.params || []).find((p) => p.type === 'table');
      if (t && item[t.name] === tableName) {
        for (const p of entry.params) {
          if (p.type === 'field' && item[p.name] === from) item[p.name] = to;
          if (p.type === 'fields' && item[p.name] && from in item[p.name]) { item[p.name][to] = item[p.name][from]; delete item[p.name][from]; }
        }
      }
      eachExpr(item, entry, (src) => {
        const toks = highlight(String(src ?? ''));
        return toks.map(([k, tok], i) => {
          if (k !== 'name') return tok;
          const dot = tok.indexOf('.');
          if (dot > 0 && tok.slice(dot + 1) === from && !objects.has(tok.slice(0, dot))) return tok.slice(0, dot + 1) + to;
          if (dot < 0 && tok === from && toks[i - 1]?.[1] === '.') return to; // item(Songs, 1).artist
          return tok;
        }).join('');
      });
    });
  }
}

// A function. Every "Call" action naming it and every use as a value, Total(price, qty), follows.
export function renameFunction(project, from, to) {
  const f = findFunction(project, from);
  if (!f) return;
  f.name = to;
  for (const { events } of sheets(project)) {
    eachItem(events, (item, entry) => {
      for (const p of entry?.params || []) if (p.type === 'function' && item[p.name] === from) item[p.name] = to;
      eachExpr(item, entry, (src) => highlight(String(src ?? '')).map(([k, t]) => (k === 'fn' && t === from ? to : t)).join(''));
    });
  }
}

// A parameter of a function. Its uses inside the function (text, or row.field when it holds a row) follow, and
// every call's value for it keeps its place.
export function renameParam(project, fnName, from, to) {
  const f = findFunction(project, fnName);
  const i = f ? f.params.indexOf(from) : -1;
  if (i < 0) return;
  f.params[i] = to;
  eachItem(f.events, (item, entry) => eachExpr(item, entry, (src) => rewrite(src, (t) => (t === from ? to : t.startsWith(from + '.') ? to + t.slice(from.length) : t))));
  for (const { events } of sheets(project)) {
    eachItem(events, (item) => {
      if (item.type !== 'callFunction' || item.fn !== fnName || !item.args || !(from in item.args)) return;
      item.args = Object.fromEntries(Object.entries(item.args).map(([k, v]) => [k === from ? to : k, v]));
    });
  }
}

// Add or remove a parameter. Calls get an empty box for a new one (flagged until filled); a removed one's value goes.
export function addParam(project, fnName, name) {
  const f = findFunction(project, fnName);
  if (f && !f.params.includes(name)) f.params.push(name);
}
export function removeParam(project, fnName, name) {
  const f = findFunction(project, fnName);
  if (!f) return;
  f.params = f.params.filter((p) => p !== name);
  for (const { events } of sheets(project)) eachItem(events, (item) => { if (item.type === 'callFunction' && item.fn === fnName && item.args) delete item.args[name]; });
}

// Names a new function can't have: other functions, whole-app variables, objects (they would read the same in code)
export const functionNamesTaken = (project, except) => [
  ...functionsOf(project).map((f) => f.name).filter((n) => n !== except),
  ...project.variables.map((v) => v.name), ...objectNames(project),
];
// Names a parameter can't have: the function's other parameters, whole-app variables, objects, and the loop names
export const paramNamesTaken = (project, fn, except) => [
  ...fn.params.filter((n) => n !== except),
  ...project.variables.map((v) => v.name), ...objectNames(project), ...LOOP_NAMES,
];
