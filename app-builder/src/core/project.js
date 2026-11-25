// Project model helpers (plain JSON in, plain JSON out; no DOM).
//
// project = { version, name, features, variables:[variable], screens:[screen] }   (features: see features.js)
// variable= { name, value, remember? }              value: a number or text, an array (a list), or for a table
//           { name, table:{ fields:[{name,type}] }, value:[record], remember? }   record = { field: value }
//           type is 'text' or 'number'. remember: kept in the browser between visits (Run, not the project file)
// screen  = { id, name, objects:[object], events:[event] }
// object  = { name, kind, instanceVars:[{name,value}], instances:[instance] }
// instance= { id, x, y, w, h, text, visible, vars:{} }
// event   = { id, else, conds:[{type,...params}], actions:[{type,...params}], children:[event] }

import { OBJECT_KINDS } from './catalog.js';
import { imageNames } from './assets.js';

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
  return { version: 1, name, device: 'web', features: { level: 2 }, variables: [], screens: [newScreen('Home')] };
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
export const FIELD_TYPES = [['text', 'Text'], ['number', 'Number']];

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

export function scopeFor(project, screen) {
  return {
    objects: (screen?.objects || []).map((o) => ({ name: o.name, kind: o.kind, vars: o.instanceVars.map((v) => v.name) })),
    variables: project.variables.filter((v) => !Array.isArray(v.value)).map((v) => v.name),
    lists: project.variables.filter(isList).map((v) => v.name),
    tables: project.variables.filter(isTable).map((v) => v.name),
    tableFields: Object.fromEntries(project.variables.filter(isTable).map((v) => [v.name, tableFields(v)])),
    screens: project.screens.map((s) => ({ id: s.id, name: s.name })),
    pictures: imageNames(project),
  };
}

// Scope for expression checking: { vars:Set, objects:Map<name,Set<prop>>, start }
// start = starting values, used to preview what a value box will give before the app runs.
export function exprScopeFor(project, screen) {
  const start = {
    vars: Object.fromEntries(project.variables.map((v) => [v.name, v.value])),
    objects: Object.fromEntries((screen?.objects || []).map((o) => {
      const i = o.instances[0] || {};
      const k = OBJECT_KINDS[o.kind] || {};
      const vals = { text: i.text ?? '', x: i.x ?? 0, y: i.y ?? 0, w: i.w ?? 0, h: i.h ?? 0, visible: i.visible !== false };
      for (const [key, v] of Object.entries(k.extra || {})) vals[key] = i[key] ?? v;
      for (const iv of o.instanceVars) vals[iv.name] = i.vars && iv.name in i.vars ? i.vars[iv.name] : iv.value;
      return [o.name, vals];
    })),
  };
  return {
    start,
    fields: new Set(project.variables.filter(isTable).flatMap(tableFields)),
    vars: new Set(project.variables.map((v) => v.name)),
    objects: new Map((screen?.objects || []).map((o) => [o.name, new Set([...PROP_NAMES, ...(OBJECT_KINDS[o.kind]?.exposes || []), ...o.instanceVars.map((v) => v.name)])])),
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
  p.assets ||= [];
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
