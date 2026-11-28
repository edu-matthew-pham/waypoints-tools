// A tiny, safe expression language for the event editor.
//   numbers, "text", true/false, variables, Object.property, functions,
//   + - * / %  (numbers only)   & (joins text)
//   if(test, value if true, value if false)   test = two values and  = ≠ < ≤ > ≥  (also != <= >= ==)
// No eval, no JS: the parser builds a small tree and we walk it.

import { meant } from './names.js';

export class ExprError extends Error {
  constructor(message) { super(message); this.name = 'ExprError'; }
}

export const OPERATORS = ['=', '≠', '<', '≤', '>', '≥'];

export function compare(a, op, b) {
  if (op === '=' || op === '≠') {
    const eq = typeof a === typeof b ? a === b : String(a) === String(b);
    return op === '=' ? eq : !eq;
  }
  if (typeof a !== typeof b) {
    throw new ExprError(`Can't compare ${typeof a === 'number' ? 'a number' : 'text'} with ${typeof b === 'number' ? 'a number' : 'text'} using ${op}. Use int(...) on text first.`);
  }
  switch (op) {
    case '<': return a < b;
    case '≤': return a <= b;
    case '>': return a > b;
    case '≥': return a >= b;
  }
  throw new ExprError(`Unknown comparison "${op}"`);
}

const CMP = { '=': '=', '==': '=', '!=': '≠', '≠': '≠', '<': '<', '<=': '≤', '≤': '≤', '>': '>', '>=': '≥', '≥': '≥' };
const QUOTES = new Set(['"', '“', '”']); // straight and tablet "smart" quotes

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (/[0-9]/.test(src[j] || '')) j++;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) { j++; while (/[0-9]/.test(src[j] || '')) j++; }
      toks.push({ t: 'num', v: Number(src.slice(i, j)) });
      i = j; continue;
    }
    if (QUOTES.has(c)) {
      let j = i + 1;
      while (j < src.length && !QUOTES.has(src[j])) j++;
      if (j >= src.length) throw new ExprError('Text needs a closing quote (") at the end');
      toks.push({ t: 'str', v: src.slice(i + 1, j) });
      i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (/[A-Za-z0-9_]/.test(src[j] || '')) j++;
      toks.push({ t: 'id', v: src.slice(i, j) });
      i = j; continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>='].includes(two)) { toks.push({ t: 'cmp', v: two }); i += 2; continue; }
    if ('=<>≠≤≥'.includes(c)) { toks.push({ t: 'cmp', v: c }); i++; continue; }
    if ('+-*/%&(),.'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new ExprError(`Unexpected "${c}"`);
  }
  return toks;
}

const cache = new Map();

export function parse(src) {
  if (cache.has(src)) return cache.get(src);
  const toks = tokenize(src);
  if (!toks.length) throw new ExprError('Nothing to work out yet — type a value');
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const expect = (v) => { if (!isOp(v)) throw new ExprError(`Expected "${v}"`); p++; };

  function test() {
    const l = concat();
    if (peek()?.t !== 'cmp') throw new ExprError('if() needs a test first, like  if(score ≥ 10, "Win", "Keep going")');
    const op = CMP[toks[p++].v];
    return { k: 'cmp', op, l, r: concat() };
  }
  function concat() {
    let l = add();
    while (isOp('&')) { p++; l = { k: 'bin', op: '&', l, r: add() }; }
    return l;
  }
  function add() {
    let l = mul();
    while (isOp('+') || isOp('-')) { const op = toks[p++].v; l = { k: 'bin', op, l, r: mul() }; }
    return l;
  }
  function mul() {
    let l = unary();
    while (isOp('*') || isOp('/') || isOp('%')) { const op = toks[p++].v; l = { k: 'bin', op, l, r: unary() }; }
    return l;
  }
  function unary() {
    if (isOp('-')) { p++; return { k: 'neg', e: unary() }; }
    return primary();
  }
  function primary() {
    const t = toks[p++];
    if (!t) throw new ExprError('The value stops too early');
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'id') {
      if (t.v === 'true' || t.v === 'false') return { k: 'bool', v: t.v === 'true' };
      if (t.v === 'if' && isOp('(')) {
        p++;
        const cond = test();
        if (!isOp(',')) throw new ExprError('if() needs a value for when the test is true, then one for when it is not');
        p++;
        const yes = concat();
        if (!isOp(',')) throw new ExprError('if() also needs a value for when the test is not true (three parts in all)');
        p++;
        const no = concat();
        expect(')');
        return { k: 'if', cond, yes, no };
      }
      if (isOp('(')) {
        p++;
        const args = [];
        if (!isOp(')')) { do { args.push(concat()); } while (isOp(',') && ++p); }
        expect(')');
        return field({ k: 'call', name: t.v, args });
      }
      if (isOp('.')) {
        p++;
        const pr = toks[p++];
        if (!pr || pr.t !== 'id') throw new ExprError(`Expected a property name after "${t.v}."`);
        return { k: 'prop', obj: t.v, prop: pr.v };
      }
      return { k: 'var', name: t.v };
    }
    if (t.t === 'op' && t.v === '(') { const e = concat(); expect(')'); return field(e); }
    throw new ExprError(`Unexpected "${t.v}"`);
  }
  // item(Songs, 2).artist : a field of the record a call or brackets give
  function field(e) {
    if (!isOp('.')) return e;
    p++;
    const pr = toks[p++];
    if (!pr || pr.t !== 'id') throw new ExprError('Expected a field name after "."');
    return { k: 'field', e, name: pr.v };
  }

  const ast = concat();
  if (p < toks.length) throw new ExprError(toks[p].t === 'cmp' ? 'Comparisons like ' + toks[p].v + ' only work inside if(...)' : `Unexpected "${toks[p].v}"`);
  cache.set(src, ast);
  return ast;
}

