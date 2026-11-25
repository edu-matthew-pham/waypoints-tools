// Renders a screen's items as plain DOM inside a phone-shaped stage.
// Dumb on purpose: it is given a list of items and draws them. It knows nothing
// about events. In design mode it also handles select / drag / resize.
//
// item = { id, kind: 'button'|'text'|'input', props: { x, y, w, h, text, visible } }
import { h } from './dom.js';
import { DEVICES } from '../core/project.js';
import { RENDER } from './component-ui.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Stage {
  constructor(host, { design = false, on = {} } = {}) {
    this.design = design;
    this.on = on;
    this.nodes = new Map();
    this.items = new Map();
    this.selected = null;
    this.drag = null;
    this.pick = null;
    this.host = host;
    this.size = DEVICES.web;
    this.scale = 1;
    this.el = h('div', { class: 'stage' + (design ? ' design' : ''), tabindex: '-1' });
    host.append(this.el);
    this.setSize(DEVICES.web);
    this.#wire();
  }

  #wire() {
    if (this.design) {
      this.el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; // right-click opens the context menu; it must not start a drag
        const w = e.target.closest('.w');
        if (!w) { this.on.select?.(null); return; }
        const id = w.dataset.id;
        this.on.select?.(id);
        const it = this.items.get(id);
        if (!it) return;
        this.drag = { id, mode: e.target.closest('.handle') ? 'resize' : 'move', sx: e.clientX, sy: e.clientY, ...it.props, moved: false };
        this.el.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      this.el.addEventListener('pointermove', (e) => {
        const d = this.drag;
        if (!d) return;
        const dx = (e.clientX - d.sx) / this.scale, dy = (e.clientY - d.sy) / this.scale; // the stage may be shown smaller
        if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
        d.moved = true;
        if (d.mode === 'move') this.on.move?.(d.id, { x: clamp(Math.round(d.x + dx), 0, this.size.w - d.w), y: clamp(Math.round(d.y + dy), 0, this.size.h - d.h) });
        else this.on.move?.(d.id, { w: clamp(Math.round(d.w + dx), 24, this.size.w - d.x), h: clamp(Math.round(d.h + dy), 20, this.size.h - d.y) });
      });
      const end = () => { if (this.drag?.moved) this.on.commit?.(); this.drag = null; };
      this.el.addEventListener('pointerup', end);
      this.el.addEventListener('pointercancel', end);
    } else {
      this.el.tabIndex = 0; // the app can be focused, so key events reach it
      this.el.addEventListener('click', (e) => {
        const w = e.target.closest('.w');
        if (this.pick) { e.preventDefault(); e.stopPropagation(); if (w) this.pick(w.dataset.id); return; }
        if (w) this.on.click?.(w.dataset.id);
        const row = e.target.closest('.lst-row');
        if (w && row) this.on.itemClick?.(w.dataset.id, Number(row.dataset.index));
      });
      // sounds and videos report what their players do (media events don't bubble, so listen while capturing)
      for (const type of ['play', 'pause', 'ended']) this.el.addEventListener(type, (e) => {
        const w = e.target.closest?.('.w');
        if (!w || (type === 'pause' && e.target.ended) || e.target.closest('.rec')) return; // the Recorder's own preview isn't an event
        // a trimmed recording (…#t=start,end) pauses at its end instead of ending: report that as ended
        const range = /#t=[\d.]+,([\d.]+)$/.exec(e.target.currentSrc || '');
        if (type === 'pause' && range && e.target.currentTime >= Number(range[1]) - 0.15) { this.on.media?.(w.dataset.id, 'ended'); return; }
        this.on.media?.(w.dataset.id, type);
      }, true);
      this.el.addEventListener('input', (e) => {
        const w = e.target.closest('.w');
        if (!w) return;
        const read = RENDER[this.nodes.get(w.dataset.id)?.kind]?.read;
        this.on.input?.(w.dataset.id, read ? read(e.target) : e.target.value);
      });
      // pressed / released: release goes to the object that was pressed, even if the pointer slid off it
      let pressed = null;
      this.el.addEventListener('pointerdown', (e) => {
        if (this.pick || e.button !== 0) return;
        const w = e.target.closest('.w');
        if (w) { pressed = w.dataset.id; this.on.press?.(pressed); }
      });
      const up = () => { if (pressed) { const id = pressed; pressed = null; this.on.release?.(id); } };
      this.el.addEventListener('pointerup', up);
      this.el.addEventListener('pointercancel', up);
      // keyboard: ignored while typing in a text box (that box has its own events); Enter in a text box = submit
      const typing = (t) => t.tagName === 'INPUT' && t.type === 'text';
      this.el.addEventListener('keydown', (e) => {
        if (this.pick || e.ctrlKey || e.metaKey || e.altKey) return;
        const w = e.target.closest?.('.w');
        if (typing(e.target)) { if (e.key === 'Enter' && w) this.on.submit?.(w.dataset.id); return; }
        this.on.key?.(e.key, true);
        if (e.target === this.el && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault(); // don't scroll the page
      });
      this.el.addEventListener('keyup', (e) => { if (!typing(e.target)) this.on.key?.(e.key, false); });
      this.el.addEventListener('focusin', () => this.el.classList.add('kb-focus'));
      this.el.addEventListener('focusout', (e) => {
        if (this.el.contains(e.relatedTarget)) return;
        this.el.classList.remove('kb-focus');
        this.on.keysReset?.(); // a key released while the app wasn't focused would otherwise stay "held"
      });
    }
  }

  #make(it) {
    const r = RENDER[it.kind] || RENDER.text;
    const inner = r.make(this.design);
    const wrap = h('div', { class: `w w-${it.kind}`, 'data-id': it.id }, inner);
    return { wrap, inner, kind: it.kind };
  }

  sync(items) {
    this.items = new Map(items.map((i) => [i.id, i]));
    for (const it of items) {
      let n = this.nodes.get(it.id);
      if (n && n.kind !== it.kind) { n.wrap.remove(); this.nodes.delete(it.id); n = null; }
      if (!n) { n = this.#make(it); this.nodes.set(it.id, n); this.el.append(n.wrap); }
      if (it.name) n.wrap.dataset.ab = 'widget:' + it.name;
      const p = it.props, s = n.wrap.style;
      s.left = p.x + 'px'; s.top = p.y + 'px'; s.width = p.w + 'px'; s.height = p.h + 'px';
      n.wrap.classList.toggle('hidden', p.visible === false);
      (RENDER[it.kind] || RENDER.text).write(n.inner, p);
    }
    for (const [id, n] of this.nodes) {
      if (!this.items.has(id)) { RENDER[n.kind]?.destroy?.(n.inner); n.wrap.remove(); this.nodes.delete(id); }
    }
    this.#applySelection();
  }

  // App screen size (Web page or Phone).
  setSize(size) {
    if (this.size === size && this.el.style.width) return;
    this.size = size;
    this.el.style.width = size.w + 'px';
    this.el.style.height = size.h + 'px';
    this.el.classList.toggle('phone', size.h > size.w);
    this.#applyScale();
  }
  // Shrink the stage to fit the width of `box` (never enlarge). Clicks and drags still use app pixels.
  fitTo(box, maxHeight = () => Infinity) {
    this.fitBox = box;
    this.maxHeight = maxHeight;
    new ResizeObserver(() => this.#applyScale()).observe(box);
    addEventListener('resize', () => this.#applyScale());
    this.#applyScale();
  }
  #applyScale() {
    const box = this.fitBox;
    const avail = box ? box.clientWidth : this.size.w;
    const s = box ? Math.min(1, avail / this.size.w, this.maxHeight() / this.size.h) : 1;
    this.scale = s > 0 ? s : 1;
    this.el.style.transform = this.scale === 1 ? '' : `scale(${this.scale})`;
    this.host.style.width = this.size.w * this.scale + 'px';
    this.host.style.height = this.size.h * this.scale + 'px';
  }

  // Pick mode: the next click on an item calls cb(id) instead of acting like a user click.
  setPick(cb) { this.pick = cb || null; this.el.classList.toggle('picking', !!cb); }

  setSelected(id) { this.selected = id; this.#applySelection(); }

  #applySelection() {
    for (const [id, n] of this.nodes) {
      const on = this.design && id === this.selected;
      n.wrap.classList.toggle('sel', on);
      const handle = n.wrap.querySelector('.handle');
      if (on && !handle) n.wrap.append(h('div', { class: 'handle', title: 'Drag to resize' }));
      if (!on && handle) handle.remove();
    }
  }

  // an object's picture now (Drawing, Photo): a data: URL, or null
  snapshot(id) { const n = this.nodes.get(id); return (n && RENDER[n.kind]?.snapshot?.(n.inner)) || null; }

  clear() { this.nodes.forEach((n) => { RENDER[n.kind]?.destroy?.(n.inner); n.wrap.remove(); }); this.nodes.clear(); this.items.clear(); }
}
