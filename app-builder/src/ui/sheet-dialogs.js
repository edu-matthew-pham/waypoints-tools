// Dialogs for the guided event editor: a chooser ("what kind of condition/action?") and a
// fill-in-the-blanks form for one condition or action. Native <dialog>: focus trap, Esc, backdrop.
import { h } from './dom.js';
import { CONDITIONS, ACTIONS } from '../core/catalog.js';
import { check, OPERATORS, highlight, FUNCTION_HELP, OPERATOR_HELP } from '../core/expr.js';
import { COMPONENTS } from '../core/components.js';
import { ICONS, FALLBACK_ICON } from './component-ui.js';

const CATEGORIES = ['Screen', 'Object', 'Keyboard', 'Variables', 'System'];
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

// Two steps, like Construct: a grid of "what is it about?" (System, Keyboard, Variables, and each object on
// this screen), then a short list of just that thing's conditions or actions. Typing in search skips to one
// flat list. onPick(type, preset) gets the catalog id and any values already chosen (e.g. the object).
const GROUPS = [
  { id: 'Screen', label: 'Screen', icon: 'screen' },
  { id: 'System', label: 'System', icon: 'system' },
  { id: 'Keyboard', label: 'Keyboard', icon: 'keyboard' },
  { id: 'Variables', label: 'Variables', icon: 'variables' },
];
const objParam = (e) => e.params.find((p) => p.type === 'object');
const fitsObject = (e, o) => { const p = objParam(e); return !!p && (!p.kinds || p.kinds.includes(o.kind)); };

export function openChooser(sheet, kind, ev, depth, onPick) {
  const table = kind === 'cond' ? CONDITIONS : ACTIONS;
  const usable = Object.entries(table).filter(([type]) => sheet._can(kind, type));
  const body = h('div', { class: 'es-list' });
  let m;

  const entryBtn = ([type, entry], why, label, preset) => h('button', {
    class: 'es-entry' + (entry.trigger ? ' trig' : ''), type: 'button', disabled: !!why, title: why,
    onclick: () => { m.close(); onPick(type, preset); },
  }, entry.trigger ? '⚡ ' : '', label, why ? h('small', {}, why) : entry.help ? h('small', { class: 'help' }, entry.help) : null);

  // why an entry can't be used for this particular object (or '' if it can)
  const whyFor = (entry, o) => {
    const b = sheet._blocked(kind, { ...entry, params: entry.params.filter((p) => p.type !== 'object' && p.type !== 'instVar') }, ev, depth);
    if (b) return b;
    if (entry.params.some((p) => p.type === 'instVar') && !o.vars.length) return `Give ${o.name} a variable of its own first`;
    return '';
  };

  function grid() {
    title.textContent = kind === 'cond' ? 'Add a condition' : 'Add an action';
    const tile = (label, iconSvg, sub, onclick) => {
      const ic = h('span', { class: 'op-icon' }); ic.innerHTML = iconSvg;
      return h('button', { class: 'op-tile small', type: 'button', onclick }, ic, h('strong', {}, label), sub ? h('small', {}, sub) : null);
    };
    const general = GROUPS.map((g) => [g, usable.filter(([, e]) => e.category === g.id && !objParam(e))])
      .filter(([, list]) => list.length)
      .map(([g, list]) => tile(g.label, ICONS[g.icon] || FALLBACK_ICON, null, () => listFor(g.label, list.map((x) => entryBtn(x, sheet._blocked(kind, x[1], ev, depth), plain(x[1].label))))));
    const objs = sheet._scope.objects
      .map((o) => [o, usable.filter(([, e]) => fitsObject(e, o))])
      .filter(([, list]) => list.length)
      .map(([o, list]) => tile(o.name, ICONS[o.kind] || FALLBACK_ICON, COMPONENTS[o.kind]?.label, () => listFor(o.name, list.map((x) => {
        const p = objParam(x[1]);
        return entryBtn(x, whyFor(x[1], o), plain(x[1].label.replace(`{${p.name}}`, o.name)), { [p.name]: o.name });
      }))));
    body.replaceChildren(
      h('div', { class: 'op-grid small' }, general),
      objs.length ? h('div', { class: 'es-cat' }, 'On this screen') : null,
      objs.length ? h('div', { class: 'op-grid small' }, objs) : h('p', { class: 'muted' }, 'Add objects on the Design tab to see what they can do here.'));
    body.querySelector('.op-tile')?.focus();
  }

  function listFor(name, buttons) {
    title.textContent = name;
    body.replaceChildren(h('button', { class: 'mini back', type: 'button', onclick: () => { search.value = ''; grid(); } }, '← Back'), ...buttons);
    body.querySelector('.es-entry:not(:disabled)')?.focus();
  }

  function flat(q) {
    title.textContent = kind === 'cond' ? 'Add a condition' : 'Add an action';
    body.replaceChildren();
    for (const cat of CATEGORIES) {
      const hits = usable.filter(([, e]) => e.category === cat && plain(e.label).toLowerCase().includes(q.toLowerCase()));
      if (!hits.length) continue;
      body.append(h('div', { class: 'es-cat' }, cat), ...hits.map((x) => entryBtn(x, sheet._blocked(kind, x[1], ev, depth), plain(x[1].label))));
    }
    if (!body.children.length) body.append(h('p', { class: 'muted' }, 'Nothing matches.'));
  }

  const search = h('input', { class: 'ctl', type: 'search', placeholder: kind === 'cond' ? 'Search conditions…' : 'Search actions…', 'aria-label': 'Search',
    oninput: () => (search.value.trim() ? flat(search.value.trim()) : grid()) });
  m = modal(kind === 'cond' ? 'Add a condition' : 'Add an action', [search, body]);
  const title = m.dlg.querySelector('.dlg-head strong');
  grid();
}

