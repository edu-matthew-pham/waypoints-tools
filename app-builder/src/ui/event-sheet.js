// <event-sheet>: the reusable event editor / viewer.
//
//   const el = document.createElement('event-sheet');
//   el.setData({ events, scope, exprScope, mode, canPick, features, where, sequence });
//       mode: 'guided'   clean read view; click a condition/action to edit it in a dialog (beginners)
//             'edit'     quick edit: dropdowns and boxes inline (confident users)
//             'readonly' static (lesson pages, Run tab)
//       features: resolved feature list (core/features.js), or null for everything
//       where: 'screen' | 'all' | 'function' (a function's body: no triggers; Set return value is offered)
//       sequence: show a function as one list of actions ("When called, do ..."), with no conditions or sub-events
//   el.addEventListener('sheetchange', ...)   // the events array was edited in place
//   el.addEventListener('pickobject', e => e.detail.apply(name) / e.detail.cancel())
//        // the host lets the user click an object on screen; only offered when canPick is true
//   el.flash(eventId)                          // highlight a row (tracing a running app)
//
// It only knows the catalog and plain JSON. Nothing here depends on the stage or runtime,
// so the same element can sit in a lesson page or in the editor.
import { OPERATORS, defaultParams, validateSheet, entryFor, CONDITIONS, KEYS, SORT_DIRS } from '../core/catalog.js';
import { check } from '../core/expr.js';
import { newEvent } from '../core/project.js';
import { COMPONENTS } from '../core/components.js';
import { canUse } from '../core/features.js';
import { h } from './dom.js';
import { openChooser, openItemDialog } from './sheet-dialogs.js';
import { openMenu } from './menu.js';

export class EventSheet extends HTMLElement {
  constructor() {
    super();
    this._events = [];
    this._scope = { objects: [], variables: [], screens: [] };
    this._exprScope = { vars: new Set(), objects: new Map() };
    this._mode = 'edit';
    this._canPick = false;
    this._features = null;
    this._where = 'screen';
    this._sequence = false;
    this._sel = null;
    this._timers = new Map();
  }

  setData({ events, scope, exprScope, mode = 'edit', canPick = false, features = null, where = 'screen', sequence = false }) {
    this._where = where;
    this._sequence = sequence;
    this._events = events;
    this._scope = scope;
    this._exprScope = exprScope;
    this._mode = mode;
    this._canPick = canPick;
    this._features = features;
    this.render();
  }
  get events() { return this._events; }
  get edit() { return this._mode === 'edit'; }
  get guided() { return this._mode === 'guided'; }
  connectedCallback() { this.render(); }

  _ui(flag) { return this._features ? !!this._features[flag] : true; }
  _can(kind, type) {
    if (type === 'setReturn' && this._where !== 'function') return false;
    if (type === 'callFunction' && !this._ui('functions')) return false;
    return canUse(this._features, kind, type);
  }

  render() { this.replaceChildren(this._build()); }
  _changed() { this.render(); this._emit(); }
  _emit() { this.dispatchEvent(new CustomEvent('sheetchange', { bubbles: true })); }
  _select(id, focus) {
    this._sel = id;
    this.render();
    if (focus) this.querySelector(`.ev[data-id="${CSS.escape(id)}"]`)?.focus();
  }

