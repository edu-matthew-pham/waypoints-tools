# App Builder (prototype)


A small, no-event-cap tool for prototyping simple apps (Years 7-8). Apps are web pages (800×600) by default;
each project can switch to Phone (390×700). The stage scales down to fit the window. Screens, buttons, text and
inputs, driven by an event sheet: *when this happens, do that*. Runs in the browser, no accounts, no server.

**Use it:** https://tools.learningwaypoints.com/app-builder/  (plain ES modules, no build step; Chrome, Edge, Firefox, Safari)

    cd app-builder && npm test      # headless tests of the interpreter (node:test, no dependencies)
    python3 -m http.server 8080     # run locally from the repo root, then open /app-builder/

## Lesson links

Add these to `https://tools.learningwaypoints.com/app-builder/`:

| Link | Opens |
|---|---|
| `?sample=music` / `?sample=music-start` | Y7 Music tracker: finished / design only (no events or variables) |
| `?sample=chores` / `?sample=chores-start` | Y7 Daily chores |
| `?sample=water` / `?sample=water-start` | Y7 Water tracker |
| `?sample=journal` / `?sample=journal-start` | Y7 Values journal |
| `?sample=practice`, `?sample=copies` | Other samples |

Combine with `&level=2` (blocks offered), `&allow=onClicked,addTo,setText` (a lesson's own block list) and `&lock=1`
(hides the level switch and Samples menu). Example: `?sample=water-start&level=2&lock=1`.

Each lesson link keeps its own saved work in the browser, so students carry on where they were; **Start again**
(press twice) reloads the original. Save/Open still work for handing in a file.

## Layout

    src/core/expr.js        safe expression parser/evaluator (no eval) + static checker
    src/core/components.js  component registry (data): Button, Text, Text input; categories, hints, defaults
    src/ui/component-ui.js  icons and how each component is drawn
    src/ui/object-picker.js tile picker for "Add an object"
    src/core/catalog.js     every condition and action: label template, params, one small function
    src/core/project.js     project JSON model and helpers
    src/core/runtime.js     interpreter: triggers, every tick, picking, sub-events, Else, screens
    src/ui/stage.js         draws items as DOM; design mode adds select/drag/resize; pick mode
    src/ui/event-sheet.js   <event-sheet> custom element: edit | readonly, flash(id), pickobject event
    src/state.js            shared state + the few callbacks views use to talk to the shell
    src/history.js          undo/redo as JSON snapshots
    src/run-engine.js       Runner: runs a copy of the project in a Stage, Watch + Problems panels
    src/panels/side.js      project tree (screens > objects > copies) and variables
    src/views/design.js     Design tab: drag-and-drop stage + properties
    src/views/events.js     Events tab: editable sheet beside a live preview; on-screen picker
    src/views/run.js        Run tab: full-size app + read-only sheet that flashes as rows run
    src/app.js              shell: top bar, tabs, save/open, wiring
    src/samples.js          Practice tracker, Daily chores
    tests/                  interpreter and features tests

`core/` has no DOM, so it runs in Node: tests today, checking student projects tomorrow.

## Event model (same ideas as an event sheet)

- Trigger conditions (On start of screen, X is clicked, text changes) run the moment it happens.
- Everything else (Every tick, Variable..., compare) is re-checked every tick, top to bottom.
- A condition can *pick* copies of an object; actions and sub-events then use only those.
- Sub-events run only if the parent passed. Actions run before sub-events. Else runs if the event above didn't.
- Go to screen happens after the current event finishes. Variables survive; objects on screens reset.

See [`ROADMAP.md`](ROADMAP.md) for planned components, input events (keyboard, pointer), timers, lists and layout.

Expressions: `&` joins text, `+ - * /` for numbers, `Name.property`, helpers like `round()` and `random()`, and
`if(test, value if true, value if false)` with `= ≠ < ≤ > ≥`. At Level 3+ a **Choose between two values** button in the
guided dialog writes the `if()` from fill-in blanks.

## Adding a feature

Add an entry to `CONDITIONS` or `ACTIONS` in `catalog.js` (label with `{param}` placeholders, params, run/test).
The editor menu, controls, validation and the interpreter pick it up with no UI code.

## Guided editing and levels

- **Guided** (default): events read as clean sentence cards. Click a condition or action to change it in a dialog (fill-in-the-blanks, name chips, validation, pick-on-screen). Click an event to reveal `+ Condition`, `+ Action` and the `...` menu. **Quick edit** keeps the inline controls for confident users.
- **Levels** (`core/features.js`): 1 Starter, 2 Conditions, 3 Copies, 4 Everything. They only change what the add menus and panels *offer*; nothing already built is hidden or removed. Projects without `features` show everything.
- **Lesson allow-lists**: `project.features.allow = { cond: [...], act: [...] }`, or link students in with `?level=1&allow=onClicked,addTo,setText&lock=1`. `lock=1` hides the level switch.
- New catalog entries must be placed in a level in `features.js` (a test fails if one is forgotten).

## Not done yet (ideas, in rough priority)

- Image object + small asset panel (upload, built-in icons)
- Layout: stacks / flex, containers, Tabs component (keeps state; screens reset), scrolling, repeater bound to a list, gallery
- Sandboxed Custom HTML/CSS/JS widget (iframe + postMessage); later a Run script action and a read-only Show as JavaScript view
- Arrays/lists, remember-between-visits variables, screen stack with Back, standard widgets (toggle, slider, progress)
- Rename objects (and update references); expression autocomplete; condition invert
- `eventsheet` task modes for lesson pages: trace a tick, Parsons ordering, find the bug
- Headless project checks ("click 3 times; count should be 3") for the Waypoints pages
- Touch/tablet testing, accessibility pass

## Licence

**Free for education. Commercial use by permission only.**

- Code: [PolyForm Noncommercial 1.0.0](../LICENSE). Any non-commercial use is allowed, and the licence names educational
  institutions explicitly. Selling it, bundling it into a paid product or running it as a paid service needs written permission.
- Lessons and other written content (when published alongside this tool): CC BY-NC-SA 4.0
  (https://creativecommons.org/licenses/by-nc-sa/4.0/). 
- This is a plain-language summary; the licence text is what applies.
