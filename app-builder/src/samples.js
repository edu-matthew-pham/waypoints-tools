// Sample projects. Plain JSON, built with tiny helpers so they stay readable.

const inst = (id, x, y, w, h, text, vars = {}) => ({ id, x, y, w, h, text, visible: true, vars });
const obj = (name, kind, instances, instanceVars = []) => ({ name, kind, instanceVars, instances });
const ev = (id, conds, actions, children = [], extra = {}) => ({ id, else: false, conds, actions, children, ...extra });
const elseEv = (id, actions, children = []) => ev(id, [], actions, children, { else: true });

// 1) Practice tracker: variables, buttons, text, sub-event + Else, two screens, globals surviving a screen change
export function musicTracker() {
  return {
    version: 1,
    name: 'Practice tracker',
    features: { level: 2 },
    variables: [{ name: 'minutes', value: 0 }, { name: 'goal', value: 30 }],
    screens: [
      {
        id: 'home', name: 'Home',
        objects: [
          obj('Title', 'text', [inst('i_title', 85, 40, 220, 36, 'Practice tracker')]),
          obj('Total', 'text', [inst('i_total', 85, 120, 220, 36, 'Total: 0 min')]),
          obj('Msg', 'text', [inst('i_msg', 85, 170, 220, 36, '')]),
          obj('AddBtn', 'button', [inst('i_add', 120, 240, 150, 48, '+10 minutes')]),
          obj('SummaryBtn', 'button', [inst('i_sum', 120, 310, 150, 48, 'Summary')]),
        ],
        events: [
          ev('e_start', [{ type: 'onStart' }], [
            { type: 'setText', target: 'Total', value: '"Total: " & minutes & " min"' },
          ]),
          ev('e_add', [{ type: 'onClicked', target: 'AddBtn' }], [
            { type: 'addTo', value: '10', var: 'minutes' },
            { type: 'setText', target: 'Total', value: '"Total: " & minutes & " min"' },
          ], [
            ev('e_goal', [{ type: 'compareVar', var: 'minutes', op: '≥', value: 'goal' }], [
              { type: 'setText', target: 'Msg', value: '"Goal reached!"' },
            ]),
            elseEv('e_goal_else', [
              { type: 'setText', target: 'Msg', value: '(goal - minutes) & " minutes to go"' },
            ]),
          ]),
          ev('e_summary', [{ type: 'onClicked', target: 'SummaryBtn' }], [
            { type: 'goToScreen', screen: 'summary' },
          ]),
        ],
      },
      {
        id: 'summary', name: 'Summary',
        objects: [
          obj('Heading', 'text', [inst('i_head', 85, 60, 220, 36, 'Summary')]),
          obj('Result', 'text', [inst('i_res', 55, 140, 280, 36, '')]),
          obj('BackBtn', 'button', [inst('i_back', 120, 220, 150, 48, 'Back')]),
        ],
        events: [
          ev('e_s_start', [{ type: 'onStart' }], [
            { type: 'setText', target: 'Result', value: '"You practised " & minutes & " minutes"' },
          ]),
          ev('e_back', [{ type: 'onClicked', target: 'BackBtn' }], [
            { type: 'goToScreen', screen: 'home' },
          ]),
        ],
      },
    ],
  };
}

// 2) Daily chores: one object, three copies, instance variables, picking, Else toggle, Every tick display
export function dailyChores() {
  const chore = (id, y, label) => inst(id, 70, y, 250, 52, '☐ ' + label, { label });
  return {
    version: 1,
    name: 'Daily chores',
    features: { level: 3 },
    variables: [{ name: 'doneCount', value: 0 }],
    screens: [
      {
        id: 'home', name: 'Chores',
        objects: [
          obj('Title', 'text', [inst('i_t', 85, 40, 220, 36, 'Today’s chores')]),
          obj('Chore', 'button', [
            chore('i_c1', 110, 'Make bed'),
            chore('i_c2', 180, 'Feed the cat'),
            chore('i_c3', 250, 'Homework'),
          ], [{ name: 'done', value: 0 }, { name: 'label', value: '' }]),
          obj('Status', 'text', [inst('i_status', 85, 350, 220, 36, '')]),
        ],
        events: [
          ev('e_click', [{ type: 'onClicked', target: 'Chore' }], [], [
            ev('e_todo', [{ type: 'compareInst', target: 'Chore', var: 'done', op: '=', value: '0' }], [
              { type: 'setInst', target: 'Chore', var: 'done', value: '1' },
              { type: 'setText', target: 'Chore', value: '"☑ " & Chore.label' },
              { type: 'addTo', value: '1', var: 'doneCount' },
            ]),
            elseEv('e_undo', [
              { type: 'setInst', target: 'Chore', var: 'done', value: '0' },
              { type: 'setText', target: 'Chore', value: '"☐ " & Chore.label' },
              { type: 'subtractFrom', value: '1', var: 'doneCount' },
            ]),
          ]),
          ev('e_status', [{ type: 'everyTick' }], [
            { type: 'setText', target: 'Status', value: '"Done: " & doneCount & " of 3"' },
          ]),
        ],
      },
    ],
  };
}

export const SAMPLES = {
  'Practice tracker': musicTracker,
  'Daily chores': dailyChores,
};
