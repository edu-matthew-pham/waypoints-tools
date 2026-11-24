// One small popup menu used everywhere (sidebar, stage, event sheet): opened from a "..." button,
// a right-click, or the Menu key. Esc / click outside closes it; arrow keys move between items.
//   openMenu({ x, y, items, returnFocus })    items: [{ label, fn, danger, disabled } | null]
import { h } from './dom.js';

export function openMenu({ x, y, items, returnFocus }) {
  document.querySelector('.popmenu')?.remove();
  const list = items.filter(Boolean);
  if (!list.length) return;
  const close = (refocus) => {
    menu.remove();
    document.removeEventListener('pointerdown', onDoc, true);
    document.removeEventListener('keydown', onKey, true);
    if (refocus) returnFocus?.focus?.();
  };
  const onDoc = (e) => { if (!menu.contains(e.target)) close(false); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const btns = [...menu.querySelectorAll('button:not(:disabled)')];
      const i = btns.indexOf(document.activeElement);
      btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
    }
  };
  const menu = h('div', { class: 'popmenu', role: 'menu' },
    list.map((it) => h('button', { class: 'pm-item' + (it.danger ? ' danger' : ''), type: 'button', role: 'menuitem', disabled: !!it.disabled,
      onclick: () => { close(false); it.fn(); } }, it.label)));
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  document.addEventListener('pointerdown', onDoc, true);
  document.addEventListener('keydown', onKey, true);
  menu.querySelector('button:not(:disabled)')?.focus();
}
