// The guided tutorial beside the editor: a step card (bottom right, or a strip along the bottom on small screens)
// and an amber ring on the control to use next. The steps come from a lesson (edu/tutorial.js); this only shows them.
//
// Nothing is ever locked: Back and Next always work, and ticks are worked out from the whole project each time it
// changes, so a student who races ahead finds later steps already ticked, and undoing something un-ticks it.
// The ring follows the lesson clip's clicks in order; clicking (or typing into) the control it points at moves it on.
// If that control isn't on screen it points at the tab it lives on, or at the control that opens it.
// Once a step is built, it points at what to try in the running app (a "Try it" tick, from the clip's expect: lines)
// and then at the live value of any variable the step names, so students watch it change.
import { h } from './dom.js';
import { ticks, mentionedVariables } from '../edu/tutorial.js';

const APP = (sel) => `.view-events .preview-col ${sel}, .view-run ${sel}`; // the running app: preview or Run tab

export function startTutorial({ tutorial, id, getSheet, getTab, getProject, onPlay, store }) {
  const KEY = 'appbuilder.tutorial.' + id + '.step';
  const TRIED = 'appbuilder.tutorial.' + id + '.tried';
  let done = ticks(tutorial, getSheet());
  // what has been tried in the running app ("<step>:<n>") or opened ("<step>:play"); kept, since the app's output moves on
  let tried; try { tried = new Set(JSON.parse(store((ls) => ls.getItem(TRIED)) || '[]')); } catch { tried = new Set(); }
  const mark = (k) => { tried.add(k); store((ls) => ls.setItem(TRIED, JSON.stringify([...tried]))); };
  const built = (i) => done[i] !== false; // ticked, or nothing to tick
  const triedAll = (i) => tutorial.steps[i].tries.every((_, n) => tried.has(`${i}:${n}`));
  const complete = (i) => { const s = tutorial.steps[i]; return s.play ? tried.has(`${i}:play`) : (s.check || s.tries.length) ? built(i) && triedAll(i) : false; };
  const saved = Number(store((ls) => ls.getItem(KEY)));
  let at = Number.isInteger(saved) && saved >= 0 && saved < tutorial.steps.length && store((ls) => ls.getItem(KEY)) !== null ? saved
    : Math.max(0, tutorial.steps.findIndex((_, i) => !complete(i)));
  let ptr = 0;            // which of this step's pointers is next
  let open = true, small = innerWidth < 700, left = false, finished = false; // phones start with just the title

  const ring = h('div', { class: 'tut-ring', 'aria-hidden': 'true' });
  const bubble = h('div', { class: 'tut-bubble', 'aria-hidden': 'true' });
  const card = h('aside', { class: 'tut', 'data-ab': 'tutorial', 'aria-label': 'Tutorial' });
  const reopen = h('button', { class: 'btn tut-reopen', 'data-ab': 'tutorial-open', onclick: () => { open = true; draw(); } }, '\u{1F4D6} Tutorial');
  document.body.append(card, reopen);

  const go = (i) => { at = Math.max(0, Math.min(tutorial.steps.length - 1, i)); ptr = 0; finished = false; store((ls) => ls.setItem(KEY, String(at))); draw(); };

  function draw() {
    card.hidden = !open; reopen.hidden = open;
    card.classList.toggle('small', small); card.classList.toggle('left', left);
    if (!open) { place(); return; }
    const s = tutorial.steps[at];
    const last = at === tutorial.steps.length - 1;
    const ok = complete(at);
    const dots = h('div', { class: 'tut-dots' }, tutorial.steps.map((st, i) => h('button', {
      class: 'tut-dot' + (i === at ? ' on' : '') + (complete(i) ? ' done' : ''), 'data-ab': 'tutorial-step:' + (i + 1),
      title: `Step ${i + 1}: ${st.title}${complete(i) ? ' (done)' : ''}`, 'aria-label': `Step ${i + 1}: ${st.title}${complete(i) ? ', done' : ''}`, onclick: () => go(i),
    })));
    const head = h('div', { class: 'tut-head' },
      h('span', { class: 'tut-count' }, `Step ${at + 1} of ${tutorial.steps.length}`),
      h('span', { class: 'tut-name' }, tutorial.title),
      h('span', { class: 'spacer' }),
      h('button', { class: 'icon', 'data-ab': 'tutorial-side', title: 'Move to the other side', 'aria-label': 'Move the tutorial to the other side', onclick: () => { left = !left; draw(); } }, '⇆'),
      h('button', { class: 'icon', 'data-ab': 'tutorial-shrink', title: small ? 'Show the whole step' : 'Make smaller', 'aria-label': small ? 'Show the whole step' : 'Make the tutorial smaller', 'aria-expanded': String(!small), onclick: () => { small = !small; draw(); } }, small ? '▴' : '▾'),
      h('button', { class: 'icon', 'data-ab': 'tutorial-close', title: 'Hide the tutorial', 'aria-label': 'Hide the tutorial', onclick: () => { open = false; draw(); } }, '✕'));
    const check = [];
    if (s.play) check.push(h('button', { class: 'btn primary tut-play', 'data-ab': 'tutorial-play', onclick: async () => { await onPlay(s.play); mark(`${at}:play`); draw(); } }, '▶ Open the finished app'));
    if (s.check) check.push(h('p', { class: 'tut-check' + (built(at) ? ' ok' : ''), role: 'status' }, built(at) ? '✓ Done: ' : 'This ticks by itself when it’s done: ', s.check.text));
    s.tries.forEach((t, n) => { const y = tried.has(`${at}:${n}`); check.push(h('p', { class: 'tut-check' + (y ? ' ok' : ''), role: 'status' }, (y ? '✓ ' : '') + tryText(t))); });
    if (!check.length) check.push(h('p', { class: 'tut-check none' }, 'When you’ve done this, choose Next.'));
    const nav = h('div', { class: 'tut-nav' },
      h('button', { class: 'btn', 'data-ab': 'tutorial-back', disabled: at === 0, onclick: () => go(at - 1) }, 'Back'),
      h('span', { class: 'spacer' }),
      last ? h('button', { class: 'btn' + (ok || !(s.check || s.tries.length) ? ' primary' : ''), 'data-ab': 'tutorial-finish', onclick: () => { finished = true; draw(); } }, 'Finish')
        : h('button', { class: 'btn' + (ok ? ' primary' : ''), 'data-ab': 'tutorial-next', onclick: () => go(at + 1) }, 'Next'));
    const body = finished
      ? h('div', { class: 'tut-body' }, h('p', {}, tutorial.steps.every((st, i) => st.play || complete(i) || !(st.check || st.tries.length)) ? 'That’s the whole tutorial done. ' : 'That’s the last step. Steps without a tick are still waiting for you. ', 'Keep building, or go back to the lesson for what comes next.'))
      : h('div', { class: 'tut-body' }, markdown(s.body));
    card.replaceChildren(head, h('div', { class: 'tut-main' },
      s.part ? h('p', { class: 'tut-part' }, s.part) : null,
      h('h2', { class: 'tut-title' }, s.title), dots, body, finished ? null : check, nav));
    place();
  }

  // ---------------- the ring ----------------
  const visible = (el) => {
    if (!el || !el.getClientRects().length || el.closest('[hidden]')) return false;
    const modal = document.querySelector('dialog[open]');
    return !modal || modal.contains(el); // behind an open dialog it can't be reached
  };
  const find = (sel) => { try { return [...document.querySelectorAll(sel)].find(visible) || null; } catch { return null; } };
  function target() {
    if (!open || finished) return null;
    const s = tutorial.steps[at], t = s.targets;
    if (!built(at) && ptr < t.length) { // building: follow the clip
      const el = find(t[ptr].selector);
      if (el) return { el, caption: t[ptr].caption };
      const tab = t[ptr].selector.match(/\.view-(\w+)/)?.[1];
      if (tab && getTab() !== tab) { const te = find(`[data-ab='tab:${tab}']`); if (te) return { el: te, caption: `Open the ${tab[0].toUpperCase() + tab.slice(1)} tab.` }; }
      if (ptr > 0) { const back = find(t[ptr - 1].selector); if (back) return { el: back, caption: t[ptr - 1].caption }; }
      return null;
    }
    if (!built(at)) return null;
    const next = s.tries.find((_, n) => !tried.has(`${at}:${n}`)); // built: try it in the running app
    if (next) {
      const el = next.after && find(APP(`[data-ab='widget:${next.after}']`));
      if (el) return { el, caption: `Try it: click ${next.after}.` };
      if (!find(APP('.stage'))) { const te = find("[data-ab='tab:events']"); if (te) return { el: te, caption: 'Open Events to try it in the app.' }; }
      return null;
    }
    const names = (getProject().variables || []).map((v) => v.name); // then watch the variables it names
    const watch = mentionedVariables(s.body, names);
    for (const n of watch) { const el = find(`.side [data-now='${CSS.escape(n)}']`); if (el) return { el, caption: `Watch ${n} here while you use the app.` }; }
    // live values show only while the app runs (Events preview or Run)
    if (watch.length && !find(APP('.stage'))) { const te = find("[data-ab='tab:events']"); if (te) return { el: te, caption: `Open Events to run the app and watch ${watch[0]} change.` }; }
    return null;
  }
  // Has the running app shown what a try asks for? Its text, or (for an object) anything but how it was designed,
  // since students type their own numbers rather than the clip's.
  function checkTries() {
    let changed = false;
    tutorial.steps[at].tries.forEach((t, n) => {
      if (tried.has(`${at}:${n}`)) return;
      const els = [...document.querySelectorAll(APP(t.widget ? `[data-ab='widget:${t.widget}']` : '.stage'))].filter(visible);
      const designed = t.widget ? designText(t.widget) : null;
      if (els.some((el) => { const x = el.textContent || ''; return (t.contains && x.includes(t.contains)) || (designed !== null && x.trim() !== designed.trim()); })) { mark(`${at}:${n}`); changed = true; }
    });
    if (changed) draw();
  }
  const designText = (name) => { for (const sc of getProject().screens || []) for (const o of sc.objects || []) if (o.name === name) return String(o.instances?.[0]?.text ?? ''); return null; };
  function place() {
    const t = target();
    if (!t) { ring.remove(); bubble.remove(); return; }
    const layer = t.el.closest('dialog[open]') || document.body;
    if (ring.parentNode !== layer) layer.append(ring, bubble);
    const r = t.el.getBoundingClientRect();
    Object.assign(ring.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
    bubble.textContent = t.caption || '';
    bubble.hidden = !t.caption;
    const below = r.bottom + 60 < innerHeight;
    Object.assign(bubble.style, { left: Math.max(8, Math.min(innerWidth - 268, r.left)) + 'px', top: (below ? r.bottom + 10 : Math.max(8, r.top - 54)) + 'px' });
    // keep the card off the thing it points at
    const c = card.getBoundingClientRect();
    if (open && !card.hidden && r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom) { left = !left; card.classList.toggle('left', left); }
  }
  // clicking or typing into what the ring points at moves it on (capture: before the editor redraws)
  const advance = (e, action) => {
    const t = tutorial.steps[at].targets;
    for (let k = ptr; k < t.length; k++) {
      if (t[k].action !== action) continue;
      const el = find(t[k].selector);
      if (el && el.contains(e.target)) { ptr = k + 1; setTimeout(place, 0); return; }
    }
  };
  document.addEventListener('click', (e) => advance(e, 'click'), true);
  document.addEventListener('change', (e) => advance(e, 'type'), true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter') advance(e, 'type'); }, true);
  addEventListener('resize', place);
  document.addEventListener('scroll', place, true);
  setInterval(() => { if (open && !finished) checkTries(); place(); }, 250); // the running app, dialogs, tabs, things moving

  draw();
  return {
    changed() {
      const before = done.join();
      done = ticks(tutorial, getSheet());
      if (done.join() !== before) draw(); else place();
    },
  };
}

function tryText(t) {
  const first = t.after ? `click ${t.after} in the app, then ` : '';
  if (!t.widget) return `Try it: ${first}check the app shows \u201C${t.contains}\u201D.`;
  return `Try it: ${first}check ${t.widget} changes${t.contains ? ` (in the lesson it showed \u201C${t.contains}\u201D)` : ''}.`;
}

// The lesson's Markdown, simply: paragraphs, numbered and bulleted lists, **bold**, *italic*, `code`, links.
// Built as DOM nodes from text, never as HTML, so nothing in a lesson can run as code. Pictures are left out.
export function markdown(src) {
  const frag = document.createDocumentFragment();
  const blocks = String(src || '').split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split('\n');
    const kind = /^\s*\d+\.\s/.test(lines[0]) ? 'ol' : /^\s*[-*]\s/.test(lines[0]) ? 'ul' : 'p';
    if (kind === 'p') { const txt = lines.join(' ').trim(); if (txt && !/^!\[[^\]]*\]\([^)]*\)$/.test(txt)) frag.append(h('p', {}, inline(txt))); continue; }
    const list = h(kind, {});
    for (const line of lines) {
      const m = line.match(kind === 'ol' ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/);
      if (m) { list.append(h('li', {})); list.lastChild.dataset.src = m[1]; }
      else if (list.lastChild) list.lastChild.dataset.src += ' ' + line.trim();
    }
    for (const li of list.children) { li.append(...inline(li.dataset.src)); delete li.dataset.src; }
    frag.append(list);
  }
  return frag;
}
function inline(text) {
  const out = [];
  const re = /!\[[^\]]*\]\([^)]*\)|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    out.push(text.slice(last, m.index));
    if (m[1]) out.push(h('strong', {}, inline(m[1])));
    else if (m[2]) out.push(h('em', {}, inline(m[2])));
    else if (m[3]) out.push(h('code', {}, m[3]));
    else if (m[4]) out.push(/^https?:\/\//.test(m[5]) ? h('a', { href: m[5], target: '_blank', rel: 'noopener' }, m[4]) : m[4]);
    last = re.lastIndex;
  }
  out.push(text.slice(last));
  return out;
}
