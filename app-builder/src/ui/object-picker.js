// "Add an object" dialog: a grid of tiles (icon, name, one-line hint) grouped like Construct's picker.
// Only components the current level / lesson allows are shown; a search box appears once there are many.
import { h } from './dom.js';
import { modal } from './sheet-dialogs.js';
import { COMPONENTS, CATEGORIES } from '../core/components.js';
import { ICONS, FALLBACK_ICON } from './component-ui.js';

export function openObjectPicker({ allowed, onPick }) {
  const list = allowed.map((id) => COMPONENTS[id]).filter(Boolean);
  const body = h('div', { class: 'op' });
  let m;
  const tile = (c) => {
    const icon = h('span', { class: 'op-icon' });
    icon.innerHTML = ICONS[c.id] || FALLBACK_ICON;
    return h('button', { class: 'op-tile', type: 'button', onclick: () => { m.close(); onPick(c.id); } },
      icon, h('strong', {}, c.label), h('small', {}, c.hint));
  };
  const draw = (q = '') => {
    body.replaceChildren();
    const shown = list.filter((c) => (c.label + ' ' + c.hint).toLowerCase().includes(q.toLowerCase()));
    for (const cat of CATEGORIES) {
      const inCat = shown.filter((c) => c.category === cat);
      if (!inCat.length) continue;
      // with only one section there is nothing to separate, so skip the heading
      if (new Set(list.map((c) => c.category)).size > 1) body.append(h('div', { class: 'es-cat' }, cat));
      body.append(h('div', { class: 'op-grid' }, inCat.map(tile)));
    }
    if (!shown.length) body.append(h('p', { class: 'muted' }, 'Nothing matches.'));
  };
  const parts = [];
  if (list.length > 8) {
    const search = h('input', { class: 'ctl', type: 'search', placeholder: 'Search objects…', 'aria-label': 'Search objects', oninput: () => draw(search.value) });
    parts.push(search);
  }
  parts.push(body);
  m = modal('Add an object', parts);
  // arrow keys move between tiles
  m.dlg.addEventListener('keydown', (e) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 'down', ArrowUp: 'up' };
    if (!(e.key in keys)) return;
    const tiles = [...m.dlg.querySelectorAll('.op-tile')];
    const i = tiles.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    let j = i;
    if (typeof keys[e.key] === 'number') j = i + keys[e.key];
    else {
      const dir = keys[e.key] === 'down' ? 1 : -1;
      const x = tiles[i].offsetLeft;
      for (let k = i + dir; k >= 0 && k < tiles.length; k += dir) if (tiles[k].offsetTop !== tiles[i].offsetTop && Math.abs(tiles[k].offsetLeft - x) < 8) { j = k; break; }
    }
    tiles[Math.max(0, Math.min(tiles.length - 1, j))].focus();
  });
  draw();
  (m.dlg.querySelector('input') || m.dlg.querySelector('.op-tile'))?.focus();
}
