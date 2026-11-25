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
//  - The All screens sheet (core/shared.js) runs first, as its own chain: an Else at the top of a screen's sheet
//    never follows a shared event. If a shared event goes to another screen, that screen's own events don't run for it.
//  - A function call (core/functions.js) runs the function's events there and then, as a chain of their own, and
//    carries on. Parameters are plain names inside it. Picking starts fresh (all copies) unless the function has
//    Copy picked, which starts it with the caller's picks. An object the screen doesn't have is matched by name:
//    a condition that mentions it is false and an action that mentions it is skipped, quietly.

import { soundNames, imageNames } from './assets.js';
import { isRef, isDataUrl, withRange } from './media.js';
import { evaluate, parse, ExprError, fieldOf, isRecord, fmt } from './expr.js';
import { CONDITIONS, ACTIONS, OBJECT_KINDS, normaliseKey } from './catalog.js';
import { sharedEventsFor, objectNames, itemObjects } from './shared.js';
import { findFunction } from './functions.js';

const MAX_DEPTH = 50; // calls inside calls

export const triggerOf = (ev) => (ev.conds || []).find((c) => CONDITIONS[c.type]?.trigger);

export class Runtime {
  constructor(project, opts = {}) {
    this.project = project;
    this.random = opts.random || Math.random;
    this.store = opts.store || null; // { load(name) -> value | undefined, save(name, value) } for "Remember between visits"
    this.hooks = opts.hooks || {};
    this.globals = new Map();
    this.errors = [];
    this.queue = [];
    this.busy = false;
    this.pendingScreen = null;
    this.screen = null;
    this.screenId = null;
    this.shared = []; // the All screens events that apply to this screen
    this.objects = new Map(); // name -> { def, kind, instances:[] }
    this.byId = new Map();
    this.version = 0;
    this.ticks = 0;
    this.keysDown = new Set();
    this.time = 0;      // milliseconds of app time; the renderer feeds it with advance()
    this.timers = [];
    this.once = new Map(); // event id -> tick its 'Trigger once' last passed
    this.depth = 0;        // how many function calls deep we are
    this.mentions = new WeakMap(); // condition/action -> object names it mentions (functions skip absent ones)
  }

  // ---------- lifecycle ----------
  start(screenId) {
    this.globals = new Map(this.project.variables.map((v) => [v.name, structuredClone(v.value)])); // lists are copied, so a run never changes the project
    this.tables = new Map(this.project.variables.filter((v) => v.table).map((v) => [v.name, v.table.fields || []]));
    this.remembered = new Set(this.project.variables.filter((v) => v.remember).map((v) => v.name));
    for (const name of this.remembered) {
      let saved;
      try { saved = this.store?.load(name); } catch { saved = undefined; }
      if (saved !== undefined && Array.isArray(saved) === Array.isArray(this.globals.get(name))) this.globals.set(name, saved);
    }
    this.errors = [];
    this.known = objectNames(this.project);
    this.depth = 0;
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
    for (const ev of this.events) {
      const entry = CONDITIONS[triggerOf(ev)?.type];
      if (!entry?.timer) continue;
      const gap = this.#timerGap(ev);
      if (gap !== null) this.timers.push({ ev, kind: entry.timer, due: this.time + gap, done: false });
    }
  }

  // every event that can run on this screen: the shared ones first, then its own
  get events() { return this.screen ? [...this.shared, ...(this.screen.events || [])] : []; }
  get needsTick() { return this.events.some((ev) => !triggerOf(ev)); }

