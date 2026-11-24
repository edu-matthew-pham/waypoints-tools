// Inline rename box used in the sidebar and properties panel. Enter or clicking away saves, Esc cancels.
// onSave(newName) is only called with a valid, changed name; problems show as a notice and keep the old name.
import { h } from './dom.js';
import { nameProblem } from '../core/rename.js';

export function renameInput({ value, taken, label, onSave, onDone, notify }) {
  const input = h('input', { class: 'ctl rename', value, 'aria-label': label, spellcheck: 'false', autocomplete: 'off' });
  let finished = false;
  const finish = (save) => {
    if (finished) return;
    finished = true;
    const v = input.value.trim();
    if (save && v !== value) {
      const why = nameProblem(v, taken.filter((t) => t !== value));
      if (why) { notify?.(why); onDone(); return; }
      onSave(v);
      return;
    }
    onDone();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  queueMicrotask(() => { input.focus(); input.select(); });
  return input;
}
