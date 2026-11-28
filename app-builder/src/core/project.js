// Project model helpers (plain JSON in, plain JSON out; no DOM).
//
// project = { version, name, features, variables:[variable], screens:[screen], allScreens:{ events:[event] }, functions:[function] }
//           (features: the education layer's levels, edu/features.js; core only carries it; allScreens: core/shared.js; functions: core/functions.js)
// variable= { name, value, remember? }              value: a number or text, an array (a list), or for a table
//           { name, table:{ fields:[{name,type}] }, value:[record], remember? }   record = { field: value }
//           type is 'text', 'number', 'picture' or 'sound'. remember: kept in the browser between visits (Run, not the project file)
// screen  = { id, name, objects:[object], events:[event] }
// object  = { name, kind, instanceVars:[{name,value}], instances:[instance] }
// instance= { id, x, y, w, h, text, visible, vars:{} }
// event   = { id, else, conds:[{type,...params}], actions:[{type,...params}], children:[event] }

import { givesValue } from './functions.js';
import { OBJECT_KINDS } from './catalog.js';
import { imageNames, soundNames } from './assets.js';
import { messageNames } from './embed-bridge.js';

// Screen size of the app being built. Web page is the default; Phone is a per-project option.
export const DEVICES = {
  web:   { w: 800, h: 600, label: 'Web page' },
  phone: { w: 390, h: 700, label: 'Phone' },
};
export const sizeOf = (project) => DEVICES[project?.device] || DEVICES.web;
export const PROP_NAMES = ['text', 'x', 'y', 'w', 'h', 'visible'];

export const uid = (prefix = '') => prefix + Math.random().toString(36).slice(2, 8);

export function newScreen(name = 'Screen') { return { id: uid('s'), name, objects: [], events: [] }; }
export function newProject(name = 'My app') {
  return { version: 1, name, device: 'web', features: { level: 4 }, variables: [], screens: [newScreen('Home')] }; // New: everything offered; lessons set a level
}
export function newEvent(extra = {}) { return { id: uid('e'), else: false, conds: [], actions: [], children: [], ...extra }; }

export function uniqueObjectName(screen, base) {
  const names = new Set(screen.objects.map((o) => o.name));
  let n = 1;
  while (names.has(base + n)) n++;
  return base + n;
}

export function addObject(screen, kind, size = DEVICES.web) {
  const k = OBJECT_KINDS[kind];
  const name = uniqueObjectName(screen, k.base);
  const bottom = screen.objects.flatMap((o) => o.instances).reduce((m, i) => Math.max(m, i.y + i.h), 8);
  const y = Math.min(bottom + 16, size.h - k.props.h - 8);
  const inst = { id: uid('i'), x: Math.round((size.w - k.props.w) / 2), y, w: k.props.w, h: k.props.h, text: k.props.text, visible: true, vars: {}, ...(k.extra || {}) };
  const obj = { name, kind, instanceVars: [], instances: [inst] };
  screen.objects.push(obj);
  return { obj, inst };
}

export function duplicateInstance(obj, inst, size = DEVICES.web) {
  const copy = JSON.parse(JSON.stringify(inst));
  copy.id = uid('i');
  copy.x = Math.min(inst.x + 16, size.w - inst.w);
  copy.y = Math.min(inst.y + inst.h + 12, size.h - inst.h);
  obj.instances.push(copy);
  return copy;
}

export function findInstance(screen, id) {
  for (const obj of screen.objects) {
    const inst = obj.instances.find((i) => i.id === id);
    if (inst) return { obj, inst };
  }
  return null;
}

export function deleteInstance(screen, id) {
  const hit = findInstance(screen, id);
  if (!hit) return;
  hit.obj.instances = hit.obj.instances.filter((i) => i.id !== id);
  if (!hit.obj.instances.length) screen.objects = screen.objects.filter((o) => o !== hit.obj);
}

// A table is a variable holding a list of records with named fields; a list is a plain array.
export const isTable = (v) => !!v?.table;
export const isList = (v) => Array.isArray(v?.value) && !v.table;
export const tableFields = (v) => (v?.table?.fields || []).map((f) => f.name);
// picture: a picture made while the app runs (a media reference) or the name of a built-in or uploaded picture
// sound: a recording made while the app runs (a media reference) or the name of a built-in or uploaded sound
export const FIELD_TYPES = [['text', 'Text'], ['number', 'Number'], ['picture', 'Picture'], ['sound', 'Sound']];

