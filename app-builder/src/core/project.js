// Project model helpers (plain JSON in, plain JSON out; no DOM).
//
// project = { version, name, features, variables:[{name,value}], screens:[screen] }   (features: see features.js)
// screen  = { id, name, objects:[object], events:[event] }
// object  = { name, kind, instanceVars:[{name,value}], instances:[instance] }
// instance= { id, x, y, w, h, text, visible, vars:{} }
// event   = { id, else, conds:[{type,...params}], actions:[{type,...params}], children:[event] }

import { OBJECT_KINDS } from './catalog.js';

export const STAGE = { w: 390, h: 700 };
export const PROP_NAMES = ['text', 'x', 'y', 'w', 'h', 'visible'];

export const uid = (prefix = '') => prefix + Math.random().toString(36).slice(2, 8);

export function newScreen(name = 'Screen') { return { id: uid('s'), name, objects: [], events: [] }; }
export function newProject(name = 'My app') {
  return { version: 1, name, features: { level: 2 }, variables: [], screens: [newScreen('Home')] };
}
export function newEvent(extra = {}) { return { id: uid('e'), else: false, conds: [], actions: [], children: [], ...extra }; }

export function uniqueObjectName(screen, base) {
  const names = new Set(screen.objects.map((o) => o.name));
  let n = 1;
  while (names.has(base + n)) n++;
  return base + n;
}

export function addObject(screen, kind) {
  const k = OBJECT_KINDS[kind];
  const name = uniqueObjectName(screen, k.base);
  const bottom = screen.objects.flatMap((o) => o.instances).reduce((m, i) => Math.max(m, i.y + i.h), 8);
  const y = Math.min(bottom + 16, STAGE.h - k.props.h - 8);
  const inst = { id: uid('i'), x: Math.round((STAGE.w - k.props.w) / 2), y, w: k.props.w, h: k.props.h, text: k.props.text, visible: true, vars: {}, ...(k.extra || {}) };
  const obj = { name, kind, instanceVars: [], instances: [inst] };
  screen.objects.push(obj);
  return { obj, inst };
}

export function duplicateInstance(obj, inst) {
  const copy = JSON.parse(JSON.stringify(inst));
  copy.id = uid('i');
  copy.x = Math.min(inst.x + 16, STAGE.w - inst.w);
  copy.y = Math.min(inst.y + inst.h + 12, STAGE.h - inst.h);
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

export function scopeFor(project, screen) {
  return {
    objects: (screen?.objects || []).map((o) => ({ name: o.name, kind: o.kind, vars: o.instanceVars.map((v) => v.name) })),
    variables: project.variables.map((v) => v.name),
    screens: project.screens.map((s) => ({ id: s.id, name: s.name })),
  };
}

// Scope for expression checking: { vars:Set, objects:Map<name,Set<prop>> }
export function exprScopeFor(project, screen) {
  return {
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
  p.features ||= { level: 4 }; // older projects: nothing hidden
  for (const s of p.screens) {
    s.objects ||= []; s.events ||= [];
    for (const o of s.objects) { o.instanceVars ||= []; o.instances ||= []; }
  }
  return p;
}
