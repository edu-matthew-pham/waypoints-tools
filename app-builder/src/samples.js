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

// ---- The App Builder apps course (tutorials.learningwaypoints.com): same object and variable names as its lessons ----

// Practice tracker: a global variable, a button event that changes it, and Set text to show it
export function practiceTracker() {
  return {
    version: 1, name: 'Practice tracker', features: { level: 2 },
    variables: [{ name: 'Minutes', value: 0 }],
    screens: [{
      id: 'main', name: 'Tracker',
      objects: [
        obj('Title', 'text', [inst('t1', 24, 40, 342, 36, 'Practice tracker')]),
        obj('TextInput', 'input', [inst('t2', 24, 100, 200, 42, '')]),
        obj('SaveButton', 'button', [inst('t3', 236, 98, 130, 46, 'Save')]),
        obj('TotalText', 'text', [inst('t4', 24, 170, 342, 32, "You've practised 0 minutes")]),
      ],
      events: [
        ev('p1', [{ type: 'onClicked', target: 'SaveButton' }], [
          { type: 'addTo', value: 'int(TextInput.text)', var: 'Minutes' },
          { type: 'setText', target: 'TotalText', value: `"You've practised " & Minutes & " minutes"` },
        ]),
      ],
    }],
  };
}

// Chores checklist: one click event per box, a sub-event that checks the text, and Else
export function choresChecklist() {
  const jobs = [['BedBox', 'Make my bed'], ['FeedBox', 'Feed the dog'], ['HomeworkBox', 'Do my homework']];
  const objects = [obj('Title', 'text', [inst('c0', 24, 40, 342, 36, 'My jobs today')])];
  const events = [];
  jobs.forEach(([box, label], i) => {
    const y = 110 + i * 70;
    objects.push(obj(box, 'button', [inst('c' + i + 'b', 24, y, 56, 52, '⬜')]));
    objects.push(obj(box.replace('Box', 'Text'), 'text', [inst('c' + i + 't', 96, y + 10, 270, 32, label)]));
    events.push(ev('c' + i, [{ type: 'onClicked', target: box }], [], [
      ev('c' + i + 'a', [{ type: 'compareText', target: box, op: '=', value: '"⬜"' }], [{ type: 'setText', target: box, value: '"✅"' }]),
      elseEv('c' + i + 'e', [{ type: 'setText', target: box, value: '"⬜"' }]),
    ]));
  });
  return { version: 1, name: 'Chores checklist', features: { level: 2 }, variables: [], screens: [{ id: 'main', name: 'Chores', objects, events }] };
}

// Water tracker: two variables, Every tick keeps the display right, a cap in a sub-event, Reset
export function waterTracker() {
  return {
    version: 1, name: 'Water tracker', features: { level: 2 },
    variables: [{ name: 'Glasses', value: 0 }, { name: 'Goal', value: 8 }],
    screens: [{
      id: 'main', name: 'Water',
      objects: [
        obj('GlassText', 'text', [inst('w1', 24, 40, 342, 36, 'Glasses: 0 of 8')]),
        obj('AddButton', 'button', [inst('w2', 24, 100, 342, 52, 'Add a glass')]),
        obj('ResetButton', 'button', [inst('w3', 24, 170, 342, 46, 'Reset')]),
      ],
      events: [
        ev('w1', [{ type: 'everyTick' }], [{ type: 'setText', target: 'GlassText', value: '"Glasses: " & Glasses & " of " & Goal' }]),
        ev('w2', [{ type: 'onClicked', target: 'AddButton' }], [], [
          ev('w2a', [{ type: 'compareVar', var: 'Glasses', op: '<', value: 'Goal' }], [{ type: 'addTo', value: '1', var: 'Glasses' }]),
        ]),
        ev('w3', [{ type: 'onClicked', target: 'ResetButton' }], [{ type: 'setVar', var: 'Glasses', value: '0' }]),
      ],
    }],
  };
}