// Linked tables (advanced): a field of type 'link' holds the first field's value (the key) of a row in another
// table, such as a song's playlist naming a row of Playlists. It is text underneath, so For each + a condition
// finds "the songs in this playlist"; the sidebar shows a dropdown of that table's keys and marks broken links.
export const linkKeys = (project, tableName) => {
  const t = project.variables.find((v) => v.name === tableName && v.table);
  const key = t?.table.fields[0]?.name;
  return key ? t.value.map((r) => String(r[key] ?? '')) : [];
};
// tables that link to this one: [{ table, field }]
export const linksTo = (project, tableName) => project.variables.filter(isTable)
  .flatMap((v) => v.table.fields.filter((f) => f.type === 'link' && f.to === tableName).map((f) => ({ table: v, field: f })));
// a key changed in the sidebar: rows that linked to the old key follow it
export function renameKey(project, tableName, from, to) {
  if (from === to || from === '') return 0;
  let n = 0;
  for (const { table, field } of linksTo(project, tableName)) for (const r of table.value) if (r[field.name] === from) { r[field.name] = to; n++; }
  return n;
}
// The nested view (read only): each row of a table with, inside it, the rows of a table that link to it, e.g.
// Playlists with their Songs. "Store flat, send nested": built to look at and copy, never stored or edited.
export function nestedView(project, parentName, childName, fieldName) {
  const parent = project.variables.find((v) => v.name === parentName && v.table);
  const child = project.variables.find((v) => v.name === childName && v.table);
  const key = parent?.table.fields[0]?.name;
  if (!parent || !child || !key) return [];
  return parent.value.map((r) => ({ ...r, [childName]: child.value.filter((c) => c[fieldName] === r[key])
    .map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== fieldName))) }));
}

// a table is deleted: fields that linked to it become plain text (their values stay)
export function unlinkTable(project, tableName) {
  for (const { field } of linksTo(project, tableName)) { field.type = 'text'; delete field.to; }
}

// What a Table object shows: its chosen columns (blank = every field, in order) of the table it shows.
export function tableColumns(project, inst) {
  const v = project.variables.find((x) => x.name === inst.source && x.table);
  const all = tableFields(v);
  const want = String(inst.columns || '').split(',').map((x) => x.trim()).filter(Boolean);
  return want.length ? want.filter((f) => all.includes(f)) : all;
}

export function newTable(name) { return { name, table: { fields: [{ name: 'name', type: 'text' }] }, value: [] }; }

// A value typed into a table cell (or given by an action), turned into the field's type.
// Returns { value } or { error } (a number field given text that isn't a number).
export function fieldValue(type, v) {
  if (type !== 'number') return { value: typeof v === 'string' ? v : v == null ? '' : String(v) };
  if (typeof v === 'number') return { value: v };
  const t = String(v ?? '').trim();
  if (t === '') return { value: 0 };
  const n = Number(t);
  return Number.isFinite(n) ? { value: n } : { error: `"${v}" isn't a number` };
}

// Text copied from a spreadsheet: rows on lines, cells split by tabs (or commas when there are no tabs).
// Quoted cells may hold tabs, commas or new lines ("a ""quoted"" word" as spreadsheets write it).
export function parseCells(text) {
  const src = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (src === '') return [];
  const sep = src.includes('\t') ? '\t' : ',';
  const rows = [[]];
  let cell = '', i = 0, quoted = false;
  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"' && cell === '') { quoted = true; i++; continue; }
    if (c === sep) { rows.at(-1).push(cell); cell = ''; i++; continue; }
    if (c === '\n') { rows.at(-1).push(cell); cell = ''; rows.push([]); i++; continue; }
    cell += c; i++;
  }
  rows.at(-1).push(cell);
  return rows.map((r) => r.map((x) => x.trim()));
}

// Paste cells into a table, starting at a row (1-based) and field; rows are added as needed. A first row that
// repeats the field names is skipped. Nothing changes if any number field gets text: { error } says where.
// Returns { rows, skipped } (skipped: cells past the last field, which are left out).
export function pasteRows(table, text, { row = 1, field } = {}) {
  const fields = table.table.fields;
  let cells = parseCells(text);
  let col = Math.max(0, fields.findIndex((f) => f.name === field));
  if (cells.length > 1 && cells[0].every((c, i) => fields[col + i] && c.toLowerCase() === fields[col + i].name.toLowerCase())) cells = cells.slice(1);
  if (!cells.length) return { rows: 0, skipped: 0 };
  let skipped = 0;
  const writes = [];
  for (const [ri, r] of cells.entries()) {
    for (const [ci, c] of r.entries()) {
      const f = fields[col + ci];
      if (!f) { if (c !== '') skipped++; continue; }
      const res = fieldValue(f.type, c);
      if (res.error) return { error: `row ${row + ri}, ${f.name}: ${res.error}` };
      writes.push([row - 1 + ri, f.name, res.value]);
    }
  }
  for (const [ri, name, value] of writes) {
    while (table.value.length <= ri) table.value.push(Object.fromEntries(fields.map((f) => [f.name, f.type === 'number' ? 0 : ''])));
    table.value[ri][name] = value;
  }
  return { rows: cells.length, skipped };
}