  flash(id) {
    const el = this.querySelector(`.ev[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    el.classList.add('ran');
    clearTimeout(this._timers.get(id));
    this._timers.set(id, setTimeout(() => el.classList.remove('ran'), 450));
  }

  // ---------- building ----------
  _build() {
    const issues = new Map();
    for (const i of validateSheet(this._events, 0, [], false, this._where === 'function')) issues.set(i.id, [...(issues.get(i.id) || []), i.message]);
    const root = h('div', { class: 'es' + (this.guided ? ' guided' : this.edit ? '' : ' ro') });
    if (this._sequence) { root.append(this._sequenceRow(issues)); return root; }
    if (!this._events.length) {
      root.append(h('p', { class: 'es-empty' }, this._where === 'function' ? 'Nothing in this function yet.' : this.edit || this.guided ? 'No events on this screen yet. An event says: when this happens, do that.' : 'No events on this screen.'));
    }
    root.append(...this._rows(this._events, 0, issues));
    if (this.edit || this.guided) {
      root.append(h('button', { class: 'btn es-addev', type: 'button', onclick: () => {
        const ev = newEvent();
        this._events.push(ev);
        this._sel = ev.id;
        this._changed();
      }, 'data-ab': 'add-event' }, '+ Add event'));
    }
    return root;
  }

  // A function shown as a plain list of actions: "When called, do this, then this". Its one event has no conditions.
  _sequenceRow(issues) {
    if (!this._events.length) this._events.push(newEvent());
    const ev = this._events[0];
    const msgs = issues.get(ev.id);
    const acts = h('div', { class: 'ev-acts' });
    ev.actions.forEach((a, ai) => acts.append(this._item('act', ev, ev.actions, a, ai)));
    if (this.edit || this.guided) acts.append(this._addBtn('act', ev, 0));
    else if (!ev.actions.length) acts.append(h('span', { class: 'muted' }, '(no actions yet)'));
    const row = h('div', { class: 'ev seq' + (msgs ? ' bad' : ''), 'data-id': ev.id, 'data-ab': 'event' },
      h('div', { class: 'ev-main' }, h('div', { class: 'ev-conds' }, h('div', { class: 'badge when-called', title: 'A function runs when an event calls it' }, 'When called')), acts));
    if (msgs) row.append(h('div', { class: 'ev-warn' }, '⚠ ' + msgs.join(' ')));
    return row;
  }

  _addBtn(kind, ev, depth) {
    return h('button', { class: 'mini', type: 'button', 'data-ab': kind === 'cond' ? 'add-condition' : 'add-action', onclick: () => this._add(kind, ev, depth) }, kind === 'cond' ? '+ Condition' : '+ Action');
  }

  _rows(list, depth, issues) {
    return list.map((ev, i) => {
      const msgs = issues.get(ev.id);
      const sel = this.guided && this._sel === ev.id;
      const row = h('div', {
        class: 'ev' + (ev.else ? ' else' : '') + (msgs ? ' bad' : '') + (sel ? ' sel' : ''),
        'data-id': ev.id, 'data-ab': 'event', tabindex: this.guided ? '0' : null,
      });
      if (this.guided) {
        row.addEventListener('click', (e) => { if (!e.target.closest('button')) this._select(ev.id); });
        row.addEventListener('keydown', (e) => { if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this._select(ev.id, true); } });
      }
      const showAdd = this.edit || sel;

      const conds = h('div', { class: 'ev-conds' });
      if (ev.else) conds.append(h('div', { class: 'badge' }, 'Else'));
      ev.conds.forEach((c, ci) => conds.append(this._item('cond', ev, ev.conds, c, ci)));
      if (showAdd) conds.append(this._addBtn('cond', ev, depth));
      else if (!ev.conds.length && !ev.else) conds.append(h('span', { class: 'muted' }, '(always)'));

      const acts = h('div', { class: 'ev-acts' });
      ev.actions.forEach((a, ai) => acts.append(this._item('act', ev, ev.actions, a, ai)));
      if (showAdd) acts.append(this._addBtn('act', ev, depth));
      else if (!ev.actions.length && this.guided && !ev.children.length) acts.append(h('span', { class: 'muted' }, '(no actions yet)'));

      const main = h('div', { class: 'ev-main' }, conds, acts);
      if (this.edit) main.append(this._tools(list, i, ev));
      else if (sel) main.append(h('div', { class: 'ev-tools' },
        h('button', { class: 'icon', type: 'button', title: 'More', 'data-ab': 'event-menu', 'aria-label': 'More actions for this event', 'aria-haspopup': 'menu',
          onclick: (e) => this._eventMenu(e.currentTarget, list, i, ev) }, '⋯')));
      row.append(main);
      if (msgs) row.append(h('div', { class: 'ev-warn' }, '⚠ ' + msgs.join(' ')));
      if (ev.children.length) row.append(h('div', { class: 'ev-children' }, ...this._rows(ev.children, depth + 1, issues)));
      return row;
    });
  }

  _moveBy(list, i, d) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this._changed();
  }
  _addSub(ev) { const sub = newEvent(); ev.children.push(sub); this._sel = sub.id; this._changed(); }
  _addElse(list, i) { const el = newEvent({ else: true }); list.splice(i + 1, 0, el); this._sel = el.id; this._changed(); }

  // quick-edit toolbar
  _tools(list, i, ev) {
    return h('div', { class: 'ev-tools' },
      h('button', { class: 'icon', type: 'button', title: 'Move up', disabled: i === 0, onclick: () => this._moveBy(list, i, -1) }, '↑'),
      h('button', { class: 'icon', type: 'button', title: 'Move down', disabled: i === list.length - 1, onclick: () => this._moveBy(list, i, 1) }, '↓'),
      this._ui('sub') ? h('button', { class: 'icon', type: 'button', title: 'Add a sub-event inside this event', onclick: () => this._addSub(ev) }, '↳') : null,
      this._ui('else') ? h('button', { class: 'icon', type: 'button', title: 'Add an Else event below', onclick: () => this._addElse(list, i) }, 'Else') : null,
      h('button', { class: 'icon danger', type: 'button', title: 'Delete this event', onclick: () => { list.splice(i, 1); this._changed(); } }, '×'),
    );
  }

  // guided "..." menu, opened from the button
  _eventMenu(btn, list, i, ev, at) {
    const r = btn?.getBoundingClientRect();
    openMenu({
      x: at ? at.x : r.right - 200, y: at ? at.y : r.bottom + 4, returnFocus: btn,
      items: [
        { label: 'Move up', fn: () => this._moveBy(list, i, -1), disabled: i === 0 },
        { label: 'Move down', fn: () => this._moveBy(list, i, 1), disabled: i === list.length - 1 },
        this._ui('sub') ? { label: 'Add a sub-event', fn: () => this._addSub(ev) } : null,
        this._ui('else') ? { label: 'Add an Else below', fn: () => this._addElse(list, i) } : null,
        { label: 'Delete this event', danger: true, fn: () => { list.splice(i, 1); this._sel = null; this._changed(); } },
      ],
    });
  }

  // ---------- items (one condition or action) ----------
  _item(kind, ev, list, item, idx) {
    const entry = entryFor(kind, item.type);
    const guided = this.guided;
    const el = h(guided ? 'button' : 'div', { 'data-ab': 'item:' + item.type, class: 'item ' + kind + (entry?.trigger ? ' trig' : '') + (guided ? ' guided' : ''), type: guided ? 'button' : null });
    if (!entry) {
      el.classList.add('bad');
      el.append(h('span', {}, `Unknown ${kind === 'cond' ? 'condition' : 'action'}: ${item.type}`));
    } else {
      if (entry.trigger) el.append(h('span', { class: 'bolt', title: 'Trigger: runs the moment this happens' }, '⚡'));
      for (const part of entry.label.split(/(\{\w+\})/)) {
        const m = part.match(/^\{(\w+)\}$/);
        if (!m) { if (part) el.append(h('span', { class: 'lbl' }, part)); continue; }
        const prm = entry.params.find((p) => p.name === m[1]);
        el.append(prm ? this._control(prm, item, entry) : h('span', {}, part));
      }
    }
    if (guided && entry) {
      el.title = 'Click to change';
      el.addEventListener('click', (e) => { e.stopPropagation(); this._editItem(kind, ev, list, idx, entry); });
    }
    if (this.edit) el.append(h('button', { class: 'x', type: 'button', title: 'Remove', onclick: () => { list.splice(idx, 1); this._changed(); } }, '×'));
    return el;
  }

  _editItem(kind, ev, list, idx, entry) {
    if (this._sel !== ev.id) { this._sel = ev.id; this.render(); } // changing a condition or action selects its event too
    openItemDialog(this, {
      kind, entry, draft: structuredClone(list[idx]), isNew: false,
      onDone: (d) => { list[idx] = d; this._changed(); },
      onDelete: () => { list.splice(idx, 1); this._changed(); },
    });
  }

  _add(kind, ev, depth) {
    openChooser(this, kind, ev, depth, (type, preset = {}) => {
      const entry = entryFor(kind, type);
      const draft = { type, ...defaultParams(entry, this._scope), ...preset };
      // the object was chosen first: point any "its variable" blank at one of that object's variables
      for (const prm of entry.params.filter((p) => p.type === 'instVar')) {
        const o = this._scope.objects.find((x) => x.name === draft[entry.params.find((p) => p.type === 'object')?.name]);
        if (o && !o.vars.includes(draft[prm.name])) draft[prm.name] = o.vars[0] ?? '';
      }
      const insert = (item) => {
        const target = kind === 'cond' ? ev.conds : ev.actions;
        const onceAt = target.findIndex((c) => c.type === 'triggerOnce');
        if (kind === 'cond' && entry.trigger) target.unshift(item);
        else if (kind === 'cond' && !entry.once && onceAt >= 0) target.splice(onceAt, 0, item); // keep Trigger once last
        else target.push(item);
        this._sel = ev.id;
        this._changed();
      };
      if (this.guided && entry.params.length) openItemDialog(this, { kind, entry, draft, isNew: true, onDone: insert });
      else insert(draft);
    });
  }

  // ---------- controls ----------
  _options(prm, item, entry) {
    const sc = this._scope;
    switch (prm.type) {
      case 'object': return sc.objects.filter((o) => !prm.kinds || prm.kinds.includes(o.kind)).map((o) => [o.name, o.name]);
      case 'variable': return sc.variables.map((v) => [v, v]);
      case 'instVar': {
        const t = entry.params.find((p) => p.type === 'object');
        const o = sc.objects.find((x) => x.name === item[t?.name]);
        return (o?.vars || []).map((v) => [v, v]);
      }
      case 'operator': return OPERATORS.map((o) => [o, o]);
      case 'screen': return sc.screens.map((s) => [s.id, s.name]);
      case 'showhide': return [['show', 'Show'], ['hide', 'Hide']];
      case 'onoff': return [['on', 'on'], ['off', 'off']];
      case 'key': return KEYS;
      case 'list': return (sc.lists || []).map((n) => [n, n]);
      case 'table': return (sc.tables || []).map((n) => [n, n]);
      case 'field': {
        const t = entry.params.find((p) => p.type === 'table');
        return (sc.tableFields?.[item[t?.name]] || []).map((f) => [f, f]);
      }
      case 'sortdir': return SORT_DIRS;
      case 'picture': return (sc.pictures || []).map((n) => [n, n]);
      case 'sound': return (sc.sounds || []).map((n) => [n, n]);
      case 'posSize': return [['w', 'width'], ['h', 'height'], ['x', 'x position'], ['y', 'y position']];
      case 'function': return (sc.functions || []).map((f) => [f.name, f.name]);
    }
    return [];
  }

  // ctx (optional): { interactive, pickable, changed(), typed(), onExpr(input), pick(prm, apply) }
  // Defaults give inline quick-edit behaviour; the dialogs pass their own.
  _control(prm, item, entry, ctx = {}) {
    const interactive = ctx.interactive ?? this.edit;
    const changed = ctx.changed ?? (() => this._changed());
    const cur = item[prm.name] ?? '';
    if (prm.type === 'expr') return this._exprControl(prm, item, interactive, ctx);
    if (prm.type === 'fields') return this._fieldsControl(prm, item, entry, interactive, ctx);
    if (prm.type === 'args') return this._argsControl(prm, item, entry, interactive, ctx);
    const options = this._options(prm, item, entry);
    const known = options.some(([v]) => v === cur);
    if (!interactive) {
      const label = options.find(([v]) => v === cur)?.[1] ?? cur;
      return h('span', { class: 'val' + (known || cur === '' ? '' : ' bad') }, label || '…');
    }
    const apply = (value) => {
      item[prm.name] = value;
      if (prm.type === 'function') {
        // a value box for each parameter of the newly chosen function (values for the same names are kept)
        const a = entry.params.find((p) => p.type === 'args');
        const f = (this._scope.functions || []).find((x) => x.name === value);
        if (a) item[a.name] = Object.fromEntries((f?.params || []).map((p) => [p, item[a.name]?.[p] ?? '']));
      }
      if (prm.type === 'object' || prm.type === 'table') {
        // keep any variable or field picker of the same item pointing at something that exists
        for (const other of entry.params.filter((p) => p.type === 'instVar' || p.type === 'field')) {
          const opts = this._options(other, item, entry).map(([v]) => v);
          if (!opts.includes(item[other.name])) item[other.name] = opts[0] ?? '';
        }
      }
      changed();
    };
    const sel = h('select', { 'data-ab': 'param:' + prm.name, class: 'ctl' + (known ? '' : ' bad'), title: known ? '' : `"${cur}" doesn't exist on this screen` },
      !known ? h('option', { value: cur, selected: true }, cur ? `${cur} ⚠` : '— choose —') : null,
      options.map(([v, label]) => h('option', { value: v, selected: v === cur }, label)));
    sel.addEventListener('change', () => apply(sel.value));
    const pickable = ctx.pickable ?? (this.edit && this._canPick && this._ui('pick'));
    if (prm.type === 'object' && pickable) {
      const pick = h('button', { 'data-ab': 'pick-on-screen', class: 'icon pick', type: 'button', title: 'Pick it on the screen', 'aria-label': 'Pick on screen',
        onclick: () => (ctx.pick
          ? ctx.pick(prm, apply)
          : this.dispatchEvent(new CustomEvent('pickobject', { bubbles: true, detail: { kinds: prm.kinds, apply } }))) }, '◎');
      return h('span', { class: 'pickwrap' }, sel, pick);
    }
    return sel;
  }

