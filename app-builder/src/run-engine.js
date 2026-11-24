// Runner: runs a copy of the project in a Stage and keeps the Watch / Problems panels fresh.
// Used by the Events tab (compact preview) and the Run tab (full size).
import { Runtime } from './core/runtime.js';
import { Stage } from './ui/stage.js';
import { h } from './ui/dom.js';
import { usesKeys } from './core/catalog.js';
import { sizeOf } from './core/project.js';

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
    this.stage.setSize(sizeOf(project));
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

  stop() { cancelAnimationFrame(this.raf); this.rt = null; this.stage.setPick(null); showNow(null); }

  #draw() {
    const rt = this.rt;
    if (!rt) return;
    this.hint.hidden = !usesKeys(rt.screen?.events);
    this.stage.sync(rt.allInstances.map((i) => ({ id: i.id, name: i.object, kind: i.kind, props: i.kind === 'list' ? { ...i.props, items: rt.globals.get(i.props.source) } : i.props })));
    showNow(rt.watch());
    if (this.problemsEl) {
      this.problemsEl.replaceChildren(...(rt.errors.length ? [
        h('h3', {}, 'Problems'),
        ...rt.errors.map((e) => h('div', { class: 'problem' }, '⚠ ' + e.message, e.count > 1 ? h('small', {}, ` (×${e.count})`) : null)),
      ] : []));
    }
  }
}

// Live values sit beside each variable in the sidebar (one place for a variable: what it starts at, and what it is now).
const fmt = (v) => (typeof v === 'string' ? `"${v}"` : String(v));
let lastNow = null;
export const nowText = (name, w = lastNow) => { const v = w?.vars[name]; return !w || v === undefined ? '' : Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : fmt(v); };
export function showNow(w) {
  lastNow = w;
  document.documentElement.classList.toggle('ab-running', !!w);
  for (const el of document.querySelectorAll('[data-now]')) {
    const v = w?.vars[el.dataset.now];
    const text = nowText(el.dataset.now, w);
    if (el.textContent !== text) {
      if (w && el.textContent !== '') { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      el.textContent = text;
      el.title = Array.isArray(v) ? v.map(fmt).join(', ') || 'empty' : '';
    }
  }
  for (const el of document.querySelectorAll('[data-now-screen]')) el.textContent = w?.screen ? `Running: ${w.screen}` : '';
}