export function scopeFor(project, screen) {
  return {
    objects: (screen?.objects || []).map((o) => ({ name: o.name, kind: o.kind, vars: o.instanceVars.map((v) => v.name),
      ...(o.kind === 'embed' ? { sends: messageNames(o.instances[0]?.sends), listens: messageNames(o.instances[0]?.listens) } : {}) })),
    variables: project.variables.filter((v) => !Array.isArray(v.value)).map((v) => v.name),
    lists: project.variables.filter(isList).map((v) => v.name),
    tables: project.variables.filter(isTable).map((v) => v.name),
    tableFields: Object.fromEntries(project.variables.filter(isTable).map((v) => [v.name, tableFields(v)])),
    screens: project.screens.map((s) => ({ id: s.id, name: s.name })),
    functions: (project.functions || []).map((f) => ({ name: f.name, params: [...f.params], gives: givesValue(f) })),
    pictures: imageNames(project),
    sounds: soundNames(project),
  };
}

// Scope for expression checking: { vars:Set, objects:Map<name,Set<prop>>, start, functions:Map<name,params>, params:Set }
// start = starting values, used to preview what a value box will give before the app runs.
// fn (optional): the function being edited; its parameters are plain names in its value boxes.
export function exprScopeFor(project, screen, fn) {
  const start = {
    vars: Object.fromEntries(project.variables.map((v) => [v.name, v.value])),
    objects: Object.fromEntries((screen?.objects || []).map((o) => {
      const i = o.instances[0] || {};
      const k = OBJECT_KINDS[o.kind] || {};
      const vals = { text: i.text ?? '', x: i.x ?? 0, y: i.y ?? 0, w: i.w ?? 0, h: i.h ?? 0, visible: i.visible !== false };
      for (const [key, v] of Object.entries(k.extra || {})) vals[key] = i[key] ?? v;
      if (k.exposes?.includes('playing')) vals.playing = false;
      for (const iv of o.instanceVars) vals[iv.name] = i.vars && iv.name in i.vars ? i.vars[iv.name] : iv.value;
      return [o.name, vals];
    })),
  };
  return {
    start,
    fields: new Set(project.variables.filter(isTable).flatMap(tableFields)),
    vars: new Set([...project.variables.map((v) => v.name), ...(fn?.params || [])]),
    params: new Set(fn?.params || []),
    functions: new Map((project.functions || []).map((f) => [f.name, f.params])),
    // an Embed's values are the names it sends (Sim.period)
    objects: new Map((screen?.objects || []).map((o) => [o.name, new Set([...PROP_NAMES, ...(OBJECT_KINDS[o.kind]?.exposes || []), ...o.instanceVars.map((v) => v.name),
      ...(o.kind === 'embed' ? messageNames(o.instances[0]?.sends) : [])])])),
  };
}

export function isIdentifier(s) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && s !== 'true' && s !== 'false'; }

// "12" -> 12, anything else stays text
export function parseValue(s) {
  const t = String(s).trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : String(s);
}

export function checkProject(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.screens) || !p.screens.length) throw new Error('This file is not an app project.');
  p.variables ||= [];
  for (const v of p.variables) if (v.table) { v.table.fields ||= []; if (!Array.isArray(v.value)) v.value = []; }
  for (const v of p.variables) for (const f of v.table?.fields || []) if (f.type === 'link' && !p.variables.some((t) => t.table && t.name === f.to && t !== v)) { f.type = 'text'; delete f.to; }
  p.allScreens ||= { events: [] }; // the All screens sheet (core/shared.js)
  p.allScreens.events ||= [];
  p.functions ||= []; // core/functions.js
  for (const f of p.functions) { f.id ||= uid('f'); f.params ||= []; f.events ||= []; if (!f.events.length) f.events.push(newEvent()); }
  p.assets ||= [];
  p.sounds ||= [];
  p.device ||= 'phone'; // projects from before the Web page option were phone-sized
  p.features ||= { level: 4 }; // older projects: nothing hidden
  const seen = new Set();
  for (const s of p.screens) {
    s.objects ||= []; s.events ||= [];
    for (const o of s.objects) {
      o.instanceVars ||= []; o.instances ||= [];
      // every copy needs its own id (selecting, dragging and picking go by id): rename any repeat
      for (const i of o.instances) { let id = String(i.id ?? ''); if (!id || seen.has(id)) { let n = 1; while (seen.has(`${id || 'i'}-${n}`)) n++; id = `${id || 'i'}-${n}`; } i.id = id; seen.add(id); }
    }
  }
  return p;
}