  // "Add a row": one value box per field of the chosen table, labelled with the field's name.
  // The values live in item[prm.name] = { field: expression }.
  _fieldsControl(prm, item, entry, interactive, ctx) {
    const t = entry.params.find((p) => p.type === 'table');
    const fields = this._scope.tableFields?.[item[t?.name]] || [];
    const vals = (item[prm.name] && typeof item[prm.name] === 'object') ? item[prm.name] : (item[prm.name] = {});
    if (!fields.length) return h('span', { class: 'val muted' }, item[t?.name] ? 'this table has no fields yet' : '…');
    return h('span', { class: 'fields' }, fields.map((f) => h('span', { class: 'field-box' },
      h('span', { class: 'lbl field-name' }, f + ' '),
      this._exprControl({ ...prm, name: f, type: 'expr' }, vals, interactive, { ...ctx, dataAb: 'value:' + f }))));
  }

  // "Call SaveEntry with text = …": one value box per parameter of the chosen function, in its order.
  // The values live in item[prm.name] = { param: expression }.
  _argsControl(prm, item, entry, interactive, ctx) {
    const fp = entry.params.find((p) => p.type === 'function');
    const f = (this._scope.functions || []).find((x) => x.name === item[fp?.name]);
    const vals = (item[prm.name] && typeof item[prm.name] === 'object') ? item[prm.name] : (item[prm.name] = {});
    const params = f ? f.params : Object.keys(vals);
    if (!params.length) return h('span', { class: 'args' });
    if (interactive && f) item[prm.name] = Object.fromEntries(params.map((p) => [p, vals[p] ?? '']));
    const live = item[prm.name];
    return h('span', { class: 'fields args' }, h('span', { class: 'lbl' }, 'with '), params.map((p, i) => h('span', { class: 'field-box' },
      h('span', { class: 'lbl field-name' }, p + (interactive ? ' ' : ' = ')),
      this._exprControl({ ...prm, name: p, type: 'expr' }, live, interactive, { ...ctx, dataAb: 'arg:' + p }),
      i < params.length - 1 ? h('span', { class: 'lbl' }, ', ') : null)));
  }