// Values journal: buttons set a variable and change screen, Add saves to a list, a List shows it
export function valuesJournal() {
  const values = [['Kindness', 'heart'], ['Courage', 'star'], ['Honesty', 'tick'], ['Respect', 'smile']];
  const pick = values.flatMap(([v, pic], i) => {
    const x = 24 + (i % 2) * 177, y = 140 + Math.floor(i / 2) * 200;
    return [
      obj(v + 'Picture', 'image', [{ ...inst('v' + i + 'p', x + 34, y, 100, 100, v), image: pic }]),
      obj(v + 'Button', 'button', [inst('v' + i + 'b', x, y + 110, 165, 46, v)]),
    ];
  });
  return {
    version: 1, name: 'Values journal', features: { level: 3 },
    variables: [{ name: 'Chosen', value: '' }, { name: 'Journal', value: [] }],
    screens: [
      { id: 'choose', name: 'Choose',
        objects: [
          obj('Title', 'text', [inst('j1', 24, 30, 342, 36, 'Values journal')]),
          obj('Prompt', 'text', [inst('j2', 24, 74, 342, 40, 'Which value did you show today?')]),
          ...pick,
        ],
        events: values.map(([v], i) => ev('jv' + i, [{ type: 'onClicked', target: v + 'Button' }], [
          { type: 'setVar', var: 'Chosen', value: `"${v}"` },
          { type: 'goToScreen', screen: 'describe' },
        ])),
      },
      { id: 'describe', name: 'Describe',
        objects: [
          obj('Question', 'text', [inst('j3', 24, 40, 342, 64, '')]),
          obj('TextInput', 'input', [inst('j4', 24, 120, 342, 46, '')]),
          obj('AddButton', 'button', [inst('j5', 24, 184, 342, 48, 'Add to my journal')]),
        ],
        events: [
          ev('jd1', [{ type: 'onStart' }], [{ type: 'setText', target: 'Question', value: '"What did you do to show " & Chosen & "?"' }]),
          ev('jd2', [{ type: 'onClicked', target: 'AddButton' }], [
            { type: 'listAdd', value: 'uppercase(Chosen) & ": " & TextInput.text', list: 'Journal' },
            { type: 'goToScreen', screen: 'journal' },
          ]),
        ],
      },
      { id: 'journal', name: 'Journal',
        objects: [
          obj('Heading', 'text', [inst('j6', 24, 30, 342, 36, 'My values in action')]),
          obj('Count', 'text', [inst('j7', 24, 72, 342, 30, '')]),
          obj('List', 'list', [{ ...inst('j8', 24, 110, 342, 360, ''), source: 'Journal' }]),
          obj('AnotherButton', 'button', [inst('j9', 24, 490, 342, 48, 'Add another')]),
        ],
        events: [
          ev('jj1', [{ type: 'onStart' }], [{ type: 'setText', target: 'Count', value: '"Entries: " & count(Journal)' }]),
          ev('jj2', [{ type: 'onClicked', target: 'AnotherButton' }], [{ type: 'goToScreen', screen: 'choose' }]),
        ],
      },
    ],
  };
}

