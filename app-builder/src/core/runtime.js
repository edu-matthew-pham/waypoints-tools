// The interpreter. No DOM in here: it runs headless, so it can be tested in Node,
// used to check student projects, and drive any renderer.
//
// Rules (same ideas as an event sheet):
//  - Triggers (On start, X is clicked, ...) run their event the moment it happens.
//  - Other events are checked every tick, top to bottom.
//  - A condition can *pick* copies; the actions and sub-events use only those.
//  - A sub-event runs only if its parent's conditions passed (and sees the parent's picks).
//  - Else runs if the event above it (and any Else above) didn't run.
//  - Actions run before sub-events.
//  - "Go to screen" happens after the current event finishes. Globals survive, copies reset.

import { evaluate, parse, ExprError } from './expr.js';
import { CONDITIONS, ACTIONS, OBJECT_KINDS, normaliseKey } from './catalog.js';

export const triggerOf = (ev) => (ev.conds || []).find((c) => CONDITIONS[c.type]?.trigger);

export class Runtime {
  constructor(project, opts = {}) {
    this.project = project;
    this.random = opts.random || Math.random;
    this.hooks = opts.hooks || {};
    this.globals = new Map();
    this.errors = [];
    this.queue = [];
    this.busy = false;
    this.pendingScreen = null;
    this.screen = null;
    this.screenId = null;
    this.objects = new Map(); // name -> { def, kind, instances:[] }
    this.byId = new Map();
    this.version = 0;
    this.ticks = 0;
    this.keysDown = new Set();
    this.time = 0;      // milliseconds of app time; the renderer feeds it with advance()
    this.timers = [];
    this.once = new Map(); // event id -> tick its 'Trigger once' last passed
  }

  // ---------- lifecycle ----------
  start(screenId) {
    this.globals = new Map(this.project.variables.map((v) => [v.name, v.value]));
    this.errors = [];
    this.keysDown = new Set();
    this.time = 0;
    this.queue = [{ name: 'start' }];
    this.pendingScreen = null;
    this.#load(screenId ?? this.project.screens[0].id);
    this.#pump();
  }

