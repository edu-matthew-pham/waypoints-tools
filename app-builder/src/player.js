// Player: runs a project (plain JSON) in a container. Uses only core/ and the stage (ui/stage.js and the small ui
// helpers it draws with): no editor state, no levels, no sidebar. The editor's Runner (run-engine.js) wraps it to add
// the Watch and Problems panels; another page could use it on its own:
//
//   const player = new Player(document.querySelector('#app'), { media: projectMedia(() => project) });
//   player.start(project);
import { Runtime } from './core/runtime.js';
import { usesKeys } from './core/catalog.js';
import { sizeOf, tableColumns } from './core/project.js';
import { imageData, soundInfo, videoSource } from './core/assets.js';
import { Stage } from './ui/stage.js';
import { pictures, media as mediaLookups } from './ui/component-ui.js';
import { h } from './ui/dom.js';

// "Remember between visits": one localStorage entry per variable under `base`. Fails safe: with storage blocked,
// the app still runs and just forgets.
export function localStore(base) {
  const key = (name) => `${base}.remember.${name}`;
  return {
    load: (name) => { try { const t = localStorage.getItem(key(name)); return t === null ? undefined : JSON.parse(t); } catch { return undefined; } },
    save: (name, value) => { try { if (value === undefined) localStorage.removeItem(key(name)); else localStorage.setItem(key(name), JSON.stringify(value)); } catch { /* storage blocked */ } },
  };
}

// How the stage finds pictures, sounds and videos for a project: by name in the project's uploads and the built-ins.
// `soundBase` is where built-in sound files are served (core/assets.js).
export const projectMedia = (getProject, { soundBase } = {}) => ({
  picture: (name) => imageData(getProject(), name),
  sound: (name) => soundInfo(getProject(), name, soundBase),
  video: (link) => videoSource(link, { allowYoutube: !!getProject().allowYoutube }),
  camera: () => !!getProject().allowCamera,
  mic: () => !!getProject().allowMic,
});

// Point the stage at these lookups ({ picture, sound, video, camera }; any left out are kept).
export function useMedia(m) {
  if (m.picture) pictures.lookup = m.picture;
  if (m.sound) mediaLookups.sound = m.sound;
  if (m.video) mediaLookups.video = m.video;
  if (m.camera) mediaLookups.camera = m.camera;
  if (m.mic) mediaLookups.mic = m.mic;
}

export class Player {
  // options: store (an object, or a function giving one at each start), media ({ picture, sound, video, camera }; leave
  // out to keep the lookups already set), keepMedia(dataUrl) -> what a made picture is kept as (default: the data: URL
  // itself; the editor keeps files in the media store and gives a reference), and hooks: onDraw(rt), onEventRan(id),
  // onScreen(screen, project), onStop(), openLink(link)
  constructor(host, { store = null, media = null, keepMedia = (d) => (d instanceof Blob ? URL.createObjectURL(d) : d), onDraw, onEventRan, onScreen, onStop, openLink } = {}) {
    if (media) useMedia(media);
    this.keepMedia = keepMedia;
    this.stage = new Stage(host, {
      on: {
        click: (id) => this.rt?.click(id),
        itemClick: (id, index) => this.rt?.itemClick(id, index),
        // a finished recording arrives as a file: keep it, and pass on its reference
        input: (id, v) => this.rt?.userChange(id, v?.blob instanceof Blob ? { ref: this.keepMedia(v.blob), length: v.length } : v),
        press: (id) => this.rt?.press(id),
        release: (id) => this.rt?.release(id),
        submit: (id) => this.rt?.submit(id),
        key: (name, down) => this.rt?.key(name, down),
        keysReset: () => this.rt?.releaseKeys(),
        media: (id, type) => { if (type === 'ended') this.rt?.mediaEnded(id); else this.rt?.mediaState(id, type === 'play'); },
      },
    });
    // shown under the app when its events use the keyboard, until the app has focus
    this.hint = h('p', { class: 'kb-hint', hidden: true }, 'This app uses the keyboard: click it first, then press keys.');
    // credits for sounds that play without a player (their ▶ and credit aren't on the screen), as the open licences ask
    this.credits = h('p', { class: 'app-credits', hidden: true });
    host.append(this.hint, this.credits);
    this.store = store;
    this.on = { onDraw, onEventRan, onScreen, onStop };
    this.openLink = openLink || ((link) => { try { window.open(link, '_blank', 'noopener'); } catch { /* blocked */ } });
    this.rt = null;
    this.dirty = false;
    this.raf = 0;
  }

  start(project, screenId) {
    this.stop();
    this.stage.clear();
    this.stage.setSize(sizeOf(project));
    const rt = new Runtime(structuredClone(project), {
      store: typeof this.store === 'function' ? this.store() : this.store,
      hooks: {
        onChange: () => { this.dirty = true; },
        onError: () => { this.dirty = true; },
        onEventRan: (id) => this.on.onEventRan?.(id),
        onScreen: (scr) => this.on.onScreen?.(scr, rt.project),
        openLink: (link) => this.openLink(link),
        snapshot: (id) => { const d = this.stage.snapshot(id); return d ? this.keepMedia(d) : null; },
        keepPicture: (dataUrl) => this.keepMedia(dataUrl), // Choose a photo
      },
    });
    this.rt = rt;
    this.#credits(project);
    rt.start(screenId);
    this.draw();
    let last = performance.now();
    const loop = (now = performance.now()) => {
      if (this.rt !== rt) return;
      if (rt.hasTimers) rt.advance(Math.min(now - last, 250)); // capped, so a hidden tab doesn't fire a burst
      last = now;
      if (rt.needsTick) rt.tick();
      if (this.dirty) { this.dirty = false; this.draw(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  #credits(project) {
    const seen = new Set(), lines = [];
    for (const sc of project.screens || []) for (const o of sc.objects || []) {
      if (o.kind !== 'sound') continue;
      for (const i of o.instances || []) {
        if (i.player !== false || seen.has(i.sound)) continue;
        seen.add(i.sound);
        const info = mediaLookups.sound(i.sound);
        if (info?.credit) lines.push(`${info.title}: ${info.credit}`);
      }
    }
    this.credits.textContent = lines.length ? '\u266A ' + lines.join(' \u00B7 ') : '';
    this.credits.hidden = !lines.length;
  }

  focus() { this.stage.el.focus({ preventScroll: true }); }

  stop() {
    for (const m of this.stage.el.querySelectorAll('audio, video')) m.pause();
    this.stage.clear(); // also turns a camera off
    cancelAnimationFrame(this.raf);
    this.rt = null;
    this.stage.setPick(null);
    this.on.onStop?.();
  }

  draw() {
    const rt = this.rt;
    if (!rt) return;
    this.hint.hidden = !usesKeys(rt.events);
    this.stage.sync(rt.allInstances.map((i) => ({ id: i.id, name: i.object, kind: i.kind,
      props: i.kind === 'list' ? { ...i.props, items: rt.globals.get(i.props.source), selected: i.selected || 0 }
        : i.kind === 'table' ? { ...i.props, items: rt.globals.get(i.props.source), fields: tableColumns(rt.project, i.props), selected: i.selected || 0,
          pictureFields: (rt.tables.get(i.props.source) || []).filter((f) => f.type === 'picture').map((f) => f.name) }
          : i.props })));
    this.on.onDraw?.(rt);
  }
}