// a record is a row of a table: a plain object of field -> value
export const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
export function fieldOf(rec, name, what = 'This') {
  if (!isRecord(rec)) throw new ExprError(`${what} isn't a row of a table, so it has no field "${name}"`);
  if (!(name in rec)) {
    const lower = Object.keys(rec).find((k) => k.toLowerCase() === name.toLowerCase());
    throw new ExprError(lower ? `Use .${lower} (small letters), not .${name}` : `There's no field "${name}". The fields are ${Object.keys(rec).join(', ') || 'none yet'}.`);
  }
  return rec[name];
}

export function fmt(v) {
  if (Array.isArray(v)) return v.map(fmt).join(', ');
  if (isRecord(v)) return Object.values(v).map(fmt).join(', ');
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String(v);
}

function needNum(v) {
  if (typeof v !== 'number') {
    throw new ExprError(`Maths needs numbers, but this is ${typeof v === 'string' ? `text: "${v}"` : 'not a number'}. Use int(...) to turn text into a number.`);
  }
  return v;
}

const FUNCS = {
  int:    { n: 1, f: (v) => { if (typeof v === 'number') return Math.trunc(v); const n = parseInt(String(v).trim(), 10); return Number.isNaN(n) ? 0 : n; } },
  float:  { n: 1, f: (v) => { if (typeof v === 'number') return v; const n = parseFloat(String(v).trim()); return Number.isNaN(n) ? 0 : n; } },
  round:  { n: 1, f: (v) => Math.round(needNum(v)) },
  floor:  { n: 1, f: (v) => Math.floor(needNum(v)) },
  ceil:   { n: 1, f: (v) => Math.ceil(needNum(v)) },
  abs:    { n: 1, f: (v) => Math.abs(needNum(v)) },
  min:    { n: 2, f: (a, b) => Math.min(needNum(a), needNum(b)) },
  max:    { n: 2, f: (a, b) => Math.max(needNum(a), needNum(b)) },
  len:    { n: 1, f: (v) => String(v).length },
  upper:  { n: 1, f: (v) => String(v).toUpperCase() },
  lower:  { n: 1, f: (v) => String(v).toLowerCase() },
  str:    { n: 1, f: (v) => fmt(v) },
};
const needList = (v, fn) => { if (!Array.isArray(v)) throw new ExprError(`${fn}() needs a list, like ${fn}(myList${fn === 'item' ? ', 1' : ''})`); return v; };
FUNCS.count = { n: 1, f: (l) => needList(l, 'count').length };
FUNCS.item = { n: 2, f: (l, i) => {
  needList(l, 'item'); needNum(i);
  if (i < 1 || i > l.length || !Number.isInteger(i)) throw new ExprError(`The list has ${l.length} item${l.length === 1 ? '' : 's'}, so there is no item ${fmt(i)}. Items are numbered from 1.`);
  return l[i - 1];
} };
FUNCS.contains = { n: 2, f: (t, part) => fmt(t).includes(fmt(part)) };
FUNCS.join = { n: 2, f: (l, sep) => needList(l, 'join').map(fmt).join(fmt(sep)) };
// Construct names, so code copied from a Construct tutorial still works
FUNCS.uppercase = FUNCS.upper;
FUNCS.lowercase = FUNCS.lower;
export const LOOP_NAMES = ['LoopIndex', 'LoopItem', 'ClickedIndex', 'ClickedItem'];
export const FUNCTION_NAMES = () => [...Object.keys(FUNCS), 'random', 'if'];

