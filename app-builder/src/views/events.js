// Events tab: the editable event sheet beside a live preview of the app.
// Edit a row and the preview restarts (unless switched off); rows flash as they fire;
// the pick button on object dropdowns lets you click the object in the preview.
import { h } from '../ui/dom.js';
import { Runner } from '../run-engine.js';
import { scopeFor, exprScopeFor } from '../core/project.js';
import { allObjectsScreen, sharedEventsFor } from '../core/shared.js';
import { showsAsList, givesValue, missingObjectNotes } from '../core/functions.js';
import { newEvent } from '../core/project.js';
import { renameParam, addParam, removeParam, paramNamesTaken, nameProblem } from '../core/rename.js';
import { renameInput } from '../ui/rename-input.js';
import { S, screen, hooks, showAllScreens, showFunctions, openFunction } from '../state.js';

export function initEvents(root) {
  const hint = h('p', { class: 'hint' });
  // which sheet: this screen's, or the All screens sheet (Level 3+)
  const whichBar = h('div', { class: 'which-sheet', role: 'group', 'aria-label': 'Which event sheet' });
  const drawWhich = (fn) => {
    whichBar.hidden = !showAllScreens() && !fn;
    const btn = (id, label, title, ab = 'sheet:' + id) => h('button', { class: 'seg' + (S.sheet === id ? ' on' : ''), type: 'button', 'data-ab': ab, 'aria-pressed': String(S.sheet === id), title,
      onclick: () => { if (S.sheet !== id) { S.sheet = id; hooks.refresh(); } } }, label);
    whichBar.replaceChildren(...[
      btn('screen', `This screen: ${screen().name}`, 'Events that run only on this screen'),
      showAllScreens() ? btn('all', 'All screens', 'Events that run on every screen (like a Home button), before each screen’s own') : null,
      fn ? btn('fn:' + fn.id, `Function: ${fn.name}`, 'The actions this function does when an event calls it', 'sheet:function') : null].filter(Boolean));
  };
  // A function's name line: its parameters (click one to rename it) and + Parameter. Below, small quiet buttons open
  // up the extra parts when a student needs them: + Check, Give back a value, Only the picked ones.
  const fnBar = h('div', { class: 'fn-bar', hidden: true });
  let renamingParam = null, addingParam = false;
  const drawFnBar = (fn) => {
    fnBar.hidden = !fn;
    if (!fn) { fnBar.replaceChildren(); return; }
    const chip = (p) => (renamingParam === p
      ? renameInput({ value: p, label: 'Parameter name', notify: hooks.notify, taken: paramNamesTaken(S.project, fn),
        onDone: () => { renamingParam = null; hooks.refresh(); },
        onSave: (v) => { renameParam(S.project, fn.name, p, v); renamingParam = null; hooks.commit(); } })
      : h('span', { class: 'param-chip' },
        h('button', { class: 'link-name', type: 'button', 'data-ab': 'param-name:' + p, title: 'Click to rename (the function and its calls are updated too)', onclick: () => { renamingParam = p; hooks.refresh(); } }, p),
        h('button', { class: 'icon danger', type: 'button', 'data-ab': 'param-remove:' + p, title: `Remove ${p} (calls lose its value)`, 'aria-label': `Remove parameter ${p}`,
          onclick: () => { removeParam(S.project, fn.name, p); hooks.commit(); } }, '\u00d7')));
    const adder = addingParam ? (() => {
      const input = h('input', { class: 'ctl rename', placeholder: 'name', 'aria-label': 'New parameter name', 'data-ab': 'param-new', spellcheck: 'false', autocomplete: 'off' });
      let done = false;
      const finish = (save) => {
        if (done) return; done = true; addingParam = false;
        const v = input.value.trim();
        if (save && v) {
          const why = nameProblem(v, paramNamesTaken(S.project, fn));
          if (why) { hooks.notify(why); hooks.refresh(); return; }
          addParam(S.project, fn.name, v); hooks.commit(); return;
        }
        hooks.refresh();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
      input.addEventListener('blur', () => finish(true));
      queueMicrotask(() => input.focus());
      return input;
    })() : h('button', { class: 'mini', type: 'button', 'data-ab': 'add-param', title: 'A value the call gives the function, like the text to save', onclick: () => { addingParam = true; hooks.refresh(); } }, '+ Parameter');
    const list = showsAsList(fn);
    const extra = (ab, label, title, onclick) => h('button', { class: 'fn-extra', type: 'button', 'data-ab': ab, title, onclick }, label);
    fnBar.replaceChildren(
      h('div', { class: 'fn-sig' }, h('strong', { class: 'fn-name' }, fn.name), h('span', { class: 'lbl' }, '('), ...fn.params.map(chip), adder, h('span', { class: 'lbl' }, ')')),
      h('div', { class: 'fn-extras' }, ...[
        list ? extra('fn-add-check', '+ Check', 'Only do some actions if something is true. The function becomes a small event sheet (with sub-events and Otherwise).',
          () => { fn.asSheet = true; hooks.commit(); }) : null,
        !givesValue(fn) ? extra('fn-give-value', '+ Give back a value', `Lets ${fn.name}(…) be used in a value box, like Total(price, qty). Adds a "Set return value" action to fill in.`,
          () => { (fn.events[fn.events.length - 1] || (fn.events.push(newEvent()), fn.events[0])).actions.push({ type: 'setReturn', value: '' }); hooks.commit(); }) : null,
        h('label', { class: 'fn-extra check' + (fn.copyPicked ? ' on' : ''), title: 'Ticked: the function works only on the objects the calling event picked (like the clicked Tile). Not ticked: it starts with every copy.' },
          h('input', { type: 'checkbox', 'data-ab': 'copy-picked', checked: !!fn.copyPicked, onchange: (e) => { if (e.target.checked) fn.copyPicked = true; else delete fn.copyPicked; hooks.commit(); } }),
          'Only the picked ones'),
      ].filter(Boolean)));
  };
  const sheet = document.createElement('event-sheet');
  const banner = h('div', { class: 'pick-banner', hidden: true }, 'Click an object in the preview to choose it. Esc to cancel.');
  const stageHost = h('div', { class: 'stage-host' });
  const problems = h('div', { class: 'problems' });
  let active = false, auto = true, timer = 0, pickCancel = null;

  const runner = new Runner(stageHost, { problems, flash: (id) => sheet.flash(id) });
  const restart = () => { if (active) { cancelPick(); runner.start(S.project, S.screenId); } };
  const later = () => { clearTimeout(timer); if (auto) timer = setTimeout(restart, 250); };

  const autoBox = h('input', { type: 'checkbox', checked: true, onchange: (e) => { auto = e.target.checked; } });
  const modeBtn = h('button', { class: 'seg', type: 'button', 'aria-pressed': 'true' });
  const drawMode = () => {
    modeBtn.textContent = S.guided ? 'Guided \u2713 \u00b7 switch to quick edit' : 'Quick edit \u00b7 switch to guided';
    modeBtn.setAttribute('aria-pressed', String(S.guided));
  };
  modeBtn.addEventListener('click', () => {
    S.guided = !S.guided;
    try { localStorage.setItem('appbuilder.guided', S.guided ? 'guided' : 'quick'); } catch { /* ignore */ }
    drawMode(); hooks.refresh();
  });
  drawMode();
  root.append(
    h('div', { class: 'sheet-col' }, whichBar, fnBar, h('div', { class: 'sheet-bar' }, hint, modeBtn), sheet),
    h('div', { class: 'preview-col' },
      h('div', { class: 'run-bar' },
        h('button', { class: 'btn', 'data-ab': 'restart', onclick: restart }, '↻ Restart'),
        h('label', { class: 'check-inline' }, autoBox, 'Restart when I edit')),
      banner, stageHost,
      problems));

  runner.stage.fitTo(root.querySelector('.preview-col'), () => innerHeight - 200);
  sheet.addEventListener('sheetchange', () => hooks.commit('sheet'));
  sheet.addEventListener('pickobject', (e) => beginPick(e.detail));

  function beginPick({ kinds, apply, cancel }) {
    if (!active || !runner.rt) { cancel?.(); return; }
    pickCancel = cancel;
    banner.hidden = false;
    runner.stage.setPick((id) => {
      const rt = runner.rt;
      const inst = rt?.byId.get(id);
      if (!inst) return;
      if (rt.screenId !== screen().id) { hooks.notify('The preview is on a different screen. Press Restart, then pick again.'); endPick(); return; }
      if (kinds && !kinds.includes(inst.kind)) { hooks.notify(`That isn’t the right kind of object here (needs: ${kinds.join(', ')}).`); return; }
      pickCancel = null; endPick();
      apply(inst.object);
    });
  }
  function endPick() { banner.hidden = true; runner.stage.setPick(null); }
  function cancelPick() { const c = pickCancel; pickCancel = null; endPick(); c?.(); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !banner.hidden) cancelPick(); });

  return {
    render(source) {
      const fn = openFunction();
      if ((S.sheet === 'all' && !showAllScreens()) || (S.sheet.startsWith('fn:') && !fn)) S.sheet = 'screen';
      drawWhich(fn);
      drawFnBar(fn);
      const all = S.sheet === 'all';
      const shared = all || fn ? [] : sharedEventsFor(S.project, screen());
      // a function shows as a plain list of actions until its "+ Check" button (or it already has conditions)
      const sequence = !!fn && showsAsList(fn);
      hint.textContent = fn
        ? (sequence
          ? `What ${fn.name} does when an event calls it, top to bottom. Its parameters are plain names in the value boxes. It works on any screen: an action on an object the screen doesn’t have is skipped there.`
          : `What ${fn.name} does when an event calls it. Its events are checked top to bottom, like sub-events. Its parameters are plain names in the value boxes. An object the screen doesn’t have counts as having no copies.`)
          + ' The preview shows the screen you are on.'
        : all
        ? 'Events for all screens. They run on every screen, before that screen’s own. An event is skipped on a screen that doesn’t have every object it mentions. The preview shows the screen you are on.'
        : `Events for “${screen().name}”. ⚡ events run the moment something happens; the others are checked every tick, top to bottom.`
          + (shared.length ? ` ${shared.length === 1 ? '1 event' : shared.length + ' events'} from All screens run${shared.length === 1 ? 's' : ''} here first.` : '');
      if (source !== 'sheet') {
        const scr = all || fn ? allObjectsScreen(S.project) : screen();
        // what the add menus offer: functions once Level 4 has them or the project does
        const features = S.rf && { ...S.rf, functions: showFunctions() };
        sheet.setData({ events: fn ? fn.events : all ? S.project.allScreens.events : screen().events, scope: scopeFor(S.project, scr), exprScope: exprScopeFor(S.project, scr, fn),
          mode: S.guided ? 'guided' : 'edit', canPick: true, features, where: fn ? 'function' : all ? 'all' : 'screen', sequence,
          notes: fn ? missingObjectNotes(S.project, fn) : [] });
      }
      if (active) later();
    },
    activate() { active = true; restart(); },
    deactivate() { active = false; clearTimeout(timer); cancelPick(); runner.stop(); },
  };
}