// Creature stats: one object with three copies, each with its own variables; clicking one picks just that copy
export function creatureStats() {
  const stats = [['Blaze', 80, 60, 30, 'Fire breath', 'star'], ['Tide', 50, 40, 90, 'Water shield', 'water'], ['Zip', 30, 95, 40, 'Super dash', 'music']];
  const bar = (name, y, color) => obj(name, 'shape', [{ ...inst(name, 150, y, 0, 18, ''), color }]);
  return {
    version: 1, name: 'Creature stats', features: { level: 3 },
    variables: [],
    screens: [{
      id: 'main', name: 'Creatures',
      objects: [
        obj('Title', 'text', [inst('k0', 24, 20, 342, 34, 'Click a creature')]),
        obj('Creature', 'image', stats.map(([n, p, s, d, a, pic], i) => ({ ...inst('k' + i, 30 + i * 115, 70, 100, 100, n, { name: n, power: p, speed: s, defence: d, ability: a }), image: pic })),
          [{ name: 'name', value: '' }, { name: 'power', value: 0 }, { name: 'speed', value: 0 }, { name: 'defence', value: 0 }, { name: 'ability', value: '' }]),
        obj('NameText', 'text', [inst('k10', 24, 200, 342, 34, '')]),
        obj('PowerText', 'text', [inst('k11', 24, 246, 120, 26, '')]),
        obj('SpeedText', 'text', [inst('k12', 24, 282, 120, 26, '')]),
        obj('DefenceText', 'text', [inst('k13', 24, 318, 120, 26, '')]),
        bar('PowerBar', 250, '#e5484d'), bar('SpeedBar', 286, '#2f8fdd'), bar('DefenceBar', 322, '#2fa36b'),
        obj('AbilityText', 'text', [inst('k14', 24, 362, 342, 30, '')]),
      ],
      events: [
        ev('k', [{ type: 'onClicked', target: 'Creature' }], [
          { type: 'setText', target: 'NameText', value: 'Creature.name' },
          { type: 'setText', target: 'PowerText', value: '"Power: " & Creature.power' },
          { type: 'setText', target: 'SpeedText', value: '"Speed: " & Creature.speed' },
          { type: 'setText', target: 'DefenceText', value: '"Defence: " & Creature.defence' },
          { type: 'setText', target: 'AbilityText', value: '"Special: " & Creature.ability' },
          { type: 'setSize', target: 'PowerBar', prop: 'w', value: 'Creature.power / 100 * 200' },
          { type: 'setSize', target: 'SpeedBar', prop: 'w', value: 'Creature.speed / 100 * 200' },
          { type: 'setSize', target: 'DefenceBar', prop: 'w', value: 'Creature.defence / 100 * 200' },
        ]),
      ],
    }],
  };
}

// The samples were laid out as a phone-width column; on a web page that column is centred.
const WEB_SHIFT = Math.round((800 - 390) / 2);
function onWebPage(make) {
  return () => {
    const p = make();
    p.device = 'web';
    for (const sc of p.screens) for (const o of sc.objects) for (const i of o.instances) {
      i.x += WEB_SHIFT;
      if (i.y + i.h > 600) i.y = 600 - i.h - 24; // the web page is a little shorter than a phone
    }
    return p;
  };
}

export const SAMPLES = {
  'Practice tracker': onWebPage(practiceTracker),
  'Chores checklist': onWebPage(choresChecklist),
  'Water tracker': onWebPage(waterTracker),
  'Values journal': onWebPage(valuesJournal),
  'Creature stats': onWebPage(creatureStats),
  'Minutes and goal (two screens)': onWebPage(musicTracker),
  'Daily chores (copies)': onWebPage(dailyChores),
};

// ---- lesson links: ?sample=<id> ----
// "-start" versions keep the finished design (screens, objects, text, pictures) but no events or variables,
// so a tutorial can begin with "the screen is built; now make it work".
export function starterOf(project) {
  const p = structuredClone(project);
  p.name += ' (start)';
  p.variables = [];
  for (const s of p.screens) s.events = [];
  return p;
}
const LESSONS = {
  tracker: SAMPLES['Practice tracker'],
  chores: SAMPLES['Chores checklist'],
  water: SAMPLES['Water tracker'],
  journal: SAMPLES['Values journal'],
  creatures: SAMPLES['Creature stats'],
  goal: SAMPLES['Minutes and goal (two screens)'],
  copies: SAMPLES['Daily chores (copies)'],
};
const ALIASES = { music: 'tracker', practice: 'goal' }; // lesson links published on 24 Nov 2026
export const SAMPLE_IDS = [...Object.keys(LESSONS), ...['tracker', 'chores', 'water', 'journal', 'creatures'].map((k) => k + '-start')];
export function sampleById(id) {
  if (id) id = id.replace(/^[a-z]+/, (k) => ALIASES[k] || k);
  if (LESSONS[id]) return LESSONS[id]();
  const base = id?.endsWith('-start') && LESSONS[id.slice(0, -6)];
  return base ? starterOf(base()) : null;
}
