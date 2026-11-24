// Runner: runs a copy of the project in a Stage and keeps the Watch / Problems panels fresh.
// Used by the Events tab (compact preview) and the Run tab (full size).
import { Runtime } from './core/runtime.js';
import { Stage } from './ui/stage.js';
import { h } from './ui/dom.js';

export class Runner {
  constructor(stageHost, { watch, problems, flash, onScreen } = {}) {
    this.stage = new Stage(stageHost, {
      on: { click: (id) => this.rt?.click(id), input: (id, text) => this.rt?.typeInto(id, text) },
    });
    this.watchEl = watch;
    this.problemsEl = problems;
    this.flash = flash;
    this.onScreen = onScreen;
    this.rt = null;
    this.dirty = false;
    this.raf = 0;
  }

  start(project, screenId) {
    this.stop();
    this.stage.clear();
    const rt = new Runtime(structuredClone(project), {
      hooks: {
        onChange: () => { this.dirty = true; },
        onError: () => { this.dirty = true; },
        onEventRan: (id) => this.flash?.(id),
        onScreen: (scr) => this.onScreen?.(scr, rt.project),
      },
    });
    this.rt = rt;
    rt.start(screenId);
    this.#draw();
    const loop = () => {
      if (this.rt !== rt) return;
      if (rt.needsTick) rt.tick();
      if (this.dirty) { this.dirty = false; this.#draw(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this.raf); this.rt = null; this.stage.setPick(null); }

  #draw() {
    const rt = this.rt;
    if (!rt) return;
    this.stage.sync(rt.allInstances.map((i) => ({ id: i.id, kind: i.kind, props: i.props })));
    if (this.watchEl) {
      const w = rt.watch();
      this.watchEl.replaceChildren(
        h('h3', {}, 'Watch'),
        h('div', { class: 'var' }, h('span', { class: 'vname' }, 'screen'), h('span', { class: 'val' }, w.screen)),
        ...Object.entries(w.vars).map(([k, v]) => h('div', { class: 'var' }, h('span', { class: 'vname' }, k), h('span', { class: 'val' }, typeof v === 'string' ? `"${v}"` : String(v)))));
    }
    if (this.problemsEl) {
      this.problemsEl.replaceChildren(...(rt.errors.length ? [
        h('h3', {}, 'Problems'),
        ...rt.errors.map((e) => h('div', { class: 'problem' }, '⚠ ' + e.message, e.count > 1 ? h('small', {}, ` (×${e.count})`) : null)),
      ] : []));
    }
  }
}
