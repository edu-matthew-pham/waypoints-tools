# App Builder: what we plan to add, and how

Guiding rules: every addition is **one registry entry** (component or catalog item) plus a test; each is placed in a **level** so
beginners don't see it until needed; and anything that can run without a screen (the interpreter) stays testable in Node.

## 1. Components (the "Add an object" picker)

The picker groups tiles by category and only shows what the current level / lesson allows. Contract (see `core/components.js`):
`id, label, hint, category, base, props` in core; `ICONS[id]`, `RENDER[id].make/write` in `ui/component-ui.js`; a level in
`features.js`; conditions/actions in `catalog.js`. `tests/components.test.js` fails if a step is missed.

| Category | Components | Level | Notes |
|---|---|---|---|
| Basics | Button, Text, Text input *(done)* | 1-2 | |
| Choices | Toggle *(done)*, Slider *(done)*, Dropdown, Checkbox | 2 | Toggle has `Name.on` and an "is on / off" condition (pair with Else); Slider has `Name.value`, `min`, `max`. Both have a "changes" trigger. |
| Media | Image (+ asset panel, built-in icons), Emoji/icon | 2 | Assets stored as data URLs in the project file (size cap and warning). |
| Data | List (shows items), Repeater (one row per list item), Gallery | 3-4 | Needs the list value type and "for each" first (section 4). |
| Layout | Stack (row/column), Container, Tabs, Scroll area | 3-4 | Needs children inside containers (section 5). |
| Advanced | Custom HTML widget (sandboxed iframe) | 4 | Escape hatch; talks to events through postMessage. |

## 2. Input events

All new triggers are catalog entries with a `trigger: true` flag, so the existing rules apply (first condition, top level only).
Pointer Events cover mouse, pen and touch with one code path, so nothing depends on a mouse.

| Event | Kind | Level | How |
|---|---|---|---|
| Object **pressed** / **released** *(done)* | trigger | 2 | `pointerdown` / `pointerup` on the object; release goes to the pressed object even if the pointer slid off |
| Object **double-clicked**, **long-pressed** | trigger | 3 | Timer on pointerdown (long press 500 ms) |
| Pointer **enters / leaves** object (hover) | trigger | 3 | Desktop only; hidden on touch devices |
| **Key pressed** `{key}` / **key released** *(done)* | trigger | 2 | Keys offered in a picker: Enter, Escape, Space, arrows, letters, digits. `Enter` in a text input is the beginner case ("submit"). |
| **Key is held down** `{key}` *(done)* | condition, every tick | 3 | Held keys; same mechanism as every-tick events |
| Text input **changed** / **submitted** *(done)* | trigger | 2 | Enter in a text box fires "Enter is pressed in ..." |
| Object **is visible / is hovered / has focus** | condition | 3 | |
| **Swipe** left/right/up/down on screen or object | trigger | 4 | Pointer delta threshold |

Runtime *(done except hover)*: `rt.key(name, down)`, `rt.press/release(id)`, `rt.submit(id)`, `rt.userChange(id, value)` next to `rt.click`. Keys only reach the
app when it has focus: the Run tab focuses it automatically, and the Events preview shows "click it first" when the screen uses keys. Keys typed into a text box are ignored by key events (the box has its own). Headless tests feed these
calls directly, just like clicks today.

## 3. Time and chance

| Item | Kind | Level |
|---|---|---|
| **Every N seconds** *(done)* | trigger | 2 |
| **After N seconds** (once) *(done)* | trigger | 2 |
| **Trigger once while true** *(done)* | condition | 2 | Construct behaviour: once per event (not per copy), re-arms when false; kept last; warns in ⚡ events |
| **Wait N seconds, then...** | action | 3 |
| Random number / pick from list | expression function (`random` exists) | 2 |
| `if(test, yes, no)` and the **Choose between two values** builder *(done)* | expression function + dialog | 3 |
| Current time / date | expression functions | 3 |

Time is app time fed by the renderer (`rt.advance(ms)`), not the wall clock, so tests are exact. Seconds can be a variable
(re-read after each firing), must be at least 0.1, timers reset on a screen change, and a hidden tab never causes a burst.

## 4. Data

- **Lists** as a value type: `add / remove / clear / count / item N / for each`. "For each" works like picking: it narrows to one
  item, runs the actions, and sub-events inherit it. The expression language gets `list.count` and `list[1]` (no loops, no eval).
- **Remember between visits** (localStorage-backed variables; fails safe when storage is blocked).
- **Screen stack**: "Go back" action alongside "Go to screen".
- **Rename** objects, variables and screens with references updated in events and expressions (rewrite identifiers via the tokenizer).

## 5. Layout

Objects get an optional `children` array and a layout mode on containers (stack / free). Stage coordinates stay for free layout;
stack layout ignores x/y and uses gap, padding, alignment. Tabs hold named panels and **keep state** when switching (screens reset;
tabs don't). Scroll areas clip and scroll. Design mode shows a tree in the sidebar for nesting.

## 6. Sound, notifications, output (later)

Play sound (built-in set), vibrate, show a toast message, copy text. Each is a small action; sound needs a user gesture first.

## 7. Teaching and checking

- Lesson mode tasks: *trace a tick*, *put the events in order* (Parsons), *find the bug*.
- Headless project checks for lesson pages: "click 3 times, then `minutes` should be 30".
- Events -> JavaScript read-only view, then a *Run script* action (Level 4), so students can graduate to code.
- Teacher view: share a project link with `?level=` / `?allow=` / `?lock=1` (done); later, a starter-project link.

## Suggested order

1. Toggle, Slider. *(done, with `if()` + builder)*  2. Key pressed + Enter-submits + pressed/released. *(done)*  3. Timers. *(done, except Wait)*
4. Image + asset panel.  5. Lists + for-each + Repeater.  6. Rename.  7. Layout/Tabs.  8. Custom HTML widget and JS view.
