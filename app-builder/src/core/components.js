// Component registry (data only, no DOM). One entry per kind of object a student can add.
// The drawing and icon for each lives in ui/component-ui.js, keyed by the same id.
//
//   id        key used in project JSON ("kind")
//   label     name shown to students
//   hint      one friendly line shown on the picker tile
//   category  picker section (CATEGORIES order)
//   base      default object name (Button, Button2, ...)
//   props     starting text and size when added
//
// To add a component: add an entry here, add its make/write + icon in ui/component-ui.js, place it in a
// level in features.js, and add its conditions/actions to catalog.js. Tests fail if a step is missed.
export const CATEGORIES = ['Basics', 'Choices', 'Data', 'Media', 'Layout'];

export const COMPONENTS = {
  button: { id: 'button', label: 'Button',     category: 'Basics', hint: 'Something to tap or click.',            base: 'Button', props: { text: 'Button', w: 150, h: 46 } },
  text:   { id: 'text',   label: 'Text',       category: 'Basics', hint: 'Words on the screen. Events can change them.', base: 'Text',   props: { text: 'Text',   w: 220, h: 32 } },
  input:  { id: 'input',  label: 'Text input', category: 'Basics', hint: 'A box where the user types.',           base: 'Input',  props: { text: '',       w: 220, h: 42 } },
};
