// Functions (Level 4): named, whole-app pieces of event sheet with parameters, as in Construct.
//
//   project.functions = [{ id, name, params: [name], copyPicked?: true, events: [event] }]
//
// A function starts as a list of actions: one event with no conditions ("when called, do ..."). With the
// functionLogic switch on (core/features.js) its body can be a small event sheet (conditions, sub-events, Else).
// It is called by the action "Call SaveEntry with text = ..." or, once it sets a return value, as a value:
// Total(price, qty). Parameters have no type (like variables) and are plain names inside it. Objects are matched
// by name, like the All screens sheet: an action on an object the calling screen doesn't have is skipped there.
// No DOM in here.
import { newEvent, uid } from './project.js';

export const functionsOf = (project) => project?.functions || [];
export const findFunction = (project, name) => functionsOf(project).find((f) => f.name === name);
export const functionById = (project, id) => functionsOf(project).find((f) => f.id === id);

export function newFunction(project, base = 'MyFunction') {
  const taken = new Set(functionsOf(project).map((f) => f.name));
  let name = base, n = 2;
  while (taken.has(name)) name = base + n++;
  const fn = { id: uid('f'), name, params: [], events: [newEvent()] };
  (project.functions ||= []).push(fn);
  return fn;
}

// a plain list of actions: what students see first (no conditions, sub-events or Else)
export function isSequence(fn) {
  const evs = fn?.events || [];
  return evs.length <= 1 && !evs.some((ev) => ev.else || (ev.conds || []).length || (ev.children || []).length);
}

// every event in a list, sub-events included
function* allEvents(events) {
  for (const ev of events || []) { yield ev; yield* allEvents(ev.children); }
}
// every sheet in the project: [{ events, where }]
export function allSheets(project) {
  return [
    ...(project.screens || []).map((s) => ({ events: s.events, where: s.name })),
    { events: project.allScreens?.events || [], where: 'All screens' },
    ...functionsOf(project).map((f) => ({ events: f.events, where: f.name })),
  ];
}
// the functions an expression calls by name: Total(price, qty)
export function callsInExpr(src, names) {
  const out = [];
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  const text = String(src ?? '').replace(/"[^"“”]*["“”]?|[“”][^"“”]*["“”]?/g, '""'); // not inside "text"
  let m;
  while ((m = re.exec(text))) if (names.has(m[1])) out.push(m[1]);
  return out;
}

// Where a function is used, as words for a "still used by" note: ['Home', 'All screens', 'Finish']
export function functionUsers(project, name) {
  const out = new Set();
  const names = new Set([name]);
  for (const { events, where } of allSheets(project)) {
    for (const ev of allEvents(events)) {
      for (const it of [...(ev.conds || []), ...(ev.actions || [])]) {
        if (it.type === 'callFunction' && it.fn === name) out.add(where);
        for (const v of Object.values(it)) {
          if (typeof v === 'string' && callsInExpr(v, names).length) out.add(where);
          else if (v && typeof v === 'object') for (const x of Object.values(v)) if (typeof x === 'string' && callsInExpr(x, names).length) out.add(where);
        }
      }
    }
  }
  return [...out];
}

// true if any function sets a return value (the editor then keeps offering it)
export const usesReturn = (project) => functionsOf(project).some((f) => [...allEvents(f.events)].some((ev) => (ev.actions || []).some((a) => a.type === 'setReturn')));
// every parameter name of every function (a whole-app variable can't take one)
export const paramNames = (project) => functionsOf(project).flatMap((f) => f.params);
