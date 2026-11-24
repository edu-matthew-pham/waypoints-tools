// Events tab: the editable event sheet beside a live preview of the app.
// Edit a row and the preview restarts (unless switched off); rows flash as they fire;
// the pick button on object dropdowns lets you click the object in the preview.
import { h } from '../ui/dom.js';
import { Runner } from '../run-engine.js';
import { scopeFor, exprScopeFor } from '../core/project.js';
import { S, screen, hooks } from '../state.js';

export function initEvents(root) {
  const hint = h('p', { class: 'hint' });
  const sheet = document.createElement('event-sheet');
  const banner = h('div', { class: 'pick-banner', hidden: true }, 'Click an object in the preview to choose it. Esc to cancel.');
  const stageHost = h('div', { class: 'stage-host' });
  const watch = h('div', { class: 'watch' });
  const problems = h('div', { class: 'problems' });
  let active = false, auto = true, timer = 0, pickCancel = null;

  const runner = new Runner(stageHost, { watch, problems, flash: (id) => sheet.flash(id) });
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
    h('div', { class: 'sheet-col' }, h('div', { class: 'sheet-bar' }, hint, modeBtn), sheet),
    h('div', { class: 'preview-col' },
      h('div', { class: 'run-bar' },
        h('button', { class: 'btn', 'data-ab': 'restart', onclick: restart }, '↻ Restart'),
        h('label', { class: 'check-inline' }, autoBox, 'Restart when I edit')),
      banner, stageHost,
      h('details', { class: 'dbg' }, h('summary', {}, 'Watch values and problems'), watch, problems)));

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
      hint.textContent = `Events for “${screen().name}”. ⚡ events run the moment something happens; the others are checked every tick, top to bottom.`;
      if (source !== 'sheet') {
        sheet.setData({ events: screen().events, scope: scopeFor(S.project, screen()), exprScope: exprScopeFor(S.project, screen()), mode: S.guided ? 'guided' : 'edit', canPick: true, features: S.rf });
      }
      if (active) later();
    },
    activate() { active = true; restart(); },
    deactivate() { active = false; clearTimeout(timer); cancelPick(); runner.stop(); },
  };
}
