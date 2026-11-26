// The guided tutorial beside the editor: a step card (bottom right, or a strip along the bottom on small screens)
// and an amber ring on the control to use next. The steps come from a lesson (edu/tutorial.js); this only shows them.
//
// Nothing is ever locked: Back and Next always work, and ticks are worked out from the whole project each time it
// changes, so a student who races ahead finds later steps already ticked, and undoing something un-ticks it.
// The ring follows the lesson clip's clicks in order; clicking (or typing into) the control it points at moves it on.
// If that control isn't on screen it points at the tab it lives on, or at the control that opens it.
import { h } from './dom.js';
import { ticks } from '../edu/tutorial.js';

export function startTutorial({ tutorial, id, getSheet, getTab, store }) {
  const KEY = 'appbuilder.tutorial.' + id + '.step';
  let done = ticks(tutorial, getSheet());
  const saved = Number(store((ls) => ls.getItem(KEY)));
  let at = Number.isInteger(saved) && saved >= 0 && saved < tutorial.steps.length && store((ls) => ls.getItem(KEY)) !== null ? saved
    : Math.max(0, done.findIndex((d) => d !== true));
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
    const ok = done[at] === true;
    const dots = h('div', { class: 'tut-dots' }, tutorial.steps.map((st, i) => h('button', {
      class: 'tut-dot' + (i === at ? ' on' : '') + (done[i] ? ' done' : ''), 'data-ab': 'tutorial-step:' + (i + 1),
      title: `Step ${i + 1}: ${st.title}${done[i] ? ' (done)' : ''}`, 'aria-label': `Step ${i + 1}: ${st.title}${done[i] ? ', done' : ''}`, onclick: () => go(i),
    })));
    const head = h('div', { class: 'tut-head' },
      h('span', { class: 'tut-count' }, `Step ${at + 1} of ${tutorial.steps.length}`),
      h('span', { class: 'tut-name' }, tutorial.title),
      h('span', { class: 'spacer' }),
      h('button', { class: 'icon', 'data-ab': 'tutorial-side', title: 'Move to the other side', 'aria-label': 'Move the tutorial to the other side', onclick: () => { left = !left; draw(); } }, '⇆'),
      h('button', { class: 'icon', 'data-ab': 'tutorial-shrink', title: small ? 'Show the whole step' : 'Make smaller', 'aria-label': small ? 'Show the whole step' : 'Make the tutorial smaller', 'aria-expanded': String(!small), onclick: () => { small = !small; draw(); } }, small ? '▴' : '▾'),
      h('button', { class: 'icon', 'data-ab': 'tutorial-close', title: 'Hide the tutorial', 'aria-label': 'Hide the tutorial', onclick: () => { open = false; draw(); } }, '✕'));
    const check = s.check
      ? h('p', { class: 'tut-check' + (ok ? ' ok' : ''), role: 'status' }, ok ? '✓ Done: ' : 'This ticks by itself when it’s done: ', s.check.text)
      : h('p', { class: 'tut-check none' }, 'When you’ve done this, choose Next.');
    const nav = h('div', { class: 'tut-nav' },
      h('button', { class: 'btn', 'data-ab': 'tutorial-back', disabled: at === 0, onclick: () => go(at - 1) }, 'Back'),
      h('span', { class: 'spacer' }),
      last ? h('button', { class: 'btn' + (ok || !s.check ? ' primary' : ''), 'data-ab': 'tutorial-finish', onclick: () => { finished = true; draw(); } }, 'Finish')
        : h('button', { class: 'btn' + (ok ? ' primary' : ''), 'data-ab': 'tutorial-next', onclick: () => go(at + 1) }, 'Next'));
    const body = finished
      ? h('div', { class: 'tut-body' }, h('p', {}, done.every((d) => d !== false) ? 'That’s the whole tutorial done. ' : 'That’s the last step. Steps without a tick are still waiting for you. ', 'Keep building, or go back to the lesson for what comes next.'))
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
    const t = tutorial.steps[at].targets;
    if (!open || finished || done[at] === true || ptr >= t.length) return null;
    const el = find(t[ptr].selector);
    if (el) return { el, caption: t[ptr].caption };
    const tab = t[ptr].selector.match(/\.view-(\w+)/)?.[1];
    if (tab && getTab() !== tab) { const te = find(`[data-ab='tab:${tab}']`); if (te) return { el: te, caption: `Open the ${tab[0].toUpperCase() + tab.slice(1)} tab.` }; }
    if (ptr > 0) { const back = find(t[ptr - 1].selector); if (back) return { el: back, caption: t[ptr - 1].caption }; }
    return null;
  }
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
  setInterval(place, 250); // dialogs opening, tabs changing, things moving

  draw();
  return {
    changed() {
      const before = done.join();
      done = ticks(tutorial, getSheet());
      if (done.join() !== before) draw(); else place();
    },
  };
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
