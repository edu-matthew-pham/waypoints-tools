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
          obj('Title', 'text', [inst('i_title', 24, 48, 342, 36, 'Practice tracker')]),
          obj('Total', 'text', [inst('i_total', 24, 112, 342, 32, 'Total: 0 min')]),
          obj('Msg', 'text', [inst('i_msg', 24, 152, 342, 32, '')]),
          obj('AddBtn', 'button', [inst('i_add', 24, 216, 342, 48, '+10 minutes')]),
          obj('SummaryBtn', 'button', [inst('i_sum', 24, 276, 342, 48, 'Summary')]),
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
          obj('Heading', 'text', [inst('i_head', 24, 48, 342, 36, 'Summary')]),
          obj('Result', 'text', [inst('i_res', 24, 112, 342, 32, '')]),
          obj('BackBtn', 'button', [inst('i_back', 24, 168, 342, 48, 'Back')]),
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

// ---- Year 7 tutorial versions (cggs-digital-tutorials): same names and steps as the Construct 3 tutorials ----

// Music tracker: global variable, text input with int(), Set text, show a message at 10 hours
export function y7MusicTracker() {
  return {
    version: 1, name: 'Music tracker', features: { level: 2 },
    variables: [{ name: 'HoursPracticed', value: 0 }],
    screens: [{
      id: 'main', name: 'Tracker',
      objects: [
        obj('TextTitle', 'text', [inst('m1', 24, 40, 342, 36, '🎻 Music practice tracker')]),
        obj('TextInput', 'input', [inst('m2', 24, 110, 200, 42, '')]),
        obj('Button', 'button', [inst('m3', 236, 108, 130, 46, 'Add hours')]),
        obj('TextDisplayHours', 'text', [inst('m4', 24, 180, 342, 32, 'You have practiced for 0 hours')]),
        obj('GreatWork', 'text', [{ ...inst('m5', 24, 240, 342, 48, '🎉 Great work! 10 hours!'), visible: false }]),
      ],
      events: [
        ev('t1', [{ type: 'onClicked', target: 'Button' }], [
          { type: 'addTo', value: 'int(TextInput.text)', var: 'HoursPracticed' },
          { type: 'setText', target: 'TextDisplayHours', value: '"You have practiced for " & HoursPracticed & " hours"' },
        ]),
        ev('t2', [{ type: 'compareVar', var: 'HoursPracticed', op: '≥', value: '10' }], [
          { type: 'setVisible', visible: 'show', target: 'GreatWork' },
        ]),
      ],
    }],
  };
}

// Daily chores, Option B: one trigger, a sub-event that checks the text, and Else
export function y7DailyChores() {
  const chores = [['Bed', 'Make my bed'], ['Dog', 'Feed the dog'], ['Homework', 'Do my homework']];
  const objects = [obj('TextTitle', 'text', [inst('d0', 24, 40, 342, 36, 'My daily chores')])];
  const events = [];
  chores.forEach(([key, label], i) => {
    const y = 110 + i * 70;
    objects.push(obj('Checkbox_' + key, 'button', [inst('d' + i + 'b', 24, y, 56, 52, '⬜')]));
    objects.push(obj('Text_' + key, 'text', [inst('d' + i + 't', 96, y + 10, 270, 32, label)]));
    events.push(ev('c' + i, [{ type: 'onClicked', target: 'Checkbox_' + key }], [], [
      ev('c' + i + 'a', [{ type: 'compareText', target: 'Checkbox_' + key, op: '=', value: '"⬜"' }], [
        { type: 'setText', target: 'Checkbox_' + key, value: '"✅"' },
      ]),
      elseEv('c' + i + 'b', [{ type: 'setText', target: 'Checkbox_' + key, value: '"⬜"' }]),
    ]));
  });
  return { version: 1, name: 'Daily chores', features: { level: 2 }, variables: [], screens: [{ id: 'main', name: 'Chores', objects, events }] };
}

// Water tracker: two variables, a cap with a sub-event, reset, Every tick display, Else message, progress bar
export function y7WaterTracker() {
  return {
    version: 1, name: 'Daily water intake tracker', features: { level: 2 },
    variables: [{ name: 'waterCount', value: 0 }, { name: 'dailyGoal', value: 10 }],
    screens: [{
      id: 'main', name: 'Water',
      objects: [
        obj('WaterText', 'text', [inst('w1', 24, 40, 342, 36, 'Glasses of water today: 0 / 10')]),
        obj('AddWaterButton', 'button', [inst('w2', 24, 100, 342, 52, 'Add Glass')]),
        obj('ProgressBG', 'shape', [{ ...inst('w3', 45, 180, 300, 24, ''), color: '#d5dae3' }]),
        obj('ProgressBar', 'shape', [{ ...inst('w4', 45, 180, 30, 24, ''), color: '#2f8fdd' }]),
        obj('MotivationalMessage', 'text', [inst('w5', 24, 220, 342, 48, '')]),
        obj('ResetButton', 'button', [inst('w6', 24, 600, 342, 48, 'Reset Day')]),
      ],
      events: [
        ev('w_add', [{ type: 'onClicked', target: 'AddWaterButton' }], [], [
          ev('w_cap', [{ type: 'compareVar', var: 'waterCount', op: '<', value: 'dailyGoal' }], [
            { type: 'addTo', value: '1', var: 'waterCount' },
          ]),
        ]),
        ev('w_reset', [{ type: 'onClicked', target: 'ResetButton' }], [
          { type: 'setVar', var: 'waterCount', value: '0' },
        ]),
        ev('w_tick', [{ type: 'everyTick' }], [
          { type: 'setText', target: 'WaterText', value: '"Glasses: " & waterCount & " / " & dailyGoal' },
          { type: 'setSize', target: 'ProgressBar', prop: 'w', value: '(waterCount / dailyGoal) * 300' },
        ]),
        ev('w_goal', [{ type: 'compareVar', var: 'waterCount', op: '=', value: 'dailyGoal' }], [
          { type: 'setText', target: 'MotivationalMessage', value: '"🎉 Daily water goal achieved! Great job!"' },
        ]),
        elseEv('w_keep', [
          { type: 'setText', target: 'MotivationalMessage', value: '"Keep drinking water to reach your goal"' },
        ]),
      ],
    }],
  };
}

export const SAMPLES = {
  'Y7: Music tracker': y7MusicTracker,
  'Y7: Daily chores': y7DailyChores,
  'Y7: Water tracker': y7WaterTracker,
  'Practice tracker': musicTracker,
  'Daily chores (copies)': dailyChores,
};
