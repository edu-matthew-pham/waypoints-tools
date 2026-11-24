// <event-sheet>: the reusable event editor / viewer.
//
//   const el = document.createElement('event-sheet');
//   el.setData({ events, scope, exprScope, mode, canPick, features });
//       mode: 'guided'   clean read view; click a condition/action to edit it in a dialog (beginners)
//             'edit'     quick edit: dropdowns and boxes inline (confident users)
//             'readonly' static (lesson pages, Run tab)
//       features: resolved feature list (core/features.js), or null for everything
//   el.addEventListener('sheetchange', ...)   // the events array was edited in place
//   el.addEventListener('pickobject', e => e.detail.apply(name) / e.detail.cancel())
//        // the host lets the user click an object on screen; only offered when canPick is true
//   el.flash(eventId)                          // highlight a row (tracing a running app)
//
// It only knows the catalog and plain JSON. Nothing here depends on the stage or runtime,
// so the same element can sit in a lesson page or in the editor.
import { OPERATORS, defaultParams, validateSheet, entryFor, CONDITIONS, KEYS } from '../core/catalog.js';
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
    this._sel = null;
    this._timers = new Map();
  }

  setData({ events, scope, exprScope, mode = 'edit', canPick = false, features = null }) {
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
  _can(kind, type) { return canUse(this._features, kind, type); }

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
    for (const i of validateSheet(this._events)) issues.set(i.id, [...(issues.get(i.id) || []), i.message]);
    const root = h('div', { class: 'es' + (this.guided ? ' guided' : this.edit ? '' : ' ro') });
    if (!this._events.length) {
      root.append(h('p', { class: 'es-empty' }, this.edit || this.guided ? 'No events on this screen yet. An event says: when this happens, do that.' : 'No events on this screen.'));
    }
    root.append(...this._rows(this._events, 0, issues));
    if (this.edit || this.guided) {
      root.append(h('button', { class: 'btn es-addev', type: 'button', onclick: () => {
        const ev = newEvent();
        this._events.push(ev);
        this._sel = ev.id;
        this._changed();
      } }, '+ Add event'));
    }
    return root;
  }

  _addBtn(kind, ev, depth) {
    return h('button', { class: 'mini', type: 'button', onclick: () => this._add(kind, ev, depth) }, kind === 'cond' ? '+ Condition' : '+ Action');
  }

  _rows(list, depth, issues) {
    return list.map((ev, i) => {
      const msgs = issues.get(ev.id);
      const sel = this.guided && this._sel === ev.id;
      const row = h('div', {
        class: 'ev' + (ev.else ? ' else' : '') + (msgs ? ' bad' : '') + (sel ? ' sel' : ''),
        'data-id': ev.id, tabindex: this.guided ? '0' : null,
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
      else if (!ev.actions.length && this.guided) acts.append(h('span', { class: 'muted' }, '(no actions yet)'));

      const main = h('div', { class: 'ev-main' }, conds, acts);
      if (this.edit) main.append(this._tools(list, i, ev));
      else if (sel) main.append(h('div', { class: 'ev-tools' },
        h('button', { class: 'icon', type: 'button', title: 'More', 'aria-label': 'More actions for this event', 'aria-haspopup': 'menu',
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
    const el = h(guided ? 'button' : 'div', { class: 'item ' + kind + (entry?.trigger ? ' trig' : '') + (guided ? ' guided' : ''), type: guided ? 'button' : null });
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
    this._sel = ev.id;
    openItemDialog(this, {
      kind, entry, draft: structuredClone(list[idx]), isNew: false,
      onDone: (d) => { list[idx] = d; this._changed(); },
      onDelete: () => { list.splice(idx, 1); this._changed(); },
    });
  }

  _add(kind, ev, depth) {
    openChooser(this, kind, ev, depth, (type) => {
      const entry = entryFor(kind, type);
      const draft = { type, ...defaultParams(entry, this._scope) };
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
    const options = this._options(prm, item, entry);
    const known = options.some(([v]) => v === cur);
    if (!interactive) {
      const label = options.find(([v]) => v === cur)?.[1] ?? cur;
      return h('span', { class: 'val' + (known || cur === '' ? '' : ' bad') }, label || '…');
    }
    const apply = (value) => {
      item[prm.name] = value;
      if (prm.type === 'object') {
        // keep any variable picker of the same item pointing at something that exists
        for (const other of entry.params.filter((p) => p.type === 'instVar')) {
          const opts = this._options(other, item, entry).map(([v]) => v);
          if (!opts.includes(item[other.name])) item[other.name] = opts[0] ?? '';
        }
      }
      changed();
    };
    const sel = h('select', { class: 'ctl' + (known ? '' : ' bad'), title: known ? '' : `"${cur}" doesn't exist on this screen` },
      !known ? h('option', { value: cur, selected: true }, cur ? `${cur} ⚠` : '— choose —') : null,
      options.map(([v, label]) => h('option', { value: v, selected: v === cur }, label)));
    sel.addEventListener('change', () => apply(sel.value));
    const pickable = ctx.pickable ?? (this.edit && this._canPick && this._ui('pick'));
    if (prm.type === 'object' && pickable) {
      const pick = h('button', { class: 'icon pick', type: 'button', title: 'Pick it on the screen', 'aria-label': 'Pick on screen',
        onclick: () => (ctx.pick
          ? ctx.pick(prm, apply)
          : this.dispatchEvent(new CustomEvent('pickobject', { bubbles: true, detail: { kinds: prm.kinds, apply } }))) }, '◎');
      return h('span', { class: 'pickwrap' }, sel, pick);
    }
    return sel;
  }

  _exprControl(prm, item, interactive, ctx) {
    const val = String(item[prm.name] ?? '');
    if (!interactive) return h('span', { class: 'val expr' }, val || '…');
    const input = h('input', { class: 'ctl expr', type: 'text', value: val, placeholder: 'value', spellcheck: 'false', autocomplete: 'off', size: Math.max(5, val.length + 1) });
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
      if (prm.type === 'instVar' && !sc.objects.some((o) => o.vars.length)) return 'Needs an object with a variable of its own';
    }
    return '';
  }

  _blocked(kind, entry, ev, depth) {
    if (kind === 'cond' && entry.trigger) {
      if (depth > 0) return "Triggers can't go in sub-events";
      if (ev.else) return "An Else event can't have a trigger";
      if (ev.conds.some((c) => CONDITIONS[c.type]?.trigger)) return 'This event already has a trigger';
    }
    return this._missing(entry);
  }
}

if (!customElements.get('event-sheet')) customElements.define('event-sheet', EventSheet);