  _exprControl(prm, item, interactive, ctx) {
    const val = String(item[prm.name] ?? '');
    if (!interactive) return h('span', { class: 'val expr' }, val || '…');
    const input = h('input', { 'data-ab': ctx.dataAb || 'param:' + prm.name, class: 'ctl expr', type: 'text', value: val, placeholder: 'value', spellcheck: 'false', autocomplete: 'off', size: Math.max(5, val.length + 1) });
    const validate = () => {
      const msg = check(input.value, this._exprScope);
      input.classList.toggle('bad', !!msg);
      input.title = msg || '';
    };
    validate();
    input.addEventListener('input', () => {
      item[prm.name] = input.value;
      input.size = Math.max(5, input.value.length + 1);
      validate();
    });
    input.addEventListener('change', () => (ctx.typed ?? (() => this._emit()))());
    ctx.onExpr?.(input);
    return input;
  }

  // ---------- helpers used by the dialogs ----------
  _missing(entry) {
    const sc = this._scope;
    for (const prm of entry.params) {
      if (prm.type === 'object' && !sc.objects.some((o) => !prm.kinds || prm.kinds.includes(o.kind))) return prm.kinds ? `Add a ${(COMPONENTS[prm.kinds[0]]?.label || 'matching object').toLowerCase()} first` : 'Add an object first';
      if (prm.type === 'variable' && !sc.variables.length) return 'Add a variable first';
      if (prm.type === 'list' && !(sc.lists || []).length) return 'Add a list first (left side, under Lists)';
      if (prm.type === 'table' && !(sc.tables || []).length) return 'Add a table first (left side, under Tables)';
      if (prm.type === 'instVar' && !sc.objects.some((o) => o.vars.length)) return 'Needs an object with a variable of its own';
      if (prm.type === 'function' && !(sc.functions || []).length) return 'Make a function first (left side, under Functions)';
    }
    return '';
  }

  _blocked(kind, entry, ev, depth) {
    if (kind === 'cond' && entry.trigger) {
      if (this._where === 'function') return "Triggers can't go in a function: calling it is what starts it";
      if (depth > 0) return "Triggers can't go in sub-events";
      if (ev.else) return "An Else event can't have a trigger";
      if (ev.conds.some((c) => CONDITIONS[c.type]?.trigger)) return 'This event already has a trigger';
    }
    return this._missing(entry);
  }
}

if (!customElements.get('event-sheet')) customElements.define('event-sheet', EventSheet);
