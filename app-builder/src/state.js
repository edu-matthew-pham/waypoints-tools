// Shared app state and the few functions views call back into the shell with.
// Views import this instead of importing app.js, so there are no import cycles.
// rf = resolved features (what the add menus offer); locked = URL says the level can't be changed;
// guided = beginner-friendly event editing (dialogs) vs quick inline editing.
// storeKey = where this copy of App Builder keeps its work; "Remember between visits" values go under it too.
export const S = { project: null, screenId: null, selId: null, tab: 'design', rf: null, locked: false, guided: true, storeKey: 'appbuilder.prototype.v1' };
export const screen = () => S.project.screens.find((s) => s.id === S.screenId) || S.project.screens[0];

// Assigned by app.js at boot.
export const hooks = {
  commit: (/* source */) => {}, // record an undo step, autosave, refresh
  refresh: (/* source */) => {},
  select: (/* instanceId */) => {},
  notify: (/* message */) => {},
  setTab: (/* tab */) => {},
};