// env = { getVar(name), getProp(obj, prop), random(), call?(name, values) }   call: the app's own functions (core/functions.js)
export function evaluate(n, env) {
  const ev = (x) => evaluate(x, env);
  switch (n.k) {
    case 'num': case 'str': case 'bool': return n.v;
    case 'var': return env.getVar(n.name);
    case 'prop': return env.getProp(n.obj, n.prop);
    case 'field': return fieldOf(ev(n.e), n.name);
    case 'neg': return -needNum(ev(n.e));
    case 'if': return compare(ev(n.cond.l), n.cond.op, ev(n.cond.r)) ? ev(n.yes) : ev(n.no); // only the chosen side is worked out
    case 'bin': {
      const a = ev(n.l), b = ev(n.r);
      if (n.op === '&') return fmt(a) + fmt(b);
      needNum(a); needNum(b);
      switch (n.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': if (b === 0) throw new ExprError("Can't divide by zero"); return a / b;
        case '%': if (b === 0) throw new ExprError("Can't divide by zero"); return a % b;
      }
      break;
    }
    case 'call': {
      if (n.name === 'random') {
        if (n.args.length !== 1) throw new ExprError('random() needs 1 value, e.g. random(6)');
        return Math.floor(env.random() * needNum(ev(n.args[0])));
      }
      const fn = FUNCS[n.name];
      if (!fn && env.call) return env.call(n.name, n.args.map(ev)); // one of the app's functions: Total(price, qty)
      if (!fn) throw new ExprError(`There's no function called "${n.name}"`);
      if (n.args.length !== fn.n) throw new ExprError(`${n.name}() needs ${fn.n} value${fn.n > 1 ? 's' : ''}`);
      return fn.f(...n.args.map(ev));
    }
  }
  throw new ExprError('Unknown expression');
}

// Static check for the editor: parse errors and unknown names, without running.
// scope = { vars: Set<string>, objects: Map<string, Set<string>>, functions?: Map<name, [param]> }
export function check(src, scope) {
  const checkField = (name) => {
    if (!scope.fields || scope.fields.has(name)) return;
    const lower = [...scope.fields].find((f) => f.toLowerCase() === name.toLowerCase());
    throw new ExprError(lower ? `Use .${lower} (small letters), not .${name}` : scope.fields.size ? `No table has a field called "${name}".${meant(name, scope.fields)}` : `"${name}" would be a field of a table, but there are no tables yet`);
  };
  try {
    const ast = parse(String(src ?? ''));
    (function walk(n) {
      switch (n.k) {
        case 'var':
          if (!scope.vars.has(n.name) && !LOOP_NAMES.includes(n.name)) {
            if (scope.objects.has(n.name)) throw new ExprError(`${n.name} is an object, not a variable: use one of its properties, like ${n.name}.text`);
            throw new ExprError(`There's no variable called "${n.name}".${meant(n.name, [...scope.vars, ...LOOP_NAMES])}`);
          }
          break;
        case 'prop': {
          const props = scope.objects.get(n.obj);
          if (!props && (scope.vars.has(n.obj) || LOOP_NAMES.includes(n.obj))) { checkField(n.prop); break; } // a row of a table: LoopItem.artist
          if (!props) throw new ExprError(`There's no object called "${n.obj}" on this screen.${meant(n.obj, [...scope.objects.keys(), ...scope.vars])}`);
          if (!props.has(n.prop)) {
            const lower = [...props].find((p) => p.toLowerCase() === n.prop.toLowerCase());
            throw new ExprError(lower ? `Use ${n.obj}.${lower} (small letters), not ${n.obj}.${n.prop}` : `${n.obj} has no property "${n.prop}".${meant(n.prop, props)}`);
          }
          break;
        }
        case 'neg': walk(n.e); break;
        case 'if': {
          walk(n.cond.l); walk(n.cond.r); walk(n.yes); walk(n.no);
          if (n.yes.k !== n.no.k && ['num', 'str'].includes(n.yes.k) && ['num', 'str'].includes(n.no.k)) {
            throw new ExprError('Both choices in if() should be the same kind: both text or both numbers');
          }
          break;
        }
        case 'bin': walk(n.l); walk(n.r); break;
        case 'field': walk(n.e); checkField(n.name); break;
        case 'call': {
          const own = scope.functions?.get(n.name);
          if (own && n.args.length !== own.length) throw new ExprError(`${n.name}() needs ${own.length} value${own.length === 1 ? '' : 's'}${own.length ? ` (${own.join(', ')})` : ''}`);
          if (!own && !FUNCTION_NAMES().includes(n.name)) throw new ExprError(`There's no function called "${n.name}".${meant(n.name, [...(scope.functions?.keys() || []), ...FUNCTION_NAMES()])}`);
          n.args.forEach(walk);
          break;
        }
      }
    })(ast);
    return null;
  } catch (e) {
    if (e instanceof ExprError) return e.message;
    throw e;
  }
}