  tick() {
    if (!this.screen || this.busy) return;
    this.ticks++;
    this.#pump(() => this.#runBoth(null));
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
    } else if (inst.kind === 'drawing') {
      // the user finished a line: value is how many lines there are now
      inst.props.lines = Math.max(0, Number(value) || 0);
      inst.drawn = true; // Drawing.picture is made afresh when next read
    } else if (inst.kind === 'recorder') {
      if (value?.recording !== undefined) { inst.props.recording = !!value.recording; this.#changed(); return; }
      if (value?.trim) { // the user moved the trim handles: just the play range
        const [s, e] = value.trim.map(Number);
        inst.props.start = Math.max(0, Math.min(s, inst.props.length)); inst.props.end = Math.max(inst.props.start, Math.min(e, inst.props.length));
        this.#changed();
        return;
      }
      if (!value?.ref) return;
      inst.props.recording = false;
      inst.props.file = value.ref;
      inst.props.length = Math.round((Number(value.length) || 0) * 10) / 10;
      inst.props.start = 0; inst.props.end = inst.props.length;
    } else if (inst.kind === 'photo') {
      if (value?.shoot) { // the Photo's own take-photo button: take it, then "a photo is taken" runs
        try { this.takePhoto(inst); } catch (e) { this.#error(null, e.message); return; }
      } else {
        inst.props.ready = !!value; // the camera started (or stopped); not an event of its own
        this.#changed();
        return;
      }
    } else return;
    this.fire('changed', { object: inst.object, instance: inst });
  }
  itemClick(instanceId, index) {
    const inst = this.byId.get(instanceId);
    const items = inst && this.globals.get(inst.props.source);
    if (!Array.isArray(items) || index < 1 || index > items.length) return;
    // the clicked row stays highlighted until the list or table it shows changes (a removed row can't stay picked)
    if (inst.selected !== index) { inst.selected = index; this.#changed(); }
    this.fire('itemClicked', { object: inst.object, instance: inst, clicked: { index, item: items[index - 1] } });
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
    if (this.tables.has(name)) throw new ExprError(`${name} is a table: use the table actions (Add a row, Set a field ...)`);
    if (Array.isArray(this.globals.get(name))) throw new ExprError(`${name} is a list: use the list actions (Add to list, Clear list ...)`);
    if (Array.isArray(value)) throw new ExprError(`A variable can't hold a whole list or table. Use one item, like item(${name}, 1)`);
    if (this.globals.get(name) !== value) { this.globals.set(name, isRecord(value) ? { ...value } : value); this.#changed(name); }
  }
  // a list or a table (both are lists of items; a table's items are rows)
  listOf(name) {
    const l = this.globals.get(name);
    if (!Array.isArray(l)) throw new ExprError(`There's no list or table called "${name}"`);
    return l;
  }
  listChange(name, fn) {
    if (this.tables.has(name)) throw new ExprError(`${name} is a table: use the table actions (Add a row ...)`);
    fn(this.listOf(name)); this.#changed(name);
  }
  // ---------- tables ----------
  tableOf(name) {
    if (!this.tables.has(name)) throw new ExprError(`There's no table called "${name}"`);
    return this.globals.get(name);
  }
  fieldsOf(name) { this.tableOf(name); return this.tables.get(name); }
  fieldType(table, field) {
    const f = this.fieldsOf(table).find((x) => x.name === field);
    if (!f) throw new ExprError(`${table} has no field "${field}". Its fields are ${this.fieldsOf(table).map((x) => x.name).join(', ') || 'none yet'}.`);
    return f.type;
  }
  // a value going into a field, in the field's type (a number field won't take "abc")
  toField(table, field, v) {
    const type = this.fieldType(table, field);
    if (type !== 'number') return typeof v === 'string' ? v : String(v ?? '');
    if (typeof v === 'number') return v;
    const t = String(v ?? '').trim();
    const n = t === '' ? 0 : Number(t);
    if (!Number.isFinite(n)) throw new ExprError(`${field} is a number field, but this is text: "${v}". Use int(...) to turn text into a number.`);
    return n;
  }
  tableChange(name, fn) { fn(this.tableOf(name)); this.#changed(name); }
  checkRow(t, i, name) {
    if (!Number.isInteger(i) || i < 1 || i > t.length) throw new ExprError(`${name} has ${t.length} row${t.length === 1 ? '' : 's'}, so there is no row ${i}. Rows are numbered from 1.`);
  }
  checkIndex(l, i) {
    if (!Number.isInteger(i) || i < 1 || i > l.length) throw new ExprError(`The list has ${l.length} item${l.length === 1 ? '' : 's'}, so there is no item ${i}. Items are numbered from 1.`);
  }
  instVar(inst, name) {
    if (!(name in inst.vars)) throw new ExprError(`${inst.object} has no variable called "${name}"`);
    return inst.vars[name];
  }
  setInstVar(inst, name, value) {
    if (!(name in inst.vars)) throw new ExprError(`${inst.object} has no variable called "${name}"`);
    if (inst.vars[name] !== value) { inst.vars[name] = isRecord(value) ? { ...value } : value; this.#changed(); }
  }
  // Sound and video: the runtime keeps playing (true/false) and a counter the player watches, so "Play" twice starts
  // from the top twice. The page plays the media; when it finishes it calls mediaEnded().
  media(inst, op) {
    inst.props.playing = op === 'play';
    inst.props.mediaSeq = (inst.props.mediaSeq || 0) + 1;
    this.#changed();
  }
  mediaEnded(instanceId) {
    const inst = this.byId.get(instanceId);
    if (!inst || !inst.props.playing) return;
    inst.props.playing = false;
    this.#changed();
    this.fire('ended', { object: inst.object, instance: inst });
  }
  // the user played or paused it with the player's own controls: record it (the player is already doing it)
  mediaState(instanceId, playing) {
    const inst = this.byId.get(instanceId);
    if (inst && !!inst.props.playing !== !!playing) { inst.props.playing = !!playing; this.#changed(); }
  }
  // ---------- pictures made while the app runs (Drawing, Photo) ----------
  // The page draws and holds the pixels; hooks.snapshot(instanceId) turns them into a picture now (a media reference,
  // or a data: URL when there is nowhere to keep files), or null. Without a page (tests) there is nothing to snapshot.
  drawing(inst, op) {
    if (op === 'clear') { inst.props.lines = 0; inst.props.clearSeq = (inst.props.clearSeq || 0) + 1; }
    if (op === 'undo') { if (!inst.props.lines) return; inst.props.lines--; inst.props.undoSeq = (inst.props.undoSeq || 0) + 1; }
    inst.drawn = true;
    this.#changed();
  }
  // Drawing.picture: made when read (not after every line), and the same reference until the drawing changes
  pictureOf(inst) {
    if (inst.kind !== 'drawing') return inst.props.picture ?? '';
    if (!inst.props.lines) return inst.props.background || '';
    if (inst.drawn || !inst.props.picture) {
      inst.props.picture = this.hooks.snapshot?.(inst.id) || '';
      inst.drawn = false;
    }
    return inst.props.picture;
  }
  takePhoto(inst) {
    if (!inst.props.ready) throw new ExprError(`${inst.object}'s camera isn't on yet: the user taps ${inst.object} to start it`);
    const ref = this.hooks.snapshot?.(inst.id);
    if (!ref) throw new ExprError(`${inst.object} couldn't take a photo`);
    this.setProp(inst, 'picture', ref);
  }
  // a value used as a picture: a reference or data: URL, or the name of a built-in or uploaded picture
  pictureValue(v) {
    const s = fmt(v);
    if (isRef(s) || isDataUrl(s) || imageNames(this.project).includes(s)) return s;
    throw new ExprError(s === '' ? 'There is no picture yet (nothing has been drawn or taken)' : `There is no picture called "${s}"`);
  }
  hasSound(name) { return isRef(name) || name.startsWith('data:audio/') || soundNames(this.project).includes(name); }
  openLink(link) { this.hooks.openLink?.(link); }
  setProp(inst, name, value) {
    if (inst.props[name] !== value) { inst.props[name] = value; this.#changed(); }
  }
  goTo(screenId) {
    if (!this.project.screens.some((s) => s.id === screenId)) throw new ExprError('That screen no longer exists');
    this.pendingScreen = screenId;
  }

  // picking: the copies an event is currently working on
  pickList(ctx, objName) {
    if (!this.objects.has(objName) && ctx.fn) return []; // in a function: an object this screen doesn't have has no copies
    if (!this.objects.has(objName)) throw new ExprError(`There's no object called "${objName}" on this screen`);
    return ctx.picked.get(objName) ?? this.instancesOf(objName);
  }
  ctxWith(ctx, objName, inst) {
    const picked = new Map(ctx.picked);
    picked.set(objName, [inst]);
    return { picked, loop: ctx.loop, clicked: ctx.clicked, fn: ctx.fn };
  }
  // Run fn once per picked copy; expressions see just that copy.
  each(ctx, objName, fn) {
    for (const inst of this.pickList(ctx, objName)) fn(inst, this.ctxWith(ctx, objName, inst));
  }
  evalExpr(src, ctx) {
    const env = {
      random: this.random,
      getVar: (n) => {
        if (n === 'ClickedIndex' || n === 'ClickedItem') {
          if (!ctx.clicked) throw new ExprError(`${n} only works in an "item in ... is clicked" event`);
          return n === 'ClickedIndex' ? ctx.clicked.index : ctx.clicked.item;
        }
        if (n === 'LoopIndex' || n === 'LoopItem') {
          const l = ctx.loop?.[ctx.loop.length - 1];
          if (!l) throw new ExprError(`${n} only works inside a "For each" or "Repeat" event`);
          return n === 'LoopIndex' ? l.index : l.item;
        }
        if (ctx.fn?.args.has(n)) return ctx.fn.args.get(n); // a parameter of the function running
        return this.getVar(n);
      },
      getProp: (o, p) => {
        if (!this.objects.has(o) && (this.globals.has(o) || ctx.fn?.args.has(o) || /^(Loop|Clicked)(Item|Index)$/.test(o))) {
          return fieldOf(evaluate({ k: 'var', name: o }, env), p, o); // LoopItem.artist, NowPlaying.title
        }
        const list = this.pickList(ctx, o);
        const inst = list[0];
        if (!inst) throw new ExprError(`There's no ${o} to read "${p}" from`);
        if (p in inst.vars) return inst.vars[p];
        if (p === 'picture' && (inst.kind === 'drawing' || inst.kind === 'photo')) return this.pictureOf(inst);
        if (p === 'sound' && inst.kind === 'recorder') return isRef(inst.props.file) ? withRange(inst.props.file, inst.props.start, inst.props.end, inst.props.length) : inst.props.file || '';
        if (p in inst.props) return inst.props[p];
        throw new ExprError(`${o} has no property "${p}"`);
      },
      call: (name, values) => this.callFunction(name, values, ctx, true), // Total(price, qty)
    };
    return evaluate(parse(String(src ?? '')), env);
  }

  // ---------- functions ----------
  // the values a call gives, in the order of the function's parameters (args = { param: expression })
  argValues(name, args, ctx) {
    const f = findFunction(this.project, name);
    if (!f) throw new ExprError(name ? `There's no function called "${name}"` : 'Choose a function to call');
    return f.params.map((p) => {
      const src = args?.[p];
      if (src == null || String(src).trim() === '') throw new ExprError(`${name} needs a value for ${p}`);
      return this.evalExpr(src, ctx);
    });
  }
  // Run a function now. asValue: it was used in a value box, so it must set a return value.
  callFunction(name, values, ctx, asValue = false) {
    const f = findFunction(this.project, name);
    if (!f) throw new ExprError(`There's no function called "${name}"`);
    if (values.length !== f.params.length) throw new ExprError(`${name}() needs ${f.params.length} value${f.params.length === 1 ? '' : 's'}`);
    if (this.depth >= MAX_DEPTH) throw new ExprError(`${name} was called inside itself more than ${MAX_DEPTH} times, so it was stopped. Does it call itself without a way to stop?`);
    const frame = { fn: f, args: new Map(f.params.map((p, i) => [p, values[i]])), ret: undefined, returned: false };
    const fctx = f.copyPicked
      ? { picked: new Map(ctx.picked), loop: [], clicked: ctx.clicked, fn: frame }
      : { picked: new Map(), loop: [], clicked: null, fn: frame };
    this.depth++;
    try { this.#runChain(f.events || [], fctx, false, null); } finally { this.depth--; }
    if (asValue && !frame.returned) throw new ExprError(`${name} doesn't give a value back yet. Add "Set return value" inside it.`);
    return frame.ret;
  }
  setReturn(ctx, value) {
    if (!ctx.fn) throw new ExprError('Set return value only works inside a function');
    ctx.fn.ret = isRecord(value) ? { ...value } : value;
    ctx.fn.returned = true;
  }
  // in a function: does this condition or action mention an object this screen doesn't have?
  #absent(item, entry) {
    let names = this.mentions.get(item);
    if (!names) { names = [...itemObjects(item, entry, this.known)]; this.mentions.set(item, names); }
    return names.some((n) => !this.objects.has(n));
  }
  #where(ctx, message) { return ctx.fn ? `${ctx.fn.fn.name}: ${message}` : message; }

  watch() {
    return { screen: this.screen?.name, tables: [...this.tables.keys()], fields: Object.fromEntries([...this.tables].map(([k, f]) => [k, f.map((x) => x.name)])), vars: Object.fromEntries([...this.globals].map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => (isRecord(x) ? { ...x } : x)) : v])) };
  }
  // Forget what "Remember between visits" kept, so the next start is a first visit.
  forget() { for (const name of this.remembered) { try { this.store?.save(name, undefined); } catch { /* storage blocked */ } } }

  // ---------- internals ----------
  #ctx() { return { picked: new Map(), loop: [], clicked: null, fn: null }; }

  #changed(name) {
    this.version++;
    if (name) for (const inst of this.allInstances) if (inst.selected && inst.props.source === name) inst.selected = 0;
    if (name && this.remembered?.has(name)) { try { this.store?.save(name, this.globals.get(name)); } catch { /* storage blocked: the app still runs */ } }
    this.hooks.onChange?.();
  }

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
    this.shared = sharedEventsFor(this.project, scr);
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
        if (kind.exposes?.includes('playing')) inst.props.playing = false;
        if (od.kind === 'drawing') { inst.props.lines = 0; inst.props.picture = ''; }
        if (od.kind === 'recorder') Object.assign(inst.props, { file: '', length: 0, start: 0, end: 0, recording: false });
        if (od.kind === 'photo') { inst.props.ready = false; inst.props.picture = ''; }
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
        this.#runBoth(occ);
        this.#applyPending();
      }
    } finally {
      this.busy = false;
    }
  }

