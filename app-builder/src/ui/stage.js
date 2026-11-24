// Renders a screen's items as plain DOM inside a phone-shaped stage.
// Dumb on purpose: it is given a list of items and draws them. It knows nothing
// about events. In design mode it also handles select / drag / resize.
//
// item = { id, kind: 'button'|'text'|'input', props: { x, y, w, h, text, visible } }
import { h } from './dom.js';
import { STAGE } from '../core/project.js';

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
    this.el = h('div', { class: 'stage' + (design ? ' design' : ''), style: `width:${STAGE.w}px;height:${STAGE.h}px`, tabindex: '-1' });
    host.append(this.el);
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
        const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
        if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
        d.moved = true;
        if (d.mode === 'move') this.on.move?.(d.id, { x: clamp(Math.round(d.x + dx), 0, STAGE.w - d.w), y: clamp(Math.round(d.y + dy), 0, STAGE.h - d.h) });
        else this.on.move?.(d.id, { w: clamp(Math.round(d.w + dx), 24, STAGE.w - d.x), h: clamp(Math.round(d.h + dy), 20, STAGE.h - d.y) });
      });
      const end = () => { if (this.drag?.moved) this.on.commit?.(); this.drag = null; };
      this.el.addEventListener('pointerup', end);
      this.el.addEventListener('pointercancel', end);
    } else {
      this.el.addEventListener('click', (e) => {
        const w = e.target.closest('.w');
        if (this.pick) { e.preventDefault(); e.stopPropagation(); if (w) this.pick(w.dataset.id); return; }
        if (w) this.on.click?.(w.dataset.id);
      });
      this.el.addEventListener('input', (e) => {
        const w = e.target.closest('.w');
        if (w) this.on.input?.(w.dataset.id, e.target.value);
      });
    }
  }

  #make(it) {
    const inner =
      it.kind === 'button' ? h('button', { type: 'button' })
      : it.kind === 'input' ? h('input', { type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: this.design ? 'Text input' : '' })
      : h('div', { class: 't' });
    const wrap = h('div', { class: `w w-${it.kind}`, 'data-id': it.id }, inner);
    return { wrap, inner, kind: it.kind, text: null };
  }

  sync(items) {
    this.items = new Map(items.map((i) => [i.id, i]));
    for (const it of items) {
      let n = this.nodes.get(it.id);
      if (n && n.kind !== it.kind) { n.wrap.remove(); this.nodes.delete(it.id); n = null; }
      if (!n) { n = this.#make(it); this.nodes.set(it.id, n); this.el.append(n.wrap); }
      const p = it.props, s = n.wrap.style;
      s.left = p.x + 'px'; s.top = p.y + 'px'; s.width = p.w + 'px'; s.height = p.h + 'px';
      n.wrap.classList.toggle('hidden', p.visible === false);
      if (it.kind === 'input') { if (n.inner.value !== p.text) n.inner.value = p.text; }
      else if (n.text !== p.text) { n.inner.textContent = p.text; n.text = p.text; }
    }
    for (const [id, n] of this.nodes) {
      if (!this.items.has(id)) { n.wrap.remove(); this.nodes.delete(id); }
    }
    this.#applySelection();
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

  clear() { this.nodes.forEach((n) => n.wrap.remove()); this.nodes.clear(); this.items.clear(); }
}
