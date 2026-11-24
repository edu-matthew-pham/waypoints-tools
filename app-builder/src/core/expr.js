// A tiny, safe expression language for the event editor.
//   numbers, "text", true/false, variables, Object.property, functions,
//   + - * / %  (numbers only)   & (joins text)
// No eval, no JS: the parser builds a small tree and we walk it.

export class ExprError extends Error {
  constructor(message) { super(message); this.name = 'ExprError'; }
}

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
      if (isOp('(')) {
        p++;
        const args = [];
        if (!isOp(')')) { do { args.push(concat()); } while (isOp(',') && ++p); }
        expect(')');
        return { k: 'call', name: t.v, args };
      }
      if (isOp('.')) {
        p++;
        const pr = toks[p++];
        if (!pr || pr.t !== 'id') throw new ExprError(`Expected a property name after "${t.v}."`);
        return { k: 'prop', obj: t.v, prop: pr.v };
      }
      return { k: 'var', name: t.v };
    }
    if (t.t === 'op' && t.v === '(') { const e = concat(); expect(')'); return e; }
    throw new ExprError(`Unexpected "${t.v}"`);
  }

  const ast = concat();
  if (p < toks.length) throw new ExprError(`Unexpected "${toks[p].v}"`);
  cache.set(src, ast);
  return ast;
}

export function fmt(v) {
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
export const FUNCTION_NAMES = [...Object.keys(FUNCS), 'random'];

// env = { getVar(name), getProp(obj, prop), random() }
export function evaluate(n, env) {
  const ev = (x) => evaluate(x, env);
  switch (n.k) {
    case 'num': case 'str': case 'bool': return n.v;
    case 'var': return env.getVar(n.name);
    case 'prop': return env.getProp(n.obj, n.prop);
    case 'neg': return -needNum(ev(n.e));
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
      if (!fn) throw new ExprError(`There's no function called "${n.name}"`);
      if (n.args.length !== fn.n) throw new ExprError(`${n.name}() needs ${fn.n} value${fn.n > 1 ? 's' : ''}`);
      return fn.f(...n.args.map(ev));
    }
  }
  throw new ExprError('Unknown expression');
}

// Static check for the editor: parse errors and unknown names, without running.
// scope = { vars: Set<string>, objects: Map<string, Set<string>> }
export function check(src, scope) {
  try {
    const ast = parse(String(src ?? ''));
    (function walk(n) {
      switch (n.k) {
        case 'var':
          if (!scope.vars.has(n.name)) throw new ExprError(`There's no variable called "${n.name}"`);
          break;
        case 'prop': {
          const props = scope.objects.get(n.obj);
          if (!props) throw new ExprError(`There's no object called "${n.obj}" on this screen`);
          if (!props.has(n.prop)) throw new ExprError(`${n.obj} has no property "${n.prop}"`);
          break;
        }
        case 'neg': walk(n.e); break;
        case 'bin': walk(n.l); walk(n.r); break;
        case 'call':
          if (!FUNCTION_NAMES.includes(n.name)) throw new ExprError(`There's no function called "${n.name}"`);
          n.args.forEach(walk);
          break;
      }
    })(ast);
    return null;
  } catch (e) {
    if (e instanceof ExprError) return e.message;
    throw e;
  }
}
