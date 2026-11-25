// Map tab: every screen as a small picture, with arrows for the ways between them.
// Read-only for links: arrows come only from "Go to screen" actions in the events (core/map.js), so the map
// can never disagree with the app. Click a screen to open it; Add screen makes a new, empty one.
// A tool, not a method: it shows what exists, whether a class plans screens first or builds one at a time.
import { h } from '../ui/dom.js';
import { Stage } from '../ui/stage.js';
import { screenItems } from '../ui/screen-items.js';
import { screenMap, mapProblems } from '../core/map.js';
import { sizeOf } from '../core/project.js';
import { addScreen } from '../panels/side.js';
import { S, hooks } from '../state.js';

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
};
const THUMB_W = 180, THUMB_H = 150;
const short = (s, n = 22) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function initMap(root) {
  const bar = h('div', { class: 'map-bar' });
  const board = h('div', { class: 'map-board' });
  const arrows = svg('svg', { class: 'map-arrows', 'aria-hidden': 'true' });
  root.append(bar, board);
  let active = false, map = null;
  const cards = new Map(); // screen id -> card element
  const colOf = new Map(); // screen id -> which column it is drawn in

  const open = (id) => { S.screenId = id; S.selId = null; hooks.setTab('design'); };
  // Pressing on a screen can finish a rename in the side panel, which redraws the map under the pointer,
  // so a plain click would be lost: remember which screen was pressed and open it when the press ends there.
  let pressed = null;
  board.addEventListener('pointerdown', (e) => { pressed = e.button === 0 ? e.target.closest('.map-thumb')?.dataset.id : null; });
  board.addEventListener('pointerup', (e) => {
    const id = e.target.closest('.map-thumb')?.dataset.id;
    if (id && id === pressed) open(id);
    pressed = null;
  });

  function thumb(sc) {
    const size = sizeOf(S.project);
    const host = h('div', { class: 'stage-host map-thumb-stage' });
    const stage = new Stage(host, { design: true });
    stage.setSize(size);
    stage.sync(screenItems(S.project, sc));
    const s = Math.min(THUMB_W / size.w, THUMB_H / size.h);
    stage.el.style.transform = `scale(${s})`;
    host.style.width = size.w * s + 'px';
    host.style.height = size.h * s + 'px';
    return host;
  }

  function card(info, sc) {
    const nameOf = (id) => S.project.screens.find((x) => x.id === id)?.name ?? '?';
    const flags = [
      info.first ? h('span', { class: 'map-flag start', title: 'The app starts here (the first screen in the list)' }, 'Start') : null,
      !info.reachable && info.deadEnd ? h('span', { class: 'map-flag warn', title: 'No Go to screen action leads here, and nothing here goes to another screen' }, 'Not linked yet')
        : !info.reachable ? h('span', { class: 'map-flag warn', title: 'No chain of Go to screen actions leads here from the start screen' }, 'Can’t be reached') : null,
      info.deadEnd && info.reachable ? h('span', { class: 'map-flag warn', title: 'Nothing on this screen goes to another screen' }, 'No way out') : null,
      info.broken.length ? h('span', { class: 'map-flag warn', title: 'A Go to screen action points at a screen that was deleted' }, 'Goes to a deleted screen') : null,
    ];
    const ways = info.links.filter((l) => l.to !== info.id);
    const el = h('div', { class: 'map-card' + (info.reachable ? '' : ' unreached') + (sc.id === S.screenId ? ' current' : ''), 'data-ab': 'map-card:' + sc.name },
      h('div', { class: 'map-card-head' }, h('strong', {}, sc.name), ...flags),
      h('button', { class: 'map-thumb', type: 'button', 'data-id': sc.id, 'data-ab': 'map-open:' + sc.name, title: 'Open ' + sc.name, 'aria-label': 'Open ' + sc.name }, thumb(sc)),
      ways.length
        ? h('ul', { class: 'map-ways' }, ways.map((l) => h('li', {}, '→ ', h('strong', {}, nameOf(l.to)), h('span', { class: 'muted' }, ' \u00b7 ' + l.label))))
        : h('p', { class: 'muted small map-ways' }, 'Doesn’t go anywhere yet.'));
    el.querySelector('.map-thumb').addEventListener('click', (e) => { if (e.detail === 0) open(sc.id); }); // keyboard; pointers below
    return el;
  }

  function render() {
    if (!active) return;
    map = screenMap(S.project);
    const problems = mapProblems(map);
    const one = map.screens.length === 1;
    bar.replaceChildren(
      h('p', { class: 'hint' }, 'Every screen in your app. The arrows come from your events: each Go to screen action makes one. Click a screen to open it.'),
      h('div', { class: 'map-tools' },
        h('button', { class: 'btn', type: 'button', 'data-ab': 'map-add-screen', title: 'Add a new, empty screen. You can name it now and fill it in later.', onclick: () => addScreen() }, '+ Add screen'),
        h('span', { class: 'muted' }, one ? 'Only one screen so far.'
          : problems.length ? '' : 'Every screen can be reached, and each one has a way out.')),
      problems.length ? h('ul', { class: 'map-problems' }, problems.map((p) => h('li', {}, p))) : '');

    // columns: how many steps from the start screen; screens nothing leads to go last
    const cols = [];
    for (const info of map.screens) {
      const c = info.reachable ? info.depth : 'none';
      let col = cols.find((x) => x.key === c);
      if (!col) cols.push(col = { key: c, items: [] });
      col.items.push(info);
    }
    cols.sort((a, b) => (a.key === 'none') - (b.key === 'none') || a.key - b.key);
    cards.clear();
    colOf.clear();
    cols.forEach((col, i) => col.items.forEach((info) => colOf.set(info.id, i)));
    board.replaceChildren(arrows, ...cols.map((col) => h('div', { class: 'map-col' + (col.key === 'none' ? ' none' : '') },
      col.key === 'none' ? h('div', { class: 'map-col-head' }, 'Not reached from Start') : null,
      col.items.map((info) => {
        const el = card(info, S.project.screens.find((s) => s.id === info.id));
        cards.set(info.id, el);
        return el;
      }))));
    requestAnimationFrame(draw);
  }

  // where the line from the middle of box r towards (x, y) leaves the box
  const edge = (r, x, y) => {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = x - cx, dy = y - cy;
    const t = Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity, 1);
    return [cx + dx * t, cy + dy * t];
  };

  function draw() {
    if (!active || !map) return;
    const base = board.getBoundingClientRect();
    arrows.setAttribute('width', board.scrollWidth);
    arrows.setAttribute('height', board.scrollHeight);
    const box = (id) => {
      const r = cards.get(id)?.getBoundingClientRect();
      return r && { x: r.left - base.left + board.scrollLeft, y: r.top - base.top + board.scrollTop, w: r.width, h: r.height };
    };
    const kids = [svg('defs', {}, svg('marker', { id: 'map-head', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' },
      svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'map-head' })))];
    let lane = 0;
    // lowest card in the columns from i to j, so a route underneath clears them
    const bottomOf = (i, j) => Math.max(...[...cards.keys()].filter((id) => colOf.get(id) >= Math.min(i, j) && colOf.get(id) <= Math.max(i, j)).map((id) => { const r = box(id); return r.y + r.h; }));
    for (const l of map.links) {
      const a = box(l.from), b = box(l.to);
      if (!a || !b) continue;
      const text = l.labels.length > 1 ? `${l.labels.length} ways` : short(l.labels[0]); // the card lists them all
      const g = (d, x, y, t = text) => svg('g', { class: 'map-link', 'data-from': l.from, 'data-to': l.to },
        svg('title', {}, l.labels.join('\n')),
        svg('path', { d, 'marker-end': 'url(#map-head)' }),
        svg('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, t));
      if (Math.abs(colOf.get(l.from) - colOf.get(l.to)) > 1) {
        // would pass behind the screens in between: go down under all of them, across, and back up
        const low = bottomOf(colOf.get(l.from), colOf.get(l.to)) + 26 + lane++ * 22;
        const sx = a.x + a.w / 2 + 12, ex = b.x + b.w / 2 - 12;
        kids.push(g(`M${sx},${a.y + a.h} C${sx},${low} ${sx},${low} ${(sx + ex) / 2},${low} S${ex},${low} ${ex},${b.y + b.h}`, (sx + ex) / 2, low - 9, l.labels.length > 1 ? text : l.labels[0])); // room for the whole label down here
        continue;
      }
      const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
      const len = Math.hypot(bx - ax, by - ay) || 1;
      // bend to one side, so A → B and B → A are two separate curves
      const bend = Math.min(60, 20 + len * 0.12);
      const cx = (ax + bx) / 2 + ((by - ay) / len) * bend, cy = (ay + by) / 2 - ((bx - ax) / len) * bend;
      const [sx, sy] = edge(a, cx, cy), [ex, ey] = edge(b, cx, cy);
      const mx = 0.25 * sx + 0.5 * cx + 0.25 * ex, my = 0.25 * sy + 0.5 * cy + 0.25 * ey;
      kids.push(g(`M${sx},${sy} Q${cx},${cy} ${ex},${ey}`, mx, my));
    }
    arrows.replaceChildren(...kids);
  }
  new ResizeObserver(() => requestAnimationFrame(draw)).observe(board);

  return {
    render,
    activate() { active = true; render(); },
    deactivate() { active = false; },
  };
}
