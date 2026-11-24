// Component registry (data only, no DOM). One entry per kind of object a student can add.
// The drawing and icon for each lives in ui/component-ui.js, keyed by the same id.
//
//   id        key used in project JSON ("kind")
//   label     name shown to students
//   hint      one friendly line shown on the picker tile
//   category  picker section (CATEGORIES order)
//   base      default object name (Button, Button2, ...)
//   props     starting text and size when added
//   extra     (optional) more starting properties, e.g. a toggle's on/off
//   exposes   (optional) property names expressions can read, e.g. Toggle.on
//
// To add a component: add an entry here, add its make/write + icon in ui/component-ui.js, place it in a
// level in features.js, and add its conditions/actions to catalog.js. Tests fail if a step is missed.
export const CATEGORIES = ['Basics', 'Choices', 'Data', 'Media', 'Layout'];

export const COMPONENTS = {
  button: { id: 'button', label: 'Button',     category: 'Basics', hint: 'Something to tap or click.',            base: 'Button', props: { text: 'Button', w: 150, h: 46 } },
  text:   { id: 'text',   label: 'Text',       category: 'Basics', hint: 'Words on the screen. Events can change them.', base: 'Text',   props: { text: 'Text',   w: 220, h: 32 } },
  input:  { id: 'input',  label: 'Text input', category: 'Basics', hint: 'A box where the user types.',           base: 'Input',  props: { text: '',       w: 220, h: 42 } },
  toggle: { id: 'toggle', label: 'Toggle',     category: 'Choices', hint: 'An on/off switch with a label.',        base: 'Toggle', props: { text: 'Switch', w: 180, h: 32 }, extra: { on: false }, exposes: ['on'] },
  slider: { id: 'slider', label: 'Slider',     category: 'Choices', hint: 'Drag to pick a number.',                base: 'Slider', props: { text: '',       w: 240, h: 32 }, extra: { min: 0, max: 100, value: 50 }, exposes: ['value', 'min', 'max'] },
};