  // Timers run on app time, not the wall clock, so tests can say advance(1000) and get exactly one second.
  get hasTimers() { return this.timers.length > 0; }
  advance(ms) {
    if (!this.screen || this.busy || !this.timers.length) return;
    this.time += ms;
    const list = this.timers;
    for (const t of [...list]) {
      let n = 0;
      while (!t.done && t.due <= this.time && n++ < 20) {
        this.fire('timer', { eventId: t.ev.id });
        if (this.timers !== list) return;            // the event changed screen: these timers are gone
        if (t.kind === 'after') { t.done = true; break; }
        const gap = this.#timerGap(t.ev);
        if (gap === null) { t.done = true; break; }
        t.due += gap;
      }
      if (!t.done && t.due <= this.time) t.due = this.time + (this.#timerGap(t.ev) ?? 1000); // fell far behind (tab was hidden): skip ahead
    }
  }
  #timerGap(ev) {
    const trig = triggerOf(ev);
    try {
      const secs = this.evalExpr(trig.seconds, this.#ctx());
      if (typeof secs !== 'number' || !(secs >= 0.1)) throw new ExprError('A timer needs a number of seconds of at least 0.1');
      return secs * 1000;
    } catch (e) {
      if (e instanceof ExprError) { this.#error(ev.id, e.message); return null; }
      throw e;
    }
  }
  #setUpTimers() {
    this.timers = [];
    for (const ev of this.screen.events || []) {
      const entry = CONDITIONS[triggerOf(ev)?.type];
      if (!entry?.timer) continue;
      const gap = this.#timerGap(ev);
      if (gap !== null) this.timers.push({ ev, kind: entry.timer, due: this.time + gap, done: false });
    }
  }

  get needsTick() { return !!this.screen && (this.screen.events || []).some((ev) => !triggerOf(ev)); }

  tick() {
    if (!this.screen || this.busy) return;
    this.ticks++;
    this.#pump(() => this.#runChain(this.screen.events || [], this.#ctx(), true, null));
  }

  // ---------- input from a renderer ----------
  click(instanceId) {
    const inst = this.byId.get(instanceId);
    if (inst) this.fire('clicked', { object: inst.object, instance: inst });
  }
  typeInto(instanceId, text) {
    const inst = this.byId.get(instanceId);
    if (!inst) return;
    inst.props.text = String(text);
    this.fire('changed', { object: inst.object, instance: inst });
  }
  // The user changed a value: text typed, toggle switched, slider moved.
  userChange(instanceId, value) {
    const inst = this.byId.get(instanceId);
    if (!inst) return;
    if (inst.kind === 'input') inst.props.text = String(value);
    else if (inst.kind === 'toggle') inst.props.on = !!value;
    else if (inst.kind === 'slider') {
      const n = Number(value);
      if (Number.isNaN(n)) return;
      inst.props.value = Math.max(inst.props.min, Math.min(inst.props.max, n));
    } else return;
    this.fire('changed', { object: inst.object, instance: inst });
  }
  press(instanceId) { this.#touch('pressed', instanceId); }
  release(instanceId) { this.#touch('released', instanceId); }
  submit(instanceId) { this.#touch('submitted', instanceId); }
  #touch(name, instanceId) {
    const inst = this.byId.get(instanceId);
    if (inst) this.fire(name, { object: inst.object, instance: inst });
  }
  // Keyboard: name is a browser key ("a", "Enter", " ", "ArrowUp"). Holding a key fires once, not repeatedly.
  key(name, down) {
    const k = normaliseKey(name);
    if (down) {
      if (this.keysDown.has(k)) return;
      this.keysDown.add(k);
      this.fire('keyDown', { key: k });
    } else {
      this.keysDown.delete(k);
      this.fire('keyUp', { key: k });
    }
  }
  releaseKeys() { this.keysDown.clear(); }
  fire(name, occ = {}) {
    this.queue.push({ name, ...occ });
    if (!this.busy) this.#pump();
  }

  // ---------- state access (used by catalog functions and renderers) ----------
  get allInstances() { return [...this.objects.values()].flatMap((o) => o.instances); }
  instancesOf(name) { return this.objects.get(name)?.instances ?? []; }

  getVar(name) {
    if (!this.globals.has(name)) throw new ExprError(`There's no variable called "${name}"`);
    return this.globals.get(name);
  }
  setVar(name, value) {
    if (!this.globals.has(name)) throw new ExprError(`There's no variable called "${name}"`);
    if (this.globals.get(name) !== value) { this.globals.set(name, value); this.#changed(); }
  }
  instVar(inst, name) {
    if (!(name in inst.vars)) throw new ExprError(`${inst.object} has no variable called "${name}"`);
    return inst.vars[name];
  }
  setInstVar(inst, name, value) {
    if (!(name in inst.vars)) throw new ExprError(`${inst.object} has no variable called "${name}"`);
    if (inst.vars[name] !== value) { inst.vars[name] = value; this.#changed(); }
  }
  setProp(inst, name, value) {
    if (inst.props[name] !== value) { inst.props[name] = value; this.#changed(); }
  }
  goTo(screenId) {
    if (!this.project.screens.some((s) => s.id === screenId)) throw new ExprError('That screen no longer exists');
    this.pendingScreen = screenId;
  }

  // picking: the copies an event is currently working on
  pickList(ctx, objName) {
    if (!this.objects.has(objName)) throw new ExprError(`There's no object called "${objName}" on this screen`);
    return ctx.picked.get(objName) ?? this.instancesOf(objName);
  }
  ctxWith(ctx, objName, inst) {
    const picked = new Map(ctx.picked);
    picked.set(objName, [inst]);
    return { picked };
  }
  // Run fn once per picked copy; expressions see just that copy.
  each(ctx, objName, fn) {
    for (const inst of this.pickList(ctx, objName)) fn(inst, this.ctxWith(ctx, objName, inst));
  }
  evalExpr(src, ctx) {
    return evaluate(parse(String(src ?? '')), {
      random: this.random,
      getVar: (n) => this.getVar(n),
      getProp: (o, p) => {
        const list = this.pickList(ctx, o);
        const inst = list[0];
        if (!inst) throw new ExprError(`There's no ${o} to read "${p}" from`);
        if (p in inst.vars) return inst.vars[p];
        if (p in inst.props) return inst.props[p];
        throw new ExprError(`${o} has no property "${p}"`);
      },
    });
  }

  watch() {
    return { screen: this.screen?.name, vars: Object.fromEntries(this.globals) };
  }

  // ---------- internals ----------
  #ctx() { return { picked: new Map() }; }

  #changed() { this.version++; this.hooks.onChange?.(); }

  #error(eventId, message) {
    const hit = this.errors.find((e) => e.eventId === eventId && e.message === message);
    if (hit) { hit.count++; return; }
    const err = { eventId, message, count: 1 };
    this.errors.push(err);
    if (this.errors.length > 50) this.errors.shift();
    this.hooks.onError?.(err);
  }

  #load(screenId) {
    const scr = this.project.screens.find((s) => s.id === screenId) || this.project.screens[0];
    this.screen = scr;
    this.screenId = scr.id;
    this.objects = new Map();
    this.byId = new Map();
    for (const od of scr.objects || []) {
      const kind = OBJECT_KINDS[od.kind] || OBJECT_KINDS.text;
      const instances = (od.instances || []).map((d) => {
        const vars = {};
        for (const iv of od.instanceVars || []) vars[iv.name] = d.vars && iv.name in d.vars ? d.vars[iv.name] : iv.value;
        const inst = {
          id: d.id, object: od.name, kind: od.kind, vars,
          props: { x: d.x ?? 0, y: d.y ?? 0, w: d.w ?? kind.props.w, h: d.h ?? kind.props.h, text: d.text ?? kind.props.text, visible: d.visible !== false },
        };
        for (const [k, v] of Object.entries(kind.extra || {})) inst.props[k] = d[k] ?? v;
        this.byId.set(inst.id, inst);
        return inst;
      });
      this.objects.set(od.name, { def: od, kind: od.kind, instances });
    }
    this.once = new Map();
    this.#setUpTimers();
    this.hooks.onScreen?.(scr);
    this.#changed();
  }

  #applyPending() {
    if (this.pendingScreen === null) return;
    const id = this.pendingScreen;
    this.pendingScreen = null;
    this.#load(id);
    this.queue = [{ name: 'start' }]; // old clicks refer to copies that no longer exist
  }

  #pump(initial) {
    this.busy = true;
    try {
      initial?.();
      this.#applyPending();
      let guard = 0;
      while (this.queue.length) {
        if (++guard > 500) {
          this.#error(null, 'Too many screen changes in a row. Is one screen sending you back and forth?');
          this.queue = [];
          break;
        }
        const occ = this.queue.shift();
        this.#runChain(this.screen.events || [], this.#ctx(), true, occ);
        this.#applyPending();
      }
    } finally {
      this.busy = false;
    }
  }

  #matches(trig, occ, ctx, ev) {
    const entry = CONDITIONS[trig.type];
    if (!entry || entry.trigger !== occ.name) return false;
    if (entry.keyed && trig.key !== 'any' && trig.key !== occ.key) return false;
    if (entry.timer && occ.eventId !== ev.id) return false;
    if (entry.object) {
      if (trig[entry.object] !== occ.object) return false;
      ctx.picked.set(occ.object, [occ.instance]);
    }
    return true;
  }

  #runChain(events, parentCtx, top, occ) {
    let chainRan = true; // an Else with nothing normal above it never runs
    for (const ev of events) {
      const trig = triggerOf(ev);
      const ctx = { picked: new Map(parentCtx.picked) };
      if (top) {
        // trigger pass runs only matching trigger events; tick pass runs only non-trigger events
        if (occ ? (!trig || !this.#matches(trig, occ, ctx, ev)) : !!trig) { chainRan = true; continue; }
      }
      let ok;
      if (ev.else) {
        ok = chainRan ? false : this.#testConds(ev, ctx, trig);
        if (ok) chainRan = true;
      } else {
        ok = this.#testConds(ev, ctx, trig);
        chainRan = ok;
      }
      if (!ok) continue;
      this.hooks.onEventRan?.(ev.id);
      this.#runActions(ev, ctx);
      this.#runChain(ev.children || [], ctx, false, null);
    }
  }

  #testConds(ev, ctx, matchedTrigger) {
    for (const c of ev.conds || []) {
      if (c === matchedTrigger) continue;
      const entry = CONDITIONS[c.type];
      if (!entry) { this.#error(ev.id, `Unknown condition "${c.type}"`); return false; }
      if (entry.trigger) { this.#error(ev.id, "A trigger can only be the first condition of a top-level event."); return false; }
      if (entry.once) {
        // Construct-style: true only if the conditions above were NOT all true on the previous tick.
        // Per event, not per copy. Re-arms after a tick where the event didn't get this far.
        const prev = this.once.get(ev.id);
        this.once.set(ev.id, this.ticks);
        if (prev === this.ticks - 1 || prev === this.ticks) return false;
        continue;
      }
      try {
        if (!entry.test(this, ctx, c)) return false;
      } catch (e) {
        if (e instanceof ExprError) { this.#error(ev.id, e.message); return false; }
        throw e;
      }
    }
    return true;
  }

  #runActions(ev, ctx) {
    for (const a of ev.actions || []) {
      const entry = ACTIONS[a.type];
      if (!entry) { this.#error(ev.id, `Unknown action "${a.type}"`); continue; }
      try {
        entry.run(this, ctx, a);
      } catch (e) {
        if (e instanceof ExprError) this.#error(ev.id, e.message);
        else throw e;
      }
    }
  }
}
