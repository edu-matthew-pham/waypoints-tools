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
import { ticks, mentionedVariables, clipUrls, hintsOf, todo } from '../edu/tutorial.js';
import { COMPONENTS } from '../core/components.js';

const OBJECTISH = /add-object|kind:|object-menu|menu:rename/; // clip moves that add or rename objects (a rename box only after menu:rename: functions are renamed in it too)
const VARISH = /new-variable-/; // clip moves that make a variable
const APP = (sel) => `.view-events .preview-col ${sel}, .view-run ${sel}`; // the running app: preview or Run tab

export function startTutorial({ tutorial, id, lessonUrl, getSheet, getTab, getProject, onPlay, store }) {
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
  let cheer = -1; // the step that has just been completed: a green "Step done" banner until the student moves on

  const ring = h('div', { class: 'tut-ring', 'aria-hidden': 'true' });
  const bubble = h('div', { class: 'tut-bubble', 'aria-hidden': 'true' });
  const card = h('aside', { class: 'tut', 'data-ab': 'tutorial', 'aria-label': 'Tutorial' });
  const reopen = h('button', { class: 'btn tut-reopen', 'data-ab': 'tutorial-open', onclick: () => { open = true; draw(); } });
  document.body.append(card, reopen);

  const go = (i) => { at = Math.max(0, Math.min(tutorial.steps.length - 1, i)); ptr = 0; card.dataset.next = tutorial.steps[at].targets[0]?.selector || ''; finished = false; cheer = -1; wasAt = at; wasComplete = complete(at); store((ls) => ls.setItem(KEY, String(at))); draw(); };

  function draw() {
    card.hidden = !open; reopen.hidden = open;
    card.classList.toggle('small', small); card.classList.toggle('left', left); card.classList.toggle('cheer', cheer === at);
    reopen.classList.toggle('cheer', cheer === at);
    reopen.textContent = cheer === at ? '\u2713 Step done: show the tutorial' : '\u{1F4D6} Tutorial';
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
    if (s.play) check.push(h('button', { class: 'btn primary tut-play', 'data-ab': 'tutorial-play', onclick: () => { mark(`${at}:play`); celebrate(); draw(); onPlay(s.play, { next: at + 1 < tutorial.steps.length ? tutorial.steps[at + 1].title : '', onNext: () => go(at + 1) }); } }, '▶ Open the finished app'));
    if (s.check) {
      check.push(h('p', { class: 'tut-check' + (built(at) ? ' ok' : ''), role: 'status' }, built(at) ? '✓ Done: ' : 'This ticks by itself when it’s done: ', s.check.text));
      const items = built(at) ? [] : todo(s.check.rules, getSheet());
      if (items.length) check.push(h('ul', { class: 'tut-todo', 'data-ab': 'tutorial-todo' }, items.map((i) => h('li', { class: i.ok ? 'ok' : '' }, (i.ok ? '✓ ' : '○ ') + i.label))));
    }
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
    const banner = cheer === at && !finished ? h('div', { class: 'tut-cheer', role: 'status' },
      h('strong', {}, '\u2713 Step done!'), last ? ' That was the last step.' : [' Next: ', tutorial.steps[at + 1].title,
        h('button', { class: 'btn', 'data-ab': 'tutorial-cheer-next', onclick: () => go(at + 1) }, 'Next \u25B8')]) : null;
    // Back and Next stay at the bottom of the card, however long the step's text is
    card.replaceChildren(head, h('div', { class: 'tut-main' }, banner,
      s.part ? h('p', { class: 'tut-part' }, s.part) : null,
      h('h2', { class: 'tut-title' }, s.title), dots, body, finished ? null : check, finished ? null : stuck(s)), nav);
    place();
  }

  const stuck = (s) => stuckSection(s, lessonUrl);

  // ---------------- the ring ----------------
  const visible = (el) => {
    if (!el || !el.getClientRects().length || el.closest('[hidden]')) return false;
    const modal = document.querySelector('dialog[open]');
    return !modal || modal.contains(el); // behind an open dialog it can't be reached
  };
  const find = (sel) => { try { const { css, nth } = parseSel(sel); const all = [...document.querySelectorAll(css)].filter(visible); return (nth == null ? all[0] : all[nth]) || null; } catch { return null; } };
  function target() {
    if (!open || finished) return null;
    const s = tutorial.steps[at], t = s.targets;
    if (!built(at)) {
      // Building. What the step's check still needs comes first for objects (the clip may add them in another order,
      // or rename through a menu that only shows once the object is selected); the clip leads for the rest (events
      // and variables, where its exact clicks help most); then the check again, for whatever the clip didn't show.
      const items = todo(s.check?.rules, getSheet()).filter((i) => !i.ok);
      // a clip move to another screen comes first: objects and events belong on that screen
      if (ptr < t.length && /\[data-ab='screen:/.test(t[ptr].selector)) { const el = find(t[ptr].selector); if (el) return { el, caption: t[ptr].caption || 'Open this screen.' }; }
      const obj = items.find((i) => i.type === 'object' && !i.present); // one that's there and only needs settings: the clip shows those
      if (obj) { const g = objectGuide(obj, items); if (g) return g; }
      // missing variables next (a clip's expressions may use one the step's text asks for), unless one exists by that name
      const names = new Set((getProject().variables || []).map((x) => x.name));
      const v = items.find((i) => i.type === 'variable' && !names.has(i.name));
      if (v && !document.querySelector('dialog[open]')) { const el = find("[data-ab='new-variable-name']"); if (el) return { el, caption: `Make a variable called ${v.name}${v.value !== '' ? `, starting at ${v.value}` : ''}: type its name here${v.value !== '' ? ` and ${v.value} in the box beside it` : ''}, then press Enter.` }; }
      if (ptr < t.length && t[ptr].closes && !document.querySelector('dialog[open]')) ptr++; // closed with Esc or ✕: same thing
      // a box that already holds what the clip types (a starter that set it): nothing to do, so move on
      while (ptr < t.length && t[ptr].action === 'type') { const el = find(t[ptr].selector); if (!el || el.value === undefined || String(el.value).trim() !== String(t[ptr].text ?? '').trim()) break; ptr++; }
      let renaming = false; // done another way: skip that part (and the name typed after an object's Rename)
      while (ptr < t.length && ((!obj && (OBJECTISH.test(t[ptr].selector) || (renaming && /input\.rename/.test(t[ptr].selector)))) || (!v && VARISH.test(t[ptr].selector)))) { renaming = /menu:rename/.test(t[ptr].selector); ptr++; }
      if (ptr < t.length) {
        const el = find(t[ptr].selector);
        if (el) return { el, caption: captionFor(t[ptr], el) };
        const tab = t[ptr].selector.match(/\.view-(\w+)/)?.[1];
        if (tab && getTab() !== tab) { const te = find(`[data-ab='tab:${tab}']`); if (te) return { el: te, caption: `Open the ${tab[0].toUpperCase() + tab.slice(1)} tab.` }; }
        if (ptr > 0) { const back = find(t[ptr - 1].selector); if (back) return { el: back, caption: t[ptr - 1].caption }; }
      }
      // a dialog open with nothing in it to point at (the clip pressed Enter to finish it): Done, when it can be chosen
      const dlg = document.querySelector('dialog[open]');
      if (dlg) { const d = [...dlg.querySelectorAll("[data-ab='done']")].find((x) => visible(x) && !x.disabled); return d ? { el: d, caption: 'When it says what you want, choose Done.' } : null; }
      // the clip has shown its part; the rest is in the step's text. Point at what's left on the card, not at a
      // button that would add another empty event each time it's clicked
      const left = card.querySelector('.tut-todo li:not(.ok)');
      if (left && open && !small) return { el: left, caption: 'Still to do, as the step\u2019s text explains. Stuck? has the lesson\u2019s video.' };
      return null;
    }
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
  // Pointing at what a missing object needs: the picker tile, renaming one the student added with its default name
  // (Button1 -> SaveButton), or Add object.
  function objectGuide(item, items) {
    const c = COMPONENTS[item.kind];
    const tile = find(`[data-ab='kind:${item.kind}']`);
    if (tile) return { el: tile, caption: `Pick ${c.label}.` };
    if (document.querySelector('dialog[open]')) return null;
    if (item.name) {
      const wanted = new Set(items.filter((i) => i.type === 'object' && i.name).map((i) => i.name));
      const named = new Set(todo(tutorial.steps[at].check?.rules, '').filter((i) => i.name).map((i) => i.name));
      const cand = (getProject().screens || []).flatMap((sc) => sc.objects || []).filter((o) => o.kind === item.kind && !named.has(o.name) && !wanted.has(o.name)).pop(); // the newest: an earlier one may be for something else (a title)
      if (cand) {
        const input = find('.side input.rename');
        if (input) return { el: input, caption: `Type ${item.name}, then press Enter.` };
        const ren = find("[data-ab='menu:rename']");
        if (ren) return { el: ren, caption: 'Choose Rename.' };
        const menu = find(`.side .obj.on [data-ab='object-menu']`);
        if (menu && menu.closest('.obj')?.querySelector(`[data-ab='object:${CSS.escape(cand.name)}']`)) return { el: menu, caption: `Click \u22EF to rename ${cand.name} to ${item.name}.` };
        const row = find(`.side [data-ab='object:${CSS.escape(cand.name)}']`);
        if (row) return { el: row, caption: `Select ${cand.name} so you can rename it ${item.name}.` };
      }
    }
    const add = find("[data-ab='add-object']");
    if (add) return { el: add, caption: `Add ${item.label.replace(/ called (\w+)$/, ', then name it $1')}.` };
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
    if (changed) { celebrate(); draw(); }
  }
  // what the card shows that changes with the project: the ticks and this step's still-to-do list
  const sig = () => at + ':' + done.join() + '|' + todo(tutorial.steps[at].check?.rules, getSheet()).map((i) => +i.ok).join('');
  let lastSig = '';
  // a step that has just become complete gets the banner; a hidden card's Tutorial button turns green
  let wasComplete = complete(at), wasAt = at;
  function celebrate() {
    const now = complete(at);
    if (wasAt === at && !wasComplete && now) cheer = at;
    if (!now && cheer === at) cheer = -1;
    wasComplete = now; wasAt = at;
  }
  const designText = (name) => { for (const sc of getProject().screens || []) for (const o of sc.objects || []) if (o.name === name) return String(o.instances?.[0]?.text ?? ''); return null; };
  let lastEl = null;
  function place() {
    const t = target();
    if (!t) { ring.remove(); bubble.remove(); return; }
    if (t.el !== lastEl) { lastEl = t.el; t.el.scrollIntoView({ block: 'center', inline: 'nearest' }); } // off-screen in a long panel (centre: clear of sticky headings)
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
    if (open && !card.hidden && !card.contains(t.el) && r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom) { left = !left; card.classList.toggle('left', left); }
  }
  // clicking or typing into what the ring points at moves it on (capture: before the editor redraws)
  // pointerdown as well as click: the app's own objects on the stage take the press (to select or drag them), so
  // their click may never come; a dropdown moves on when it changes, since opening it is only half the move
  const advance = (e, action) => {
    const t = tutorial.steps[at].targets;
    if (!(e.target instanceof Element)) return;
    for (let k = ptr; k < t.length; k++) {
      if (t[k].action !== action && !(action === 'change' && (t[k].action === 'type' || t[k].key || t[k].arrows))) continue;
      if (action === 'click' && (t[k].key || t[k].arrows)) continue; // a dropdown: wait for the choice
      let hit = false; try { hit = !!e.target.closest(parseSel(t[k].selector).css); } catch { /* not a selector */ }
      if (hit) { ptr = k + 1; card.dataset.next = t[ptr]?.selector || ''; setTimeout(place, 0); return; }
    }
  };
  let down = null; // one press and its click are one move
  document.addEventListener('pointerdown', (e) => { down = { el: e.target, at: Date.now() }; advance(e, 'click'); }, true);
  document.addEventListener('click', (e) => { if (down && down.el === e.target && Date.now() - down.at < 1000) return; advance(e, 'click'); }, true);
  document.addEventListener('change', (e) => advance(e, 'change'), true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter') advance(e, 'change'); }, true);
  addEventListener('resize', place);
  document.addEventListener('scroll', place, true);
  setInterval(() => { if (open && !finished) checkTries(); place(); }, 250); // the running app, dialogs, tabs, things moving

  draw();
  return {
    // progress brought from another device (a Continue link or a saved file, carry.js) was just written to the keys
    reload() {
      try { tried = new Set(JSON.parse(store((ls) => ls.getItem(TRIED)) || '[]')); } catch { tried = new Set(); }
      const n = Number(store((ls) => ls.getItem(KEY)));
      at = Number.isInteger(n) && n >= 0 && n < tutorial.steps.length ? n : at;
      ptr = 0; finished = false; open = true; cheer = -1; lastEl = null; card.dataset.next = tutorial.steps[at].targets[0]?.selector || '';
      done = ticks(tutorial, getSheet());
      wasAt = at; wasComplete = complete(at); lastSig = sig(); // no "Step done" banner for progress that just arrived
      draw();
    },
    changed() {
      done = ticks(tutorial, getSheet());
      const now = sig();
      if (now !== lastSig) { lastSig = now; celebrate(); draw(); } else place();
    },
  };
}

// "Stuck?": the clip's captions as a short how-to, and the lesson's own video of the step (if the lesson came from the
// tutorials site, which publishes clips/step-N.mp4 beside the page). Closed until the student opens it.
function stuckSection(s, lessonUrl) {
  const hints = hintsOf(s), clip = clipUrls(s, lessonUrl);
  if (!hints.length && !clip) return null;
  const where = h('div', { class: 'tut-video' });
  const watch = clip && h('button', { class: 'btn', 'data-ab': 'tutorial-video', onclick: () => {
    const v = h('video', { controls: true, autoplay: true, muted: true, playsinline: true, crossorigin: 'anonymous', poster: clip.poster, src: clip.video },
      h('track', { kind: 'captions', srclang: 'en', label: 'Transcript', src: clip.captions }));
    v.muted = true;
    v.addEventListener('error', () => where.replaceChildren(h('p', { class: 'muted' }, 'There\u2019s no video for this step yet. The lesson page may have more help.')));
    where.replaceChildren(v, h('p', { class: 'muted' }, 'Turn the sound on for the voiceover.'));
    watch.remove();
  } }, '\u25B6 Watch how it\u2019s done');
  return h('details', { class: 'tut-stuck', 'data-ab': 'tutorial-stuck' }, h('summary', {}, 'Stuck?'),
    hints.length ? [h('p', { class: 'muted' }, 'How the lesson video does it:'), h('ol', {}, hints.map((x) => h('li', {}, x)))] : null,
    watch || null, where);
}

// Lesson clips are Playwright selectors: CSS, sometimes ending ` >> nth=N` (the Nth match, from 0).
function parseSel(sel) {
  const m = String(sel).match(/^(.*?)\s*>>\s*nth=(\d+)\s*$/);
  return m ? { css: m[1], nth: Number(m[2]) } : { css: String(sel), nth: null };
}

// What the ring's bubble says for a clip move: its caption, plus what to type or which option to choose.
function captionFor(t, el) {
  if (t.action === 'type') return t.text ? `${t.caption} Type: ${t.text}` : `${t.caption} Leave it empty.`;
  if (t.arrows && el.tagName === 'SELECT') {
    const o = el.options[Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + t.arrows))];
    if (o && o.index !== el.selectedIndex) return `${t.caption} Choose: ${o.text.trim()}`;
  }
  if (t.key && el.tagName === 'SELECT') {
    const o = [...el.options].find((x) => x.text.trim().toUpperCase().startsWith(t.key.toUpperCase()));
    if (o) return `${t.caption} Choose: ${o.text.trim()}`;
  }
  return t.caption;
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