// Edit one condition/action as a sentence with blanks. `draft` is a copy; nothing changes
// until Done. onDone(draft), onDelete() (omit for a new item).
export function openItemDialog(sheet, { kind, entry, draft, isNew, onDone, onDelete }) {
  const sentence = h('div', { class: 'es-sentence' });
  const chips = h('div', { class: 'es-chips' });
  const helps = h('div', { class: 'es-helps' });
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
    exprs.forEach(colourBox);
    const exprParams = entry.params.filter((p) => p.type === 'expr');
    helps.replaceChildren(...exprParams.map((p) => h('p', { class: 'es-help' },
      exprParams.length > 1 ? h('strong', {}, (p.name === 'left' ? 'First value' : p.name === 'right' ? 'Second value' : 'Value') + ': ') : null, p.help || '')));
    chips.replaceChildren();
    if (exprParams.length) {
      chips.append(h('button', { class: 'btn find-btn', type: 'button', onclick: () => openExpressionBrowser(sheet, insert) }, '\ud83d\udd0d Find expressions'));
    }
    if (entry.params.some((p) => p.type === 'expr')) {
      const sc = sheet._scope;
      const names = [
        ...sc.variables,
        ...sc.objects.flatMap((o) => [...(o.kind === 'input' ? [`${o.name}.text`] : []), ...o.vars.map((v) => `${o.name}.${v}`)]),
      ];
      if (names.length) {
        chips.append(h('span', { class: 'muted' }, 'Names: '),
          ...names.map((n) => h('button', { class: 'chip', type: 'button', title: `Insert ${n}`, onclick: () => insert(n) }, n)));
      }
    }
    if (entry.params.some((p) => p.type === 'expr') && sheet._ui('choice')) {
      chips.append(h('button', { class: 'btn choice-btn', type: 'button', title: 'Use one value or another depending on a test',
        onclick: () => openChoiceBuilder(sheet, (code) => { insert(code); }) }, '\u21c4 Choose between two values'));
    }
    validate();
  }
  function insert(text, back = 0) {
    const input = lastExpr && exprs.includes(lastExpr) ? lastExpr : exprs[exprs.length - 1];
    if (!input) return;
    const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? s;
    input.setRangeText(text, s, e, 'end');
    if (back) input.setSelectionRange(input.selectionEnd - back, input.selectionEnd - back);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  const cancel = h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel');
  const del = !isNew && onDelete ? h('button', { class: 'btn danger', type: 'button', onclick: () => { m.close(); onDelete(); } }, 'Delete') : null;
  done.addEventListener('click', () => { m.close(); onDone(draft); });

  const title = (isNew ? 'Add ' : 'Change ') + (kind === 'cond' ? (isNew ? 'a condition' : 'this condition') : (isNew ? 'an action' : 'this action'));
  const m = modal(title, [h('p', { class: 'muted' }, kind === 'cond' ? 'This must be true for the event to run.' : 'Do this when the event runs.'), sentence, helps, errs, chips],
    [del, h('span', { class: 'spacer' }), cancel, done]);
  const dlg = m.dlg;
  draw();
  sentence.querySelector('select, input')?.focus();
}

