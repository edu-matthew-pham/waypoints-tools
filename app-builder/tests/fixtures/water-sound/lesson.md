---
order: 4
unit: track
title: "Goal reached: sound and video"
summary: "Give the water tracker a cheer when the goal is reached, and a video under it. A sound played from an event that's checked every tick starts again every tick; Trigger once while true plays it once, then waits until the goal isn't reached any more."
language: maths
shape: build
hook: "Apps cheer you on: a chime when a timer ends, a sound when you finish a level. The hard part isn't the sound, it's making it play once, at the right moment."
pacing: { keyDelayMs: 40, cursorMs: 500, afterActionMs: 300, postRollMs: 1200 }
voice: { name: af_heart, speed: 1.1 }
app:
  command: node "$REPO_ROOT/tools/serve.mjs" "$REPO_ROOT/dist/_playground-appbuilder" 8766
  url: http://127.0.0.1:8766/index.html
  readySelector: "[data-ab='tab:design']"
  layout: full
---
The water tracker from the last lesson says *Goal reached!* when you get to 8 glasses. Today it also **cheers**, and it shows a short video about where water comes from.

- A **Sound** object holds a sound and has its own play button. **Play Cheer** plays it from the start.
- A **Video** object plays a video from a link, in the browser's own player.
- Turn your sound on, or use headphones.

## Try the finished app

```step
stage: info
insight: "Hearing the cheer play once at 8, and again only after Reset, shows the behaviour to build before building it."
try: { playground: appbuilder, starter: "app.json#try", tab: run, level: 2, height: 680 }
check: { type: reflect, text: "I added 8 glasses and heard the cheer once. I clicked Reset, added 8 again, and heard it again." }
```

Add glasses until you reach 8. The cheer plays **once**. Click **Reset** and do it again: it cheers again.

The video under it is NASA's *The Water Cycle*, one water molecule's journey from the ocean and back. Press play on it whenever you like.

## Build 1: a cheer

```step
stage: run
app: true
query: { code: "@app.json#start", level: 2, id: water-sound-1 }
caption: "A Sound object, and Play"
clip:
  - caption: { text: "+ Add object, Sound. Rename it Cheer.", say: "Add a Sound object, and rename it Cheer." }
  - click: { selector: "[data-ab='add-object']" }
  - click: { selector: "[data-ab='kind:sound']" }
  - click: { selector: ".side [data-ab='object-menu']" }
  - click: { selector: "[data-ab='menu:rename']" }
  - type: { selector: ".side input.rename", text: "Cheer" }
  - press: Enter
  - caption: { text: "Under the bar, as wide as the buttons. Sound: Win jingle.", say: "Put it under the bar, and choose the Win jingle." }
  - type: { selector: "[data-ab='prop:x']", text: "229" }
  - press: Tab
  - type: { selector: "[data-ab='prop:y']", text: "330" }
  - press: Tab
  - type: { selector: "[data-ab='prop:w']", text: "342" }
  - press: Tab
  - click: { selector: "[data-ab='prop:sound']" }
  - press: ArrowUp
  - press: ArrowUp
  - press: ArrowUp
  - press: Enter
  - caption: { text: "A new event: Variable Glasses = Goal, then Play Cheer.", say: "A new event. Variable Glasses equals Goal, then Play Cheer." }
  - click: { selector: "[data-ab='tab:events']" }
  - click: { selector: ".view-events [data-ab='add-event']" }
  - click: { selector: ".view-events .ev.sel [data-ab='add-condition']" }
  - click: { selector: "[data-ab='group:Variables']" }
  - click: { selector: "[data-ab='entry:compareVar']" }
  - type: { selector: "dialog[open] [data-ab='param:value']", text: "Goal" }
  - click: { selector: "dialog[open] [data-ab='done']" }
  - click: { selector: ".view-events .ev.sel [data-ab='add-action']" }
  - click: { selector: "[data-ab='group:object:Cheer']" }
  - click: { selector: "[data-ab='entry:playSound']" }
  - click: { selector: "dialog[open] [data-ab='done']" }
  - expect: { selector: ".view-events event-sheet", contains: "Play" }
  - caption: { text: "Now run it, get to 8 and listen.", say: "Now run it, get to eight, and listen." }
  - wait: 1200
insight: "A Sound object is like any object: it has its own properties, and an action plays it."
try: { playground: appbuilder, starter: "app.json#start", keep: build, level: 2, height: 680 }
check:
  type: code
  text: "A Sound called Cheer, and an event: Variable Glasses = Goal → Play Cheer."
  rules: { contains: ["object Cheer (sound)"], event: [["when Variable Glasses = Goal", "Play Cheer"]] }
```

1. **+ Add object**, **Sound**. Rename it *Cheer*, put it under the bar (x 229, y 330, width 342) and choose the sound **Win jingle**. Click its ▶ to hear it.
2. On the **Events** tab, click **+ Add event**: **Variables**, **Variable** Glasses **=** `Goal`, with the action **Cheer**, **Play Cheer**.
3. Run it, add glasses until you reach 8, and **listen**.

