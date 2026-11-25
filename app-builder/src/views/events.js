// Events tab: the editable event sheet beside a live preview of the app.
// Edit a row and the preview restarts (unless switched off); rows flash as they fire;
// the pick button on object dropdowns lets you click the object in the preview.
import { h } from '../ui/dom.js';
import { Runner } from '../run-engine.js';
import { scopeFor, exprScopeFor } from '../core/project.js';
import { allObjectsScreen, sharedEventsFor } from '../core/shared.js';
import { S, screen, hooks, showAllScreens } from '../state.js';

export function initEvents(root) {
  const hint = h('p', { class: 'hint' });
  // which sheet: this screen's, or the All screens sheet (Level 3+)
  const whichBar = h('div', { class: 'which-sheet', role: 'group', 'aria-label': 'Which event sheet' });
  const drawWhich = () => {
    whichBar.hidden = !showAllScreens();
    const btn = (id, label, title) => h('button', { class: 'seg' + (S.sheet === id ? ' on' : ''), type: 'button', 'data-ab': 'sheet:' + id, 'aria-pressed': String(S.sheet === id), title,
      onclick: () => { if (S.sheet !== id) { S.sheet = id; hooks.refresh(); } } }, label);
    whichBar.replaceChildren(
      btn('screen', `This screen: ${screen().name}`, 'Events that run only on this screen'),
      btn('all', 'All screens', 'Events that run on every screen (like a Home button), before each screen’s own'));
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
    h('div', { class: 'sheet-col' }, whichBar, h('div', { class: 'sheet-bar' }, hint, modeBtn), sheet),
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
      if (!showAllScreens()) S.sheet = 'screen';
      drawWhich();
      const all = S.sheet === 'all';
      const shared = all ? [] : sharedEventsFor(S.project, screen());
      hint.textContent = all
        ? 'Events for all screens. They run on every screen, before that screen’s own. An event is skipped on a screen that doesn’t have every object it mentions. The preview shows the screen you are on.'
        : `Events for “${screen().name}”. ⚡ events run the moment something happens; the others are checked every tick, top to bottom.`
          + (shared.length ? ` ${shared.length === 1 ? '1 event' : shared.length + ' events'} from All screens run${shared.length === 1 ? 's' : ''} here first.` : '');
      if (source !== 'sheet') {
        const scr = all ? allObjectsScreen(S.project) : screen();
        sheet.setData({ events: all ? S.project.allScreens.events : screen().events, scope: scopeFor(S.project, scr), exprScope: exprScopeFor(S.project, scr), mode: S.guided ? 'guided' : 'edit', canPick: true, features: S.rf });
      }
      if (active) later();
    },
    activate() { active = true; restart(); },
    deactivate() { active = false; clearTimeout(timer); cancelPick(); runner.stop(); },
  };
}
