// Guided tutorials, read straight from a Waypoints lesson (waypoints-tutorials content/<course>/<lesson>/lesson.md).
// The lesson stays the one source: the website shows it as a page, and App Builder shows the same steps beside the
// editor when a link opens it with ?lesson=<course>/<lesson> (or ?tutorial=<url>). Off otherwise.
//
// What App Builder takes from the lesson (the tutorials' own format, tools/lesson-core.mjs there):
//   ## Step title              one tutorial step per section whose ```step block has try: { playground: appbuilder, keep }
//   ### Task title             a step with two or more tasks becomes one tutorial step per task
//   the section's text         shown in the step card (simple Markdown: lists, bold, italic, code, links)
//   check: { type: code, rules }   the step ticks itself when the rules pass on the sheet text (same rules as the page:
//                                  contains, event, lacks). No code check: the student just moves on with Next.
//   clip:                       the lesson clip's click and type selectors (data-ab labels) are what the tutorial
//                               points at, in order; its captions say what that pointer is for
//   clip expect: on the app      a "Try it" tick: the running app (preview or Run tab) shows that, or the object changed
//                               from how it was designed (students type their own numbers, not the clip's)
//   try: { starter, level }     the first such step's starter is the project the tutorial starts from (one project
//                               all the way through, like the lesson's `keep:`), and its level is the level
// An App Builder step before the first build step with its own starter (Try the finished app) becomes step 1: its
// text and a button that opens that app in a player over the editor, so the student's own work is never swapped.
// Steps with no App Builder (a quiz) stay on the website.
// No DOM here, so tests run it in Node. Imports nothing from core/ or the editor.
import yaml from 'js-yaml';
import { COMPONENTS } from '../core/components.js';

const STEP_RE = /```step[ \t]*\n([\s\S]*?)\n```[ \t]*\n?/;

// A ```code file#region block inside the lesson is that file's region (the tutorials' inline code).
export function inlineFiles(text) {
  const files = {};
  const rest = text.replace(/^```code[ \t]+([\w.\-/]+)#([\w-]+)[ \t]*\n([\s\S]*?)\n```[ \t]*$\n?/gm, (_, file, name, body) => {
    files[file] = (files[file] || '') + `// region: ${name}\n${body}\n// endregion\n`;
    return '';
  });
  return { files, rest };
}