// "Choose between two values": fill-in-the-blanks that writes if(test, yes, no) for the student.
// onInsert(code) is called with the finished text. Opens on top of the item dialog.
export function openChoiceBuilder(sheet, onInsert) {
  const sc = sheet._scope;
  const names = [
    ...sc.variables,
    ...sc.objects.flatMap((o) => [...(o.kind === 'input' ? [`${o.name}.text`] : []), ...o.vars.map((v) => `${o.name}.${v}`)]),
  ];
  const errs = h('div', { class: 'es-errs', 'aria-live': 'polite' });
  const code = h('code', { class: 'cb-code' });
  const add = h('button', { class: 'btn primary', type: 'button' }, 'Use this');
  const exprs = [];
  const box = (ph, label) => {
    const input = h('input', { class: 'ctl expr', type: 'text', placeholder: ph, 'aria-label': label, spellcheck: 'false', autocomplete: 'off', size: 14 });
    exprs.push(input);
    input.addEventListener('input', update);
    return input;
  };
  const left = names.length
    ? h('select', { class: 'ctl', 'aria-label': 'Compare this', onchange: () => update() }, names.map((n) => h('option', { value: n }, n)))
    : null;
  const op = h('select', { class: 'ctl', 'aria-label': 'Comparison', onchange: () => update() }, OPERATORS.map((o) => h('option', { value: o }, o)));
  op.value = '≥';
  const right = box('a value, e.g. 10', 'Compare with');
  const yes = box('e.g. "Goal reached!"', 'Use this value');
  const no = box('e.g. "Keep going"', 'Otherwise use');

  function update() {
    const text = left ? `if(${left.value} ${op.value} ${right.value.trim()}, ${yes.value.trim()}, ${no.value.trim()})` : '';
    code.textContent = text;
    const filled = exprs.every((i) => i.value.trim());
    const msgs = [];
    for (const i of exprs) {
      const msg = i.value.trim() ? check(i.value, sheet._exprScope) : null;
      i.classList.toggle('bad', !!msg);
      if (msg) msgs.push(msg);
    }
    if (left && filled && !msgs.length) { const whole = check(text, sheet._exprScope); if (whole) msgs.push(whole); }
    errs.replaceChildren(...msgs.map((t) => h('p', {}, '\u26a0 ' + t)));
    add.disabled = !left || !filled || msgs.length > 0;
  }

  const row = (...kids) => h('div', { class: 'cb-row' }, ...kids);
  const body = left
    ? [h('p', { class: 'muted' }, 'The value will depend on a test. Pick what to test, then what to use each way.'),
       row(h('span', { class: 'lbl' }, 'If'), left, op, right),
       row(h('span', { class: 'lbl' }, 'use'), yes),
       row(h('span', { class: 'lbl' }, 'otherwise use'), no),
       errs, h('div', { class: 'cb-preview' }, h('span', { class: 'muted' }, 'This writes: '), code)]
    : [h('p', { class: 'muted' }, 'Add a variable first (left side of the app), then you can choose between two values based on it.')];
  const cancel = h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel');
  add.addEventListener('click', () => { m.close(); onInsert(code.textContent); });
  const m = modal('Choose between two values', body, [h('span', { class: 'spacer' }), cancel, add]);
  update();
  (left || m.dlg.querySelector('button')).focus();
}

