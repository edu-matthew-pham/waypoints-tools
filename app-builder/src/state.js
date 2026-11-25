// Shared app state and the few functions views call back into the shell with.
// Views import this instead of importing app.js, so there are no import cycles.
// rf = resolved features (what the add menus offer); locked = URL says the level can't be changed;
// guided = beginner-friendly event editing (dialogs) vs quick inline editing.
// sheet = which event sheet the Events tab shows: 'screen' (the open screen's), 'all' (the All screens sheet) or
//         'fn:<id>' (a function's body, core/functions.js).
// storeKey = where this copy of App Builder keeps its work; "Remember between visits" values go under it too.
export const S = { project: null, screenId: null, selId: null, tab: 'design', rf: null, locked: false, guided: true, sheet: 'screen', storeKey: 'appbuilder.prototype.v1' };
// the All screens sheet is offered from Level 3, and always once a project has shared events
export const showAllScreens = () => !!S.project && (!S.rf || S.rf.allScreens || (S.project.allScreens?.events?.length > 0));
// functions are offered at Level 4, and always once a project has some
export const showFunctions = () => !!S.project && (!S.rf || S.rf.functions || (S.project.functions?.length > 0));
export const openFunction = () => (S.sheet.startsWith('fn:') && S.project.functions?.find((f) => 'fn:' + f.id === S.sheet)) || null;
export const screen = () => S.project.screens.find((s) => s.id === S.screenId) || S.project.screens[0];

// Assigned by app.js at boot.
export const hooks = {
  commit: (/* source */) => {}, // record an undo step, autosave, refresh
  refresh: (/* source */) => {},
  select: (/* instanceId */) => {},
  notify: (/* message */) => {},
  setTab: (/* tab */) => {},
};
