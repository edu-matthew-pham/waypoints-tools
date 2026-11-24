// Dialogs for the guided event editor: a chooser ("what kind of condition/action?") and a
// fill-in-the-blanks form for one condition or action. Native <dialog>: focus trap, Esc, backdrop.
import { h } from './dom.js';
import { CONDITIONS, ACTIONS } from '../core/catalog.js';
import { check } from '../core/expr.js';

const CATEGORIES = ['Screen', 'Object', 'Variables', 'System'];
const plain = (label) => label.replace(/\{\w+\}/g, '\u2026');

export function modal(title, body, foot) {
  const dlg = h('dialog', { class: 'es-dlg' });
  const close = () => { if (dlg.open) dlg.close(); };
  dlg.append(
    h('div', { class: 'dlg-head' }, h('strong', {}, title), h('button', { class: 'icon', type: 'button', title: 'Close', onclick: close }, '\u00d7')),
    h('div', { class: 'dlg-body' }, body));
  if (foot) dlg.append(h('div', { class: 'dlg-foot' }, foot));
  dlg.addEventListener('close', () => { if (!dlg._keep) dlg.remove(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, close };
}

// onPick(type) is called with the chosen catalog id.
export function openChooser(sheet, kind, ev, depth, onPick) {
  const table = kind === 'cond' ? CONDITIONS : ACTIONS;
  const list = h('div', { class: 'es-list' });
  let m;
  const draw = (q = '') => {
    list.replaceChildren();
    for (const cat of CATEGORIES) {
      const entries = Object.entries(table).filter(([type, e]) =>
        e.category === cat && sheet._can(kind, type) && plain(e.label).toLowerCase().includes(q.toLowerCase()));
      if (!entries.length) continue;
      list.append(h('div', { class: 'es-cat' }, cat));
      for (const [type, entry] of entries) {
        const why = sheet._blocked(kind, entry, ev, depth);
        list.append(h('button', {
          class: 'es-entry' + (entry.trigger ? ' trig' : ''), type: 'button', disabled: !!why, title: why,
          onclick: () => { m.close(); onPick(type); },
        }, entry.trigger ? '\u26a1 ' : '', plain(entry.label), why ? h('small', {}, why) : null));
      }
    }
    if (!list.children.length) list.append(h('p', { class: 'muted' }, 'Nothing matches.'));
  };
  const search = h('input', { class: 'ctl', type: 'search', placeholder: kind === 'cond' ? 'Search conditions\u2026' : 'Search actions\u2026', 'aria-label': 'Search', oninput: () => draw(search.value) });
  m = modal(kind === 'cond' ? 'Add a condition' : 'Add an action', [search, list]);
  draw();
  search.focus();
}

// Edit one condition/action as a sentence with blanks. `draft` is a copy; nothing changes
// until Done. onDone(draft), onDelete() (omit for a new item).
export function openItemDialog(sheet, { kind, entry, draft, isNew, onDone, onDelete }) {
  const sentence = h('div', { class: 'es-sentence' });
  const chips = h('div', { class: 'es-chips' });
  const errs = h('div', { class: 'es-errs', 'aria-live': 'polite' });
  const exprs = [];
  let lastExpr = null;

  const done = h('button', { class: 'btn primary', type: 'button' }, isNew ? 'Add' : 'Done');
  const validate = () => {
    const msgs = [];
    for (const input of exprs) {
      const msg = check(input.value, sheet._exprScope);
      input.classList.toggle('bad', !!msg);
      if (msg) msgs.push(msg);
    }
    errs.replaceChildren(...msgs.map((t) => h('p', {}, '\u26a0 ' + t)));
    done.disabled = msgs.length > 0;
  };

  const ctx = {
    interactive: true,
    pickable: sheet._canPick && sheet._ui('pick'),
    changed: () => draw(),
    typed: () => {},
    onExpr: (input) => {
      exprs.push(input);
      input.addEventListener('input', validate);
      input.addEventListener('focus', () => { lastExpr = input; });
    },
    // close while the user clicks an object on the screen, then come back
    pick: (prm, apply) => {
      dlg._keep = true;
      dlg.close();
      const back = () => { dlg._keep = false; dlg.showModal(); draw(); };
      sheet.dispatchEvent(new CustomEvent('pickobject', { bubbles: true, detail: { kinds: prm.kinds, apply: (name) => { apply(name); back(); }, cancel: back } }));
    },
  };

  function draw() {
    exprs.length = 0;
    sentence.replaceChildren();
    for (const part of entry.label.split(/(\{\w+\})/)) {
      const mt = part.match(/^\{(\w+)\}$/);
      if (!mt) { if (part) sentence.append(h('span', { class: 'lbl' }, part)); continue; }
      const prm = entry.params.find((p) => p.name === mt[1]);
      if (prm) sentence.append(sheet._control(prm, draft, entry, ctx));
    }
    chips.replaceChildren();
    if (entry.params.some((p) => p.type === 'expr')) {
      const sc = sheet._scope;
      const names = [
        ...sc.variables,
        ...sc.objects.flatMap((o) => [...(o.kind === 'input' ? [`${o.name}.text`] : []), ...o.vars.map((v) => `${o.name}.${v}`)]),
      ];
      if (names.length) {
        chips.append(h('span', { class: 'muted' }, 'Click to use a name: '),
          ...names.map((n) => h('button', { class: 'chip', type: 'button', title: `Insert ${n}`, onclick: () => insert(n) }, n)));
      }
    }
    validate();
  }
  function insert(text) {
    const input = lastExpr && exprs.includes(lastExpr) ? lastExpr : exprs[exprs.length - 1];
    if (!input) return;
    const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? s;
    input.setRangeText(text, s, e, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  const cancel = h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel');
  const del = !isNew && onDelete ? h('button', { class: 'btn danger', type: 'button', onclick: () => { m.close(); onDelete(); } }, 'Delete') : null;
  done.addEventListener('click', () => { m.close(); onDone(draft); });

  const title = (isNew ? 'Add ' : 'Change ') + (kind === 'cond' ? (isNew ? 'a condition' : 'this condition') : (isNew ? 'an action' : 'this action'));
  const m = modal(title, [h('p', { class: 'muted' }, kind === 'cond' ? 'This must be true for the event to run.' : 'Do this when the event runs.'), sentence, errs, chips],
    [del, h('span', { class: 'spacer' }), cancel, done]);
  const dlg = m.dlg;
  draw();
  sentence.querySelector('select, input')?.focus();
}
