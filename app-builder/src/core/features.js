// Features: what a project (or a lesson) lets the student see and use.
//
// project.features = { level: 1-4, allow?: { cond?: [ids], act?: [ids] }, ui?: { sub, else, pick, instVars } }
//   level  a named preset (Starter, Conditions, Copies, Everything)
//   allow  a lesson's own list of catalog ids; overrides the level's lists (like a MakeCode tutorial toolbox)
//   ui     optional overrides for the UI switches
// Nothing is deleted: things already in a project always show and run. Features only decide
// what the "add" menus and panels OFFER.
//
// No features set (older projects) means everything is available.
import { CONDITIONS, ACTIONS } from './catalog.js';

const ALL_KINDS = ['button', 'text', 'input'];
const L1_COND = ['onStart', 'onClicked'];
const L1_ACT = ['setText', 'setVar', 'addTo', 'subtractFrom', 'goToScreen', 'setVisible'];
const L2_COND = [...L1_COND, 'everyTick', 'compareVar', 'compareValues', 'onChanged'];
const L3_COND = [...L2_COND, 'compareInst'];
const L3_ACT = [...L1_ACT, 'setInst', 'addToInst'];

export const LEVELS = {
  1: { name: 'Starter',    kinds: ['button', 'text'], cond: L1_COND, act: L1_ACT, sub: false, else: false, pick: true, instVars: false },
  2: { name: 'Conditions', kinds: ALL_KINDS,          cond: L2_COND, act: L1_ACT, sub: true,  else: true,  pick: true, instVars: false },
  3: { name: 'Copies',     kinds: ALL_KINDS,          cond: L3_COND, act: L3_ACT, sub: true,  else: true,  pick: true, instVars: true },
  4: { name: 'Everything', kinds: ALL_KINDS,          cond: null,    act: null,    sub: true,  else: true,  pick: true, instVars: true },
};

export function resolve(feat) {
  const level = LEVELS[feat?.level] ? feat.level : 4;
  const lv = LEVELS[level];
  const out = {
    level, name: lv.name, kinds: lv.kinds,
    cond: lv.cond ? new Set(lv.cond) : null,
    act: lv.act ? new Set(lv.act) : null,
    sub: lv.sub, else: lv.else, pick: lv.pick, instVars: lv.instVars,
    custom: !!feat?.allow,
  };
  if (feat?.allow?.cond) out.cond = new Set(feat.allow.cond);
  if (feat?.allow?.act) out.act = new Set(feat.allow.act);
  for (const k of ['sub', 'else', 'pick', 'instVars']) if (typeof feat?.ui?.[k] === 'boolean') out[k] = feat.ui[k];
  return out;
}

// kind: 'cond' | 'act'. A null resolved set means "everything".
export function canUse(rf, kind, type) {
  if (!rf) return true;
  const set = kind === 'cond' ? rf.cond : rf.act;
  return !set || set.has(type);
}

// ?level=1&allow=onClicked,addTo,setText&lock=1
export function fromParams(search) {
  const p = new URLSearchParams(search);
  const out = { locked: p.get('lock') === '1' };
  const level = Number(p.get('level'));
  if (LEVELS[level]) out.level = level;
  const allow = p.get('allow');
  if (allow) {
    const ids = allow.split(',').map((s) => s.trim()).filter(Boolean);
    out.allow = { cond: ids.filter((i) => CONDITIONS[i]), act: ids.filter((i) => ACTIONS[i]) };
  }
  return out;
}