// file#region: the lines between `// region: name` and `// endregion` (any comment style the tutorials use)
export function region(text, name) {
  const marker = /^\s*(?:#|\/\/|<!--|\/\*|%%)\s*(end)?region\b\s*:?\s*([\w-]*)/;
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  if (!name) return lines.filter((l) => !marker.test(l)).join('\n').trim();
  const out = [];
  let on = false;
  for (const line of lines) {
    const m = line.match(marker);
    if (m && !m[1] && m[2] === name) { on = true; continue; }
    if (m && m[1] && on) break;
    if (on) out.push(line);
  }
  if (!out.length) throw new Error(`region "${name}" not found`);
  return out.join('\n').trim();
}

// What the student is pointed at, from a lesson clip: click and type actions, each with the caption before it.
export function targetsOf(clip) {
  const out = [];
  let caption = '';
  for (const a of Array.isArray(clip) ? clip : []) {
    if (!a || typeof a !== 'object') continue;
    if (a.caption) caption = typeof a.caption === 'string' ? a.caption : a.caption.text || '';
    // a single letter pressed straight after a click picks a dropdown's option by its first letter
    if (typeof a.press === 'string' && a.press.length === 1 && out.length && out[out.length - 1].action === 'click' && !out[out.length - 1].key) { out[out.length - 1].key = a.press; continue; }
    // arrow keys straight after a click move a dropdown's choice up or down from where it was
    const last = out[out.length - 1];
    if ((a.press === 'ArrowUp' || a.press === 'ArrowDown') && last?.action === 'click' && !last.key) { last.arrows = (last.arrows || 0) + (a.press === 'ArrowDown' ? 1 : -1); continue; }
    // Escape in a clip closes a dialog without choosing (e.g. clicking a condition to select its event): Cancel
    if (a.press === 'Escape') { out.push({ selector: "dialog[open] [data-ab='cancel']", action: 'click', caption: 'Close this (Cancel): the event stays selected.', closes: true }); continue; }
    const sel = a.click?.selector || a.type?.selector;
    if (sel) out.push({ selector: sel, action: a.click ? 'click' : 'type', caption, ...(a.type ? { text: String(a.type.text ?? '') } : {}) });
  }
  return out;
}

// What the running app should show, from a clip's expect: lines on the app (not on the editor). `after` is the last
// object the clip clicked in the app before it, so the step can say "click SaveButton, then …".
export function triesOf(clip) {
  const out = [];
  let after = '';
  for (const a of Array.isArray(clip) ? clip : []) {
    const sel = a?.click?.selector || a?.expect?.selector || '';
    const inApp = /\.preview-col|\.view-run/.test(sel);
    const widget = sel.match(/widget:(\w+)/)?.[1] || '';
    if (a?.click && inApp && widget) after = widget;
    if (a?.expect && inApp && (widget || /\.stage\b/.test(sel))) out.push({ widget, contains: String(a.expect.contains ?? ''), after });
  }
  return out;
}

// Variables a step names in bold or italics (*Minutes*), so the tutorial can point at their live values.
export function mentionedVariables(body, names) {
  return names.filter((n) => new RegExp(`\\*{1,2}${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*{1,2}`).test(body));
}

// The same rules as the lesson page (waypoints-tutorials tools/lesson-core.mjs, kind 'appbuilder'): spaces ignored;
// contains anywhere; each event list all on one event line; lacks nowhere.
export function evalRules(rules, text) {
  const flat = (s) => String(s).replace(/\s+/g, '');
  const lines = String(text).split('\n').filter((l) => l.startsWith('event:')).map(flat);
  const all = flat(text);
  const out = [];
  for (const f of rules?.contains || []) out.push({ label: `Has ${f}`, ok: all.includes(flat(f)) });
  for (const fs of rules?.event || []) { const list = [].concat(fs); out.push({ label: `One event with ${list.join(' + ')}`, ok: lines.some((l) => list.every((f) => l.includes(flat(f)))) }); }
  for (const f of rules?.lacks || []) out.push({ label: `No ${f}`, ok: !all.includes(flat(f)) });
  return out;
}
export const passes = (rules, text) => evalRules(rules, text).every((r) => r.ok);

// A step's check as a "still to do" list in plain words, each with what kind of thing it asks for, so the tutorial can
// show progress inside a step and point at the right control when the clip doesn't match what the student is doing:
//   object SaveButton (button) -> { type: 'object', name: 'SaveButton', kind: 'button', label: 'a Button called SaveButton' }
//   (text input)               -> { type: 'object', name: '', kind: 'input', label: 'a Text input' }
//   variable Minutes =         -> { type: 'variable', name: 'Minutes', label: 'a variable called Minutes' }
//   event: [a, b]              -> { type: 'event', frags: [a, b], label: 'an event: a → b' }
const KIND_BY_LABEL = Object.fromEntries(Object.values(COMPONENTS).map((c) => [c.label.toLowerCase(), c]));
export function todo(rules, text) {
  if (!rules) return [];
  const results = evalRules(rules, text);
  const items = [
    ...(rules.contains || []).map((f) => {
      // the object's kind in brackets, perhaps with its settings after: object EntriesTable (table) text "" shows Entries
      const m = String(f).trim().match(/^(?:object (\w+) )?\(([^)]+)\)(?:\s+(.*))?$/);
      const c = m && KIND_BY_LABEL[m[2].toLowerCase()];
      const more = m?.[3] ? m[3].replace(/^text ""\s*/, '').trim() : '';
      // present: an object of that name and kind is there already (only its settings, `more`, are still to do)
      if (c) return { type: 'object', name: m[1] || '', kind: c.id, label: `a ${c.label}${m[1] ? ` called ${m[1]}` : ''}${more ? ` (${more})` : ''}`,
        present: !!m[1] && String(text).replace(/\s+/g, '').includes(`object${m[1]}(${m[2]})`.replace(/\s+/g, '')) };
      const v = String(f).trim().match(/^(variable|list|table) (\w+)(?: =\s*(.*))?$/);
      if (v) {
        let value = v[3] ?? ''; try { if (value) value = String(JSON.parse(value)); } catch { /* as written */ }
        return { type: v[1] === 'variable' ? 'variable' : 'other', name: v[2], value, label: `a ${v[1]} called ${v[2]}${value !== '' ? `, starting at ${value}` : ''}` };
      }
      return { type: 'other', label: String(f) };
    }),
    ...(rules.event || []).map((fs) => ({ type: 'event', frags: [].concat(fs).map(String), label: 'an event: ' + [].concat(fs).join(' \u2026 ') })),
    ...(rules.lacks || []).map((f) => ({ type: 'other', label: `no longer: ${f}` })),
  ];
  return items.map((it, i) => ({ ...it, ok: results[i].ok }));
}