// Help for the "Find expressions" browser: [signature, what it does, example]
export const FUNCTION_HELP = {
  if:     ['if(test, yes, no)', 'Use one value or another, depending on a test.', 'if(score ≥ 10, "Win!", "Keep going")'],
  random: ['random(n)', 'A random whole number from 0 up to n - 1.', 'random(6) + 1   (a dice roll)'],
  round:  ['round(x)', 'Rounds to the nearest whole number.', 'round(2.6)  gives 3'],
  floor:  ['floor(x)', 'Rounds down.', 'floor(2.6)  gives 2'],
  ceil:   ['ceil(x)', 'Rounds up.', 'ceil(2.1)  gives 3'],
  abs:    ['abs(x)', 'Removes a minus sign.', 'abs(-5)  gives 5'],
  min:    ['min(a, b)', 'The smaller of two numbers.', 'min(score, 100)'],
  max:    ['max(a, b)', 'The bigger of two numbers.', 'max(lives - 1, 0)'],
  int:    ['int(text)', 'Turns text into a whole number (for maths with typed input).', 'int(Age.text) + 1'],
  float:  ['float(text)', 'Turns text into a number that can have decimals.', 'float(Price.text) * 2'],
  str:    ['str(x)', 'Turns a number into text.', 'str(score)'],
  len:    ['len(text)', 'How many characters are in some text.', 'len(Name.text)'],
  upper:  ['upper(text)', 'Text in CAPITALS. (uppercase() also works.)', 'upper(Name.text)'],
  count:  ['count(list)', 'How many items are in a list, or rows in a table.', 'count(journal)'],
  item:   ['item(list, n)', 'Item number n of a list (the first is 1). For a table, row n: add .field', 'item(Songs, 2).artist'],
  join:   ['join(list, between)', 'All the items as one piece of text.', 'join(chores, ", ")'],
  lower:  ['lower(text)', 'Text in lower case. (lowercase() also works.)', 'lower(Name.text)'],
  contains: ['contains(text, part)', 'true if the text has the part in it (capitals count).', 'contains(lower(LoopItem.title), lower(Search.text))'],
  uppercase: ['uppercase(text)', 'Same as upper().', 'uppercase(Name.text)'],
  lowercase: ['lowercase(text)', 'Same as lower().', 'lowercase(Name.text)'],
};
export const OPERATOR_HELP = [
  ['&', 'Joins pieces of text', '"Hi " & Name.text'],
  ['+  -', 'Add, subtract (numbers only)', 'score + 1'],
  ['*  /', 'Multiply, divide', 'price * 2'],
  ['%', 'Remainder after dividing', 'n % 2  is 0 for even numbers'],
  ['( )', 'Work this part out first', '(goal - minutes) & " to go"'],
];

// Split text into coloured pieces for the editor. Never throws, so it works while the student is mid-typing.
// kinds: str, num, op, fn, name, plain
export function highlight(src) {
  const out = [];
  const re = /("[^"“”]*["“”]?|[“”][^"“”]*["“”]?)|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)|(==|!=|<=|>=|[&+\-*/%=<>≠≤≥(),])|(\s+|.)/gu;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] !== undefined) out.push(['str', m[1]]);
    else if (m[2] !== undefined) out.push(['num', m[2]]);
    else if (m[3] !== undefined) out.push([/^\s*\(/.test(src.slice(re.lastIndex)) ? 'fn' : (m[3] === 'true' || m[3] === 'false' ? 'num' : 'name'), m[3]]);
    else if (m[4] !== undefined) out.push(['op', m[4]]);
    else out.push(['plain', m[5]]);
  }
  return out;
}
