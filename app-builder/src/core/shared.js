// The All screens sheet: one extra event sheet whose events run on every screen, before that screen's own.
// Objects are matched by name: "HomeButton is clicked → Go to screen Home" works on every screen that has a
// HomeButton. An event that mentions an object the current screen doesn't have is skipped on that screen,
// quietly (it isn't a mistake). Decided per top-level event, sub-events included. No DOM in here.
//
//   project.allScreens = { events: [event] }
import { CONDITIONS, ACTIONS } from './catalog.js';
import { highlight } from './expr.js';

export const allScreensEvents = (project) => project?.allScreens?.events || [];
export const hasSharedEvents = (project) => allScreensEvents(project).length > 0;

// every object name on any screen
export function objectNames(project) {
  return new Set((project.screens || []).flatMap((s) => (s.objects || []).map((o) => o.name)));
}

// The object names an event (and its sub-events) mentions: object params, plus Name.x in value boxes.
// Only names that are objects somewhere count, so LoopItem.x, ClickedItem.x and table rows aren't mistaken for objects.
export function objectsMentioned(ev, known) {
  const out = new Set();
  const fromExpr = (src) => {
    for (const [k, t] of highlight(String(src ?? ''))) {
      if (k !== 'name') continue;
      const dot = t.indexOf('.');
      if (dot > 0 && known.has(t.slice(0, dot))) out.add(t.slice(0, dot)); // a plain name is a variable, never an object
    }
  };
  const visit = (item, entry) => {
    for (const p of entry?.params || []) {
      if (p.type === 'object' && item[p.name]) out.add(item[p.name]);
      else if (p.type === 'expr') fromExpr(item[p.name]);
      else if (p.type === 'fields') for (const v of Object.values(item[p.name] || {})) fromExpr(v);
    }
  };
  (function walk(e) {
    for (const c of e.conds || []) visit(c, CONDITIONS[c.type]);
    for (const a of e.actions || []) visit(a, ACTIONS[a.type]);
    for (const ch of e.children || []) walk(ch);
  })(ev);
  return out;
}

// the shared events that run on this screen: those whose objects all exist on it
export function sharedEventsFor(project, screen) {
  const events = allScreensEvents(project);
  if (!events.length) return [];
  const known = objectNames(project);
  const here = new Set((screen?.objects || []).map((o) => o.name));
  return events.filter((ev) => [...objectsMentioned(ev, known)].every((n) => here.has(n)));
}

// A stand-in screen with every object in the app (one per name, object variables merged), so the All screens
// sheet can offer and check any object. Used only for editing scope, never run.
export function allObjectsScreen(project) {
  const byName = new Map();
  for (const s of project.screens || []) {
    for (const o of s.objects || []) {
      const have = byName.get(o.name);
      if (!have) { byName.set(o.name, { ...o, instanceVars: [...(o.instanceVars || [])] }); continue; }
      for (const iv of o.instanceVars || []) if (!have.instanceVars.some((x) => x.name === iv.name)) have.instanceVars.push(iv);
    }
  }
  return { id: '__all', name: 'All screens', objects: [...byName.values()], events: allScreensEvents(project) };
}