// lesson.md text -> { title, starter: 'app.json#start', level, steps: [{ title, body, check, targets }], files }
export function parseLesson(raw) {
  raw = String(raw).replace(/\r\n/g, '\n');
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fm) throw new Error('This isn’t a lesson: it should start with --- frontmatter ---.');
  const meta = yaml.load(fm[1]) || {};
  let { files, rest } = inlineFiles(raw.slice(fm[0].length));
  rest = rest.replace(/^```teacher[ \t]*\n[\s\S]*?\n```[ \t]*$\n?/gm, ''); // teacher notes never reach students
  const sections = rest.split(/^## /m).slice(1);
  let keep, starter, level;
  const steps = [];
  let sec = 0; // the website numbers every section: its clip video is clips/step-<sec>.mp4
  for (const chunk of sections) {
    sec++;
    const nl = chunk.indexOf('\n');
    const title = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
    let body = nl === -1 ? '' : chunk.slice(nl + 1);
    const m = body.match(STEP_RE);
    if (!m) continue;
    let config;
    try { config = yaml.load(m[1]) || {}; } catch { continue; }
    body = body.replace(m[0], '');
    const t = config.try;
    if (t?.playground !== 'appbuilder') continue;
    if (!t.keep) {
      // Try the finished app: only before the build starts, and only one
      if (keep === undefined && t.starter && !steps.length) steps.push({ title, body: body.trim(), check: null, targets: [], tries: [], clip: '', play: String(t.starter) });
      continue;
    }
    if (keep === undefined) { keep = t.keep; starter = t.starter; level = t.level; }
    else if (t.keep !== keep) continue;
    const targets = targetsOf(config.clip);
    const clip = Array.isArray(config.clip) && config.clip.length ? `step-${sec}` : '';
    const secs = body.split(/^### /m);
    const lead = secs.shift().trim();
    if (secs.length >= 2) {
      secs.forEach((s, n) => {
        const nl2 = s.indexOf('\n');
        const task = Array.isArray(config.tasks) ? config.tasks[n] || {} : {};
        steps.push({ title: (nl2 === -1 ? s : s.slice(0, nl2)).trim(), part: title, body: [n === 0 ? lead : '', nl2 === -1 ? '' : s.slice(nl2 + 1).trim()].filter(Boolean).join('\n\n'),
          check: codeCheck(task.check), targets: n === 0 ? targets : targetsOf(task.clip), tries: n === 0 ? triesOf(config.clip) : triesOf(task.clip), clip: n === 0 ? clip : '', start: String(t.starter || '') });
      });
    } else steps.push({ title, body: body.trim(), check: codeCheck(config.check), targets, tries: triesOf(config.clip), clip, start: String(t.starter || '') }); // start: the lesson's starter for this step
  }
  if (keep === undefined) throw new Error('This lesson has no App Builder build steps to guide.');
  return { title: meta.title ? String(meta.title) : 'Tutorial', starter: starter || '', level: Number(level) || null, steps, files };
}
const codeCheck = (c) => (c && c.type === 'code' && c.rules ? { text: String(c.text || ''), rules: c.rules } : null);

// What a tutorial link fetches: a lesson.md, or the lesson's source.json from the tutorials site ({ title, files },
// written beside each lesson page for Create's "Make your own version"), whose files hold lesson.md and app.json.
export function parseSource(text) {
  const t = String(text);
  if (!t.trimStart().startsWith('{')) return parseLesson(t);
  let src;
  try { src = JSON.parse(t); } catch { throw new Error('The lesson file couldn\u2019t be read.'); }
  const md = src?.files?.['lesson.md'];
  if (typeof md !== 'string') throw new Error('That isn\u2019t a lesson.');
  const tut = parseLesson(md);
  for (const [name, body] of Object.entries(src.files)) if (name !== 'lesson.md' && typeof body === 'string' && !(name in tut.files)) tut.files[name] = body;
  return tut;
}

// The step's video on the tutorials site (beside the lesson page: clips/step-N.mp4, with a transcript .vtt), or '' when
// the lesson didn't come from there (a lesson.md on GitHub or localhost has no recorded clips beside it).
export function clipUrls(step, lessonUrl) {
  if (!step.clip || !/^https:\/\/([a-z0-9-]+\.)*learningwaypoints\.com\//.test(lessonUrl || '')) return null;
  const at = (ext) => new URL(`clips/${step.clip}.${ext}`, lessonUrl).href;
  return { video: at('mp4'), poster: at('jpg'), captions: at('vtt') };
}

// "Stuck?" hints: the clip's captions, in order, without repeats.
export const hintsOf = (step) => [...new Set(step.targets.map((t) => t.caption).filter(Boolean))];

// Which steps are done: a step with a check is done while its rules pass (so undoing un-ticks it).
export const ticks = (tutorial, text) => tutorial.steps.map((s) => (s.check ? passes(s.check.rules, text) : null));

// Where a tutorial comes from. ?lesson=code/apps/practice-tracker reads that lesson as published on the tutorials site
// (its source.json), so the tutorial matches the page students see. ?tutorial=<url>: a lesson.md or source.json on an
// allowed site (Waypoints, the tutorials repo on GitHub, or a local copy while writing one); a lesson page's own
// address (ending in /) means its source.json.
export const LESSON_BASE = 'https://tutorials.learningwaypoints.com/';
const ALLOWED = [/^https:\/\/([a-z0-9-]+\.)*learningwaypoints\.com\//, /^https:\/\/raw\.githubusercontent\.com\/edu-matthew-pham\//, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//];
export function tutorialUrl(params, here) {
  const lesson = params.get('lesson');
  if (lesson) {
    if (!/^[\w-]+(\/[\w-]+)+$/.test(lesson)) return { error: `"${lesson}" isn’t a lesson name like code/apps/practice-tracker.` };
    return { url: LESSON_BASE + lesson + '/source.json', id: lesson };
  }
  const t = params.get('tutorial');
  if (!t) return null;
  let url;
  try { url = new URL(t, here).href; if (url.endsWith('/')) url += 'source.json'; } catch { return { error: 'That tutorial link couldn’t be read.' }; }
  if (!ALLOWED.some((re) => re.test(url))) return { error: 'Tutorials open only from Learning Waypoints or its tutorials repo.' };
  return { url, id: url.replace(/^https?:\/\//, '').replace(/\/(lesson\.md|source\.json)$/, '') };
}

// A project from beside the lesson (or inside it): `file#region`. loadStarter: the one the tutorial starts from.
export const loadStarter = (tutorial, lessonUrl, fetchText) => loadRef(tutorial, tutorial.starter, lessonUrl, fetchText);
export async function loadRef(tutorial, ref, lessonUrl, fetchText) {
  if (!ref) return null;
  const [file, name] = ref.split('#');
  const text = tutorial.files[file] ?? await fetchText(new URL(file, lessonUrl).href);
  return JSON.parse(region(text, name));
}
