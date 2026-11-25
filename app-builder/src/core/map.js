// The app's map: which screen goes to which, worked out from the events (never drawn by hand).
// Each "Go to screen" action is a link from the screen it is on to its target, labelled with the
// conditions it sits under (its parents' too), the way the event sheet reads them.
// Pure data, so the Map tab, tests and lesson checks share it.
//
//   screenMap(project) -> {
//     screens: [{ id, name, first, reachable, deadEnd, depth, links: [{ to, label, kind }], broken: [label] }],
//     links: [{ from, to, labels: [..], kinds: [..] }],   one per pair of screens (several events can make the same link);
//                                                        kinds[i] is what starts labels[i] (WAY_KINDS)
//   }
// first: the first screen in the list, where a finished app starts.
// reachable: some chain of links leads to it from the first screen.
// deadEnd: there are other screens but nothing on this one goes to any of them.
// depth: fewest links from the first screen (null if not reachable); the map lays screens out by it.
// broken: links to a screen that no longer exists.
// A Go to screen on the All screens sheet is a link from every screen it runs on, its label ending "(all screens)".
import { itemText } from './sheet-text.js';
import { CONDITIONS } from './catalog.js';
import { sharedEventsFor } from './shared.js';

// What kind of thing starts an event, in words for the map's summary ("6 ways: 4 clicks, 1 timer, 1 check").
// Decided by the first trigger in the event or its parents; with no trigger, it is a test checked every tick.
export const WAY_KINDS = {
  click: ['click', 'clicks'], key: ['key', 'keys'], timer: ['timer', 'timers'], start: ['on start', 'on start'],
  change: ['change', 'changes'], media: ['media end', 'media ends'], check: ['check', 'checks'],
};
const KIND_OF_TRIGGER = {
  clicked: 'click', pressed: 'click', released: 'click', itemClicked: 'click',
  keyDown: 'key', keyUp: 'key', timer: 'timer', start: 'start',
  changed: 'change', submitted: 'change', ended: 'media',
};
const wayKind = (conds) => {
  for (const c of conds) { const t = CONDITIONS[c.type]?.trigger; if (t) return KIND_OF_TRIGGER[t] || 'check'; }
  return 'check';
};

function walk(events, path, screens, out, tag = '') {
  for (const ev of events || []) {
    const conds = [...path.conds, ...(ev.conds || [])];
    const words = [...path.words, ...(ev.else ? ['otherwise'] : []), ...(ev.conds || []).map((c) => itemText('cond', c, screens))];
    for (const a of ev.actions || []) if (a.type === 'goToScreen') out.push({ to: a.screen, label: (words.join(', ') || 'all the time') + tag, kind: wayKind(conds) });
    walk(ev.children, { conds, words }, screens, out, tag);
  }
}

// The words on an arrow: its one label, or a count of each kind ("6 ways: 4 clicks, 1 timer, 1 check").
export function linkSummary(link) {
  if (link.labels.length === 1) return link.labels[0];
  const counts = new Map();
  for (const k of link.kinds) counts.set(k, (counts.get(k) || 0) + 1);
  const parts = Object.keys(WAY_KINDS).filter((k) => counts.has(k)).map((k) => `${counts.get(k)} ${WAY_KINDS[k][counts.get(k) === 1 ? 0 : 1]}`);
  return `${link.labels.length} ways: ${parts.join(', ')}`;
}

export function screenMap(project) {
  const all = project.screens || [];
  const ids = new Set(all.map((s) => s.id));
  const screens = all.map((s, i) => {
    const found = [];
    walk(sharedEventsFor(project, s), { conds: [], words: [] }, all, found, ' (all screens)');
    walk(s.events, { conds: [], words: [] }, all, found);
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
      if (!links.has(key)) links.set(key, { from: s.id, to: l.to, labels: [], kinds: [] });
      const link = links.get(key);
      if (!link.labels.includes(l.label)) { link.labels.push(l.label); link.kinds.push(l.kind); }
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
