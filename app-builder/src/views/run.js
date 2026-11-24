// Run tab: the app at full size, with a read-only event sheet that flashes as rows run.
import { h } from '../ui/dom.js';
import { Runner } from '../run-engine.js';
import { scopeFor, exprScopeFor } from '../core/project.js';
import { S } from '../state.js';

export function initRun(root) {
  const stageHost = h('div', { class: 'stage-host' });
  const watch = h('div', { class: 'watch' });
  const problems = h('div', { class: 'problems' });
  const sheet = document.createElement('event-sheet');
  const restartBtn = h('button', { class: 'btn' }, '↻ Restart');
  root.append(
    h('div', { class: 'stage-col' },
      h('div', { class: 'run-bar' }, restartBtn, h('span', { class: 'muted' }, 'Starts on the screen you were editing. Click things like a user would.')),
      stageHost),
    h('div', { class: 'run-side' }, watch, problems, h('h3', {}, 'Events on this screen'), sheet));

  const runner = new Runner(stageHost, {
    watch, problems,
    flash: (id) => sheet.flash(id),
    onScreen: (scr, project) => sheet.setData({ events: scr.events, scope: scopeFor(project, scr), exprScope: exprScopeFor(project, scr), mode: 'readonly' }),
  });
  const start = () => runner.start(S.project, S.screenId);
  restartBtn.addEventListener('click', start);
  return { activate: start, deactivate: () => runner.stop() };
}