## Why does it sound like that?

```step
stage: investigate
insight: "Connecting what you hear to when the event runs shows that a condition with no trigger is checked every tick, so its actions run every tick while it's true."
check:
  type: question
  q: "At 8 glasses you hear clicks, or nothing, not a cheer. Why?"
  options: ["Its event runs every tick, so Play keeps restarting it", "The Win jingle is too short to hear", "Play only works in a button's event", "The sound waits until the app is stopped"]
  answer: 0
  feedback: [null, "Click ▶ on the Sound object: you can hear the whole jingle.", "Play works in any event.", "Run's sound plays while the app runs."]
  explain: "Variable Glasses = Goal isn't a trigger like 'is clicked'. It's checked every tick, and while it's true its actions run every tick. Play starts the sound from the beginning, so it never gets past the start."
```

Think back to the water tracker lesson: which events run every tick?

## Build 2: once while true

```step
stage: run
insight: "Trigger once while true turns a condition that's checked every tick into a single moment: it runs when the condition becomes true, then waits until it's false again."
try: { playground: appbuilder, starter: "app.json#sol-step-2", keep: build, level: 2, height: 680 }
check:
  type: code
  text: "The cheer event has Trigger once while true, so it plays once when the goal is reached."
  rules: { event: [["when Variable Glasses = Goal", "Trigger once while true", "Play Cheer"]] }
```

1. In the event that plays Cheer, click **+ Condition**: **System**, **Trigger once while true**. Keep it last in the event.
2. Run it and reach 8: one cheer.
3. Click **Reset**, then reach 8 again. Does it cheer again?

*Once while true* means once each time the condition **becomes** true. Reset makes Glasses = Goal false, so the next time you reach 8 it's a new moment.

## Check: Reset and Nib

```step
stage: investigate
insight: "Predicting the cheer after a Reset, and spotting Nib's cheer on every glass, separate when a condition becomes true from when an event runs."
tasks:
  - check:
      type: question
      q: "You reach 8, hear the cheer, then click Add a glass three more times (the cap keeps it at 8). How many more cheers?"
      options: ["None: Glasses = Goal stayed true the whole time", "Three: one for each click", "One: the next click starts it again", "None: Trigger once only works once ever"]
      answer: 0
      feedback: [null, "The cap stops Glasses going past 8. Did Glasses = Goal stop being true?", "Did the condition become false in between?", "It's once while true, so it can happen again, after Reset."]
      explain: "Glasses stays at 8, so Glasses = Goal stays true and Trigger once waits. Only after it's false (Reset) can it cheer again."
  - check:
      type: bug
      code: "working.txt#nib"
      text: "Nib's app cheers on every glass, not just at the goal. Click the line where Nib goes wrong."
      answer: 2
      fault: logic
      misconception: action-in-wrong-event
      explain: "Line 2: Play Cheer is in the Add button's event, so it runs on every click that adds a glass. It belongs in an event about the goal (Glasses = Goal, once while true), or in a sub-event that checks Glasses = Goal after adding."
```

### More clicks at 8

The cap from the water tracker lesson keeps Glasses at 8.

### Nib's cheer

Nib skipped Trigger once and put the sound somewhere else.

## Build 3: a video

```step
stage: run
insight: "A Video object plays a file from a link, in the browser's own player, with its source shown; nothing is uploaded."
try: { playground: appbuilder, starter: "app.json#sol-step-4", keep: build, level: 2, height: 680 }
check:
  type: code
  text: "A Video under the cheer plays NASA's The Water Cycle."
  rules: { contains: ["(video)", "water_cycle"] }
```

1. **+ Add object**, **Video**. Rename it *WaterVideo* and put it under the cheer: x 229, y 392, width 342, height 192.
2. In **Properties**, paste this into **Video link**:
   `https://svs.gsfc.nasa.gov/vis/a010000/a010500/a010501/water_cycle_appletv_1280x720.webmhd.webm`
3. Run it and press play on the video.

The video is *The Water Cycle* by NASA/Goddard Space Flight Center: public domain, so anyone may use it, but it's polite to say where it came from. App Builder shows its source under the player. Wikimedia Commons has many more videos you can link the same way.

## Make it yours: Reset stops the cheer

```step
stage: modify
insight: "Stop is the other half of Play: an action on the sound from any event, here the Reset button's."
try: { playground: appbuilder, starter: "app.json#done", keep: build, level: 2, height: 680 }
check:
  type: code
  text: "Clicking Reset also stops the cheer."
  rules: { event: [["when ResetButton is clicked", "Stop Cheer"]] }
```

If someone clicks Reset while the cheer is playing, stop it: in **ResetButton is clicked**, add **Cheer**, **Stop Cheer**.

More ideas: a **Pop** sound on every glass (that one *should* play every click), your own sound with **+ Upload sound**, or hide the cheer's player: untick **Show a player** in Cheer's properties. It still plays from events and takes no space; its credit shows under the app.
