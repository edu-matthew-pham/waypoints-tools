// The Embed bridge (ROADMAP §13, phase 2): an Embed's page and the app's events pass named values to each other.
//
//   page -> app:  parent.postMessage({ name: 'period', value: 1.42 }, '*')
//                 runs "Sim sends period"; Sim.period is the latest value
//   app -> page:  "Send gravity = 5 to Sim" posts { name: 'gravity', value: 5 } to the page's window
//
// An Embed lists the names it sends and the names it listens for (Properties), so the event sheet can offer them,
// expressions can check Sim.period, and the copyable prompt can tell an AI chat what to make.
// Messages are data, never code: a name (a short identifier the Embed lists) and one plain value (text, a number,
// true or false). Anything else is dropped. Which window a message came from is the renderer's check (ui/stage.js).

export const MAX_TEXT = 1000;
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
// an Embed's own property names, which a message can't use
export const RESERVED = new Set(['text', 'x', 'y', 'w', 'h', 'visible', 'page', 'sends', 'listens']); // PROP_NAMES (project.js) and the Embed's own

// "period, angle" -> ['period', 'angle']: names only, no repeats, none of the Embed's own property names
export function messageNames(s) {
  const out = [];
  for (const n of String(s ?? '').split(/[\s,;]+/)) if (NAME.test(n) && !RESERVED.has(n) && !out.includes(n)) out.push(n);
  return out;
}
// the words in a names box that can't be used, to say so in Properties
export function badNames(s) {
  return String(s ?? '').split(/[\s,;]+/).filter((n) => n && (!NAME.test(n) || RESERVED.has(n)));
}

// one plain value, or undefined if it isn't one
export function plainValue(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.length <= MAX_TEXT ? v : undefined;
  return undefined;
}

// A message from a page, checked: { name, value } or null. Only names the Embed lists in Sends are let through.
export function readMessage(data, sends) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const { name } = data;
  if (typeof name !== 'string' || !NAME.test(name) || !messageNames(sends).includes(name)) return null;
  const value = plainValue(data.value);
  return value === undefined ? null : { name, value };
}

// The copyable prompt for an AI chat: one self-contained HTML file that talks to App Builder by these messages.
export function embedPrompt({ what = '', sends = '', listens = '' } = {}) {
  const out = messageNames(sends), inn = messageNames(listens);
  const lines = [
    `Make ${what.trim() ? what.trim() : 'an interactive simulation'} as ONE self-contained HTML file: all scripts and styles inside it, no other files. If you need a library, load it from a CDN link. It will be shown inside an app, in a box about 480 by 320 pixels, so make it fit and resize with the box.`,
    'It runs in a sandboxed iframe: do not use localStorage, cookies, pop-up windows or alert().',
  ];
  if (out.length) {
    lines.push('', 'Tell the app about these values by posting a message to the page around it, whenever one changes (and once at the start):');
    for (const n of out) lines.push(`  parent.postMessage({ name: '${n}', value: /* ${n}: a number or short text */ }, '*');`);
  }
  if (inn.length) {
    lines.push('', 'The app may send these to it; listen for them and update the simulation:');
    lines.push("  window.addEventListener('message', (e) => { const { name, value } = e.data || {}; /* ... */ });");
    for (const n of inn) lines.push(`  name '${n}': value is a number or short text`);
  }
  if (out.length || inn.length) lines.push('', 'Each message is { name, value } with one plain value: a number, short text, true or false. Use exactly these names.');
  lines.push('', 'Reply with the whole HTML file only.');
  return lines.join('\n');
}