// Colour an expression box as you type (like Construct): a coloured copy sits behind a see-through input.
function colourBox(input) {
  if (input.parentElement?.classList.contains('hl')) return;
  const mirror = h('span', { class: 'hl-mirror', 'aria-hidden': 'true' });
  const wrap = h('span', { class: 'hl' }, mirror);
  input.replaceWith(wrap);
  wrap.append(input);
  input.removeAttribute('size');
  const paint = () => {
    mirror.replaceChildren(...highlight(input.value).map(([k, t]) => h('span', { class: 'hl-' + k }, t)), '​');
    mirror.scrollLeft = input.scrollLeft;
  };
  input.addEventListener('input', paint);
  input.addEventListener('scroll', () => { mirror.scrollLeft = input.scrollLeft; });
  input.addEventListener('keyup', () => { mirror.scrollLeft = input.scrollLeft; });
  paint();
}

// "Find expressions": everything you can use in a value, with a plain description and an example. Click to insert.
export function openExpressionBrowser(sheet, insert) {
  const sc = sheet._scope;
  const PROP_HELP = { text: 'its text', value: 'its number', on: 'true if switched on', min: 'its smallest value', max: 'its largest value', visible: 'true if showing', x: 'distance from the left', y: 'distance from the top', w: 'its width', h: 'its height' };
  const sections = [
    ['Variables', sc.variables.map((v) => ({ code: v, desc: 'whole-app variable' }))],
    ...sc.objects.map((o) => [o.name + ' (' + (COMPONENTS[o.kind]?.label || o.kind) + ')', [
      ...['text', ...(COMPONENTS[o.kind]?.exposes || [])].filter((p, i, a) => a.indexOf(p) === i).map((p) => ({ code: `${o.name}.${p}`, desc: PROP_HELP[p] })),
      ...o.vars.map((v) => ({ code: `${o.name}.${v}`, desc: 'its own variable' })),
      ...['visible', 'x', 'y', 'w', 'h'].map((p) => ({ code: `${o.name}.${p}`, desc: PROP_HELP[p], extra: true })),
    ]]),
    ['Joining and maths', OPERATOR_HELP.map(([op, desc, ex]) => ({ code: op.split(/\s+/)[0], label: op, desc, ex }))],
    ['Functions', Object.values(FUNCTION_HELP).map(([sig, desc, ex]) => ({ code: sig.replace(/\(.*\)/, '()'), label: sig, desc, ex, fn: true }))],
  ];
  const body = h('div', { class: 'xb' });
  let m;
  const draw = (q = '') => {
    body.replaceChildren();
    const ql = q.toLowerCase();
    for (const [title, items] of sections) {
      const hits = items.filter((it) => !ql ? !it.extra : (it.label || it.code).toLowerCase().includes(ql) || (it.desc || '').toLowerCase().includes(ql));
      if (!hits.length) continue;
      body.append(h('div', { class: 'es-cat' }, title), ...hits.map((it) => h('button', { class: 'xb-item', type: 'button', title: 'Insert ' + it.code,
        onclick: () => {
          m.close();
          // functions go in with the cursor between the brackets
          insert(it.code, it.fn ? 1 : 0);
        } },
        h('code', {}, it.label || it.code), h('span', { class: 'xb-desc' }, it.desc || ''), it.ex ? h('small', {}, 'e.g. ' + it.ex) : null)));
    }
    if (!body.children.length) body.append(h('p', { class: 'muted' }, 'Nothing matches.'));
  };
  const search = h('input', { class: 'ctl', type: 'search', placeholder: 'Search, e.g. round, text, join…', 'aria-label': 'Search expressions', oninput: () => draw(search.value.trim()) });
  m = modal('Find expressions', [h('p', { class: 'muted' }, 'Click one to put it in the value box. Position and size are found by searching (e.g. "x").'), search, body]);
  draw();
  search.focus();
}