  // the All screens chain, then this screen's own (skipped if a shared event is changing screen)
  #runBoth(occ) {
    if (this.shared.length) this.#runChain(this.shared, this.#ctx(), true, occ);
    if (this.pendingScreen === null) this.#runChain(this.screen.events || [], this.#ctx(), true, occ);
  }

  #matches(trig, occ, ctx, ev) {
    const entry = CONDITIONS[trig.type];
    if (!entry || entry.trigger !== occ.name) return false;
    if (entry.keyed && trig.key !== 'any' && trig.key !== occ.key) return false;
    if (entry.timer && occ.eventId !== ev.id) return false;
    if (entry.object) {
      if (trig[entry.object] !== occ.object) return false;
      if (occ.clicked) ctx.clicked = occ.clicked;
      ctx.picked.set(occ.object, [occ.instance]);
    }
    return true;
  }

  #runChain(events, parentCtx, top, occ) {
    let chainRan = true; // an Else with nothing normal above it never runs
    for (const ev of events) {
      const trig = triggerOf(ev);
      const ctx = { picked: new Map(parentCtx.picked), loop: parentCtx.loop, clicked: parentCtx.clicked, fn: parentCtx.fn };
      if (top) {
        // trigger pass runs only matching trigger events; tick pass runs only non-trigger events
        if (occ ? (!trig || !this.#matches(trig, occ, ctx, ev)) : !!trig) { chainRan = true; continue; }
      }
      if (ev.else && chainRan) continue;
      const loopC = (ev.conds || []).find((c) => CONDITIONS[c.type]?.loop);
      const rounds = loopC ? this.#loopRounds(ev, loopC, ctx) : [null];
      let ran = false;
      for (const round of rounds) {
        const rctx = round ? { picked: new Map(ctx.picked), loop: [...ctx.loop, round], clicked: ctx.clicked, fn: ctx.fn } : ctx;
        if (!this.#testConds(ev, rctx, trig)) continue;
        ran = true;
        this.hooks.onEventRan?.(ev.id);
        this.#runActions(ev, rctx);
        this.#runChain(ev.children || [], rctx, false, null);
      }
      if (ev.else) { if (ran) chainRan = true; } else chainRan = ran;
    }
  }

  // the rounds of a For each / Repeat event: [{ index, item }]. The list is copied first, so adding to it
  // inside the loop can't make the loop run forever.
  #loopRounds(ev, c, ctx) {
    try {
      let items;
      if (CONDITIONS[c.type].loop === 'each') items = [...this.listOf(c.list ?? c.table)];
      else {
        const n = this.evalExpr(c.count, ctx);
        if (typeof n !== 'number' || n < 0) throw new ExprError('Repeat needs a number of times, like 3');
        items = Array.from({ length: Math.floor(n) }, (_, i) => i + 1);
      }
      if (items.length > 1000) { this.#error(ev.id, 'That loop would run more than 1000 times, so it was stopped.'); items = items.slice(0, 1000); }
      return items.map((item, i) => ({ index: i + 1, item }));
    } catch (e) {
      if (e instanceof ExprError) { this.#error(ev.id, this.#where(ctx, e.message)); return []; }
      throw e;
    }
  }

  #testConds(ev, ctx, matchedTrigger) {
    for (const c of ev.conds || []) {
      if (c === matchedTrigger) continue;
      const entry = CONDITIONS[c.type];
      if (!entry) { this.#error(ev.id, `Unknown condition "${c.type}"`); return false; }
      if (entry.trigger) { this.#error(ev.id, "A trigger can only be the first condition of a top-level event."); return false; }
      if (entry.loop) continue; // handled by #loopRounds
      if (ctx.fn && this.#absent(c, entry)) return false; // an object this screen doesn't have: false, quietly
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
        if (e instanceof ExprError) { this.#error(ev.id, this.#where(ctx, e.message)); return false; }
        throw e;
      }
    }
    return true;
  }

  #runActions(ev, ctx) {
    for (const a of ev.actions || []) {
      const entry = ACTIONS[a.type];
      if (!entry) { this.#error(ev.id, `Unknown action "${a.type}"`); continue; }
      if (ctx.fn && this.#absent(a, entry)) continue; // an object this screen doesn't have: skipped, quietly
      try {
        entry.run(this, ctx, a);
      } catch (e) {
        if (e instanceof ExprError) this.#error(ev.id, this.#where(ctx, e.message));
        else throw e;
      }
    }
  }
}
