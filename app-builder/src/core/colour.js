// Colours an app sets while it runs: a name in quotes ("black", "light blue") or a code ("#1c2333", "#fff").
// Names are the common CSS ones, with spaces allowed ("dark blue" = darkblue). Anything else: a plain message.
import { ExprError } from './expr.js';

const NAMES = 'black white red green blue yellow orange purple pink brown grey gray silver gold navy teal aqua cyan ' +
  'lime olive maroon magenta fuchsia violet indigo coral salmon tomato crimson khaki beige ivory lavender plum orchid ' +
  'tan chocolate turquoise skyblue lightblue darkblue lightgreen darkgreen lightgrey lightgray darkgrey darkgray ' +
  'dimgray dimgrey slategray slategrey whitesmoke gainsboro midnightblue royalblue steelblue dodgerblue deepskyblue ' +
  'seagreen forestgreen limegreen darkorange orangered hotpink deeppink lightpink lightyellow lemonchiffon mintcream ' +
  'honeydew aliceblue azure snow linen wheat peru sienna firebrick darkred darkviolet rebeccapurple transparent';
const KNOWN = new Set(NAMES.split(' '));

export function colourValue(v) {
  const s = String(v ?? '').trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s.toLowerCase();
  const name = s.toLowerCase().replace(/\s+/g, '');
  if (KNOWN.has(name)) return name;
  throw new ExprError(`"${s}" isn\u2019t a colour App Builder knows: try a name like "black" or "light blue", or a code like "#1c2333"`);
}
