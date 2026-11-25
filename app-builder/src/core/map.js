// The app's map: which screen goes to which, worked out from the events (never drawn by hand).
// Each "Go to screen" action is a link from the screen it is on to its target, labelled with the
// conditions it sits under (its parents' too), the way the event sheet reads them.
// Pure data, so the Map tab, tests and lesson checks share it.
//
//   screenMap(project) -> {
//     screens: [{ id, name, first, reachable, deadEnd, depth, links: [{ to, label }], broken: [label] }],
//     links: [{ from, to, labels: [..] }],     one per pair of screens (several events can make the same link)
//   }
// first: the first screen in the list, where a finished app starts.
// reachable: some chain of links leads to it from the first screen.
// deadEnd: there are other screens but nothing on this one goes to any of them.
// depth: fewest links from the first screen (null if not reachable); the map lays screens out by it.
// broken: links to a screen that no longer exists.
import { itemText } from './sheet-text.js';

function walk(events, path, screens, out) {
  for (const ev of events || []) {
    const conds = (ev.conds || []).map((c) => itemText('cond', c, screens));
    const here = [...path, ...(ev.else ? ['otherwise'] : []), ...conds];
    for (const a of ev.actions || []) if (a.type === 'goToScreen') out.push({ to: a.screen, label: here.join(', ') || 'all the time' });
    walk(ev.children, here, screens, out);
  }
}

export function screenMap(project) {
  const all = project.screens || [];
  const ids = new Set(all.map((s) => s.id));
  const screens = all.map((s, i) => {
    const found = [];
    walk(s.events, [], all, found);
    return {
      id: s.id, name: s.name, first: i === 0,
      links: found.filter((l) => ids.has(l.to)),
      broken: found.filter((l) => !ids.has(l.to)).map((l) => l.label),
    };
  });
  const byId = new Map(screens.map((s) => [s.id, s]));
  // fewest links from the first screen
  const depth = new Map(screens.length ? [[screens[0].id, 0]] : []);
  const queue = screens.length ? [screens[0].id] : [];
  while (queue.length) {
    const id = queue.shift();
    for (const l of byId.get(id).links) if (!depth.has(l.to)) { depth.set(l.to, depth.get(id) + 1); queue.push(l.to); }
  }
  const links = new Map();
  for (const s of screens) {
    s.reachable = depth.has(s.id);
    s.depth = s.reachable ? depth.get(s.id) : null;
    s.deadEnd = screens.length > 1 && !s.links.some((l) => l.to !== s.id);
    for (const l of s.links) {
      if (l.to === s.id) continue; // going to the screen you are on restarts it; not drawn as an arrow
      const key = s.id + '>' + l.to;
      if (!links.has(key)) links.set(key, { from: s.id, to: l.to, labels: [] });
      if (!links.get(key).labels.includes(l.label)) links.get(key).labels.push(l.label);
    }
  }
  return { screens, links: [...links.values()] };
}

// Plain-language notes for the whole map, e.g. for a lesson check or the map's own summary line.
export function mapProblems(map) {
  const out = [];
  for (const s of map.screens) {
    if (!s.reachable && s.deadEnd) out.push(`${s.name} isn’t linked to any other screen yet.`);
    else if (!s.reachable) out.push(`Nothing goes to ${s.name}, so the app can never show it.`);
    else if (s.deadEnd) out.push(`${s.name} has no way out to another screen.`);
    if (s.broken.length) out.push(`${s.name} goes to a screen that has been deleted.`);
  }
  return out;
}
