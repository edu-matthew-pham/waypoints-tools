// Runner: runs a copy of the project in a Stage and keeps the Watch / Problems panels fresh.
// Used by the Events tab (compact preview) and the Run tab (full size).
import { Runtime } from './core/runtime.js';
import { Stage } from './ui/stage.js';
import { h } from './ui/dom.js';
import { usesKeys } from './core/catalog.js';

export class Runner {
  constructor(stageHost, { watch, problems, flash, onScreen } = {}) {
    this.stage = new Stage(stageHost, {
      on: {
        click: (id) => this.rt?.click(id),
        itemClick: (id, index) => this.rt?.itemClick(id, index),
        input: (id, v) => this.rt?.userChange(id, v),
        press: (id) => this.rt?.press(id),
        release: (id) => this.rt?.release(id),
        submit: (id) => this.rt?.submit(id),
        key: (name, down) => this.rt?.key(name, down),
        keysReset: () => this.rt?.releaseKeys(),
      },
    });
    // shown under the app when its events use the keyboard, until the app has focus
    this.hint = h('p', { class: 'kb-hint', hidden: true }, 'This app uses the keyboard: click it first, then press keys.');
    stageHost.append(this.hint);
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
    let last = performance.now();
    const loop = (now = performance.now()) => {
      if (this.rt !== rt) return;
      if (rt.hasTimers) rt.advance(Math.min(now - last, 250)); // capped, so a hidden tab doesn't fire a burst
      last = now;
      if (rt.needsTick) rt.tick();
      if (this.dirty) { this.dirty = false; this.#draw(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  focus() { this.stage.el.focus({ preventScroll: true }); }

  stop() { cancelAnimationFrame(this.raf); this.rt = null; this.stage.setPick(null); }

  #draw() {
    const rt = this.rt;
    if (!rt) return;
    this.hint.hidden = !usesKeys(rt.screen?.events);
    this.stage.sync(rt.allInstances.map((i) => ({ id: i.id, kind: i.kind, props: i.kind === 'list' ? { ...i.props, items: rt.globals.get(i.props.source) } : i.props })));
    if (this.watchEl) {
      const w = rt.watch();
      this.watchEl.replaceChildren(
        h('h3', {}, 'Watch'),
        h('div', { class: 'var' }, h('span', { class: 'vname' }, 'screen'), h('span', { class: 'val' }, w.screen)),
        ...Object.entries(w.vars).map(([k, v]) => h('div', { class: 'var' }, h('span', { class: 'vname' }, k), h('span', { class: 'val' }, Array.isArray(v) ? `[${v.map((x) => (typeof x === 'string' ? `"${x}"` : String(x))).join(', ')}]` : typeof v === 'string' ? `"${v}"` : String(v)))));
    }
    if (this.problemsEl) {
      this.problemsEl.replaceChildren(...(rt.errors.length ? [
        h('h3', {}, 'Problems'),
        ...rt.errors.map((e) => h('div', { class: 'problem' }, '⚠ ' + e.message, e.count > 1 ? h('small', {}, ` (×${e.count})`) : null)),
      ] : []));
    }
  }
}
