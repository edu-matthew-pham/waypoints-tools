---
order: 8
unit: media
title: Record your practice
summary: "Give the practice tracker a recorder: record a few seconds of today's practice, play it back, and see how long it was. The recording only exists once the user stops recording, so the app uses it in that event, not before."
language: maths
shape: build
hook: "Musicians record themselves because you hear things on a recording you miss while playing. Voice notes, language apps and podcasts all start with the same three parts: record, keep, play back."
pacing: { keyDelayMs: 40, cursorMs: 500, afterActionMs: 300, postRollMs: 1200 }
voice: { name: af_heart, speed: 1.1 }
app:
  command: node "$REPO_ROOT/tools/serve.mjs" "$REPO_ROOT/dist/_playground-appbuilder" 8768
  url: http://127.0.0.1:8768/index.html
  readySelector: "[data-ab='tab:design']"
  layout: full
---
The practice tracker from the first lesson adds up your minutes. Today it also **records** a short clip of your practice, so you can hear how it went.

- A **Recorder** object records up to 20 seconds with the microphone (● to record, ■ to stop), or lets the user **🎵 Choose** a sound file instead.
- When the user stops (or chooses a file), the event **Mic finishes a recording** runs, and `Mic.sound` is the recording.
- A **Sound** object can play it back: **Set Playback sound to the one named** `Mic.sound`.

Record your instrument, humming or clapping, not other people. Recordings stay in this browser: nothing is sent anywhere. Headphones help in a busy room.

## Try the finished app

```step
stage: info
insight: "Recording, then hearing it play back and seeing its length, shows the three parts to build: record, keep, play."
try: { playground: appbuilder, starter: "app.json#try", tab: run, level: 3, height: 680 }
check: { type: reflect, text: "I recorded a few seconds, played it back, and saw how long it was. I tried the two handles that trim the start and end." }
```

1. Click **●** and allow the microphone when the browser asks. Play, hum or clap for a few seconds, then click **■**.
2. A player appears with your recording, and the app says how long it was. Press **▶**.
3. Drag the two handles under the recorder to trim the start and end, then play it again.

No microphone, or it's blocked here? Click **🎵 Choose** on the recorder and pick a sound file from your computer: the app treats it just like a recording.

## Build 1: a Recorder

```step
stage: run
app: true
query: { code: "@app.json#start", level: 3, id: practice-record-1 }
caption: "A Recorder object"
clip:
  - caption: { text: "+ Add object, Recorder. Rename it Mic.", say: "Add a Recorder, and rename it Mic." }
  - click: { selector: "[data-ab='add-object']" }
  - click: { selector: "[data-ab='kind:recorder']" }
  - click: { selector: ".side [data-ab='object-menu']" }
  - click: { selector: "[data-ab='menu:rename']" }
  - type: { selector: ".side input.rename", text: "Mic" }
  - press: Enter
  - caption: { text: "Under the total: x 229, y 230, width 342.", say: "Put it under the total." }
  - type: { selector: "[data-ab='prop:x']", text: "229" }
  - press: Tab
  - type: { selector: "[data-ab='prop:y']", text: "230" }
  - press: Tab
  - type: { selector: "[data-ab='prop:w']", text: "342" }
  - press: Tab
  - caption: { text: "Allow microphone: off unless you tick it, and the browser asks too.", say: "Allow microphone is off unless you tick it, and the browser asks too." }
  - click: { selector: "[data-ab='allow-mic']" }
  - wait: 1500
insight: "A Recorder is an object like any other, but the microphone stays off unless the app allows it and the user agrees, because a microphone is private."
try: { playground: appbuilder, starter: "app.json#start", keep: build, level: 3, height: 680 }
check:
  type: code
  text: "A Recorder called Mic."
  rules: { contains: ["object Mic (recorder)"] }
```

1. **+ Add object**, **Recorder**. Rename it *Mic* and put it under the total (x 229, y 230, width 342).
2. In its **Properties**, tick **Allow microphone in this app**.
3. Run it, click **●**, record a few seconds, then **■** (or **🎵 Choose** a sound file). The recorder can play it back itself, but nothing else in the app knows about it yet.

## Build 2: play it back

```step
stage: run
app: true
query: { code: "@app.json#sol-step-2", level: 3, id: practice-record-2 }
caption: "Use the recording when it's finished"
clip:
  - caption: { text: "A Sound, Playback, hidden until there's a recording.", say: "A Sound called Playback, hidden until there's a recording." }
  - click: { selector: "[data-ab='add-object']" }
  - click: { selector: "[data-ab='kind:sound']" }
  - click: { selector: ".side [data-ab='object-menu']" }
  - click: { selector: "[data-ab='menu:rename']" }
  - type: { selector: ".side input.rename", text: "Playback" }
  - press: Enter
  - type: { selector: "[data-ab='prop:x']", text: "229" }
  - press: Tab
  - type: { selector: "[data-ab='prop:y']", text: "350" }
  - press: Tab
  - type: { selector: "[data-ab='prop:w']", text: "342" }
  - press: Tab
  - click: { selector: "label:has-text('Visible at start') input" }
  - caption: { text: "A new event: Mic finishes a recording.", say: "A new event. Mic finishes a recording." }
  - click: { selector: "[data-ab='tab:events']" }
  - click: { selector: ".view-events [data-ab='add-event']" }
  - click: { selector: ".view-events .ev.sel [data-ab='add-condition']" }
  - click: { selector: "[data-ab='group:object:Mic']" }
  - click: { selector: "[data-ab='entry:onRecorded']" }
  - click: { selector: "dialog[open] [data-ab='done']" }
  - caption: { text: "Set Playback sound to the one named Mic.sound, then Show Playback.", say: "Set Playback's sound to the one named Mic dot sound, then show it." }
  - click: { selector: ".view-events .ev.sel [data-ab='add-action']" }
  - click: { selector: "[data-ab='group:object:Playback']" }
  - click: { selector: "[data-ab='entry:setSoundNamed']" }
  - type: { selector: "dialog[open] [data-ab='param:name']", text: "Mic.sound" }
  - click: { selector: "dialog[open] [data-ab='done']" }
  - click: { selector: ".view-events .ev.sel [data-ab='add-action']" }
  - click: { selector: "[data-ab='group:object:Playback']" }
  - click: { selector: "[data-ab='entry:setVisible']" }
  - click: { selector: "dialog[open] [data-ab='done']" }
  - expect: { selector: ".view-events event-sheet", contains: "Mic.sound" }
  - wait: 1200
insight: "The recording exists only once the user stops, so the event that runs then is where the app can use Mic.sound."
try: { playground: appbuilder, starter: "app.json#sol-step-2", keep: build, level: 3, height: 680 }
check:
  type: code
  text: "When Mic finishes a recording, Playback gets it (the one named Mic.sound) and is shown."
  rules: { contains: ["object Playback (sound)"], event: [["when Mic finishes a recording", "Set Playback sound to the one named Mic.sound", "Show Playback"]] }
```

1. **+ Add object**, **Sound**. Rename it *Playback*, put it under the recorder (x 229, y 350, width 342) and untick **Visible at start**. A new Sound starts with a built-in tune, so it stays hidden until there's a recording.
2. Add an event: **Mic**, **Mic finishes a recording**, with two actions:
   - **Playback**, **Set Playback sound to the one named** `Mic.sound`
   - **Playback**, **Show Playback**
3. Run it, record, stop, and press ▶ on Playback.

There are two "set sound" actions. *Set sound to* picks one of the app's sounds while you design. *Set sound to the one named* works it out while the app runs, from a recording or a name, just like the two picture actions in *Draw how you showed it*.

## Build 3: how long was it?

```step
stage: run
insight: "Mic.length is worked out from the recording, so like Mic.sound it has a value only once recording has finished."
try: { playground: appbuilder, starter: "app.json#sol-step-3", keep: build, level: 3, height: 680 }
check:
  type: code
  text: "A text LengthText says how many seconds were recorded, when the recording finishes."
  rules: { contains: ["object LengthText (text)"], event: [["when Mic finishes a recording", "Set LengthText text to", "Mic.length"]] }
```

1. Add a **Text** called *LengthText* under Playback (x 229, y 412, width 342), with no text.
2. In **Mic finishes a recording**, add **Set LengthText text to** `"Recorded " & round(Mic.length) & " seconds"`
3. Run it and record twice, once short and once long.

## Check: when does the recording exist?

```step
stage: investigate
insight: "Asking when Mic.sound has a value, and what trimming changes, separates the recording from how it's played."
tasks:
  - check:
      type: bug
      code: "working.txt#nib"
      text: "Nib's Playback never plays the recording, even after recording. Click the line where Nib first goes wrong."
      answer: 2
      fault: logic
      misconception: read-before-made
      explain: "Line 2: On start of screen runs once, when the app starts, before anything has been recorded. Mic.sound is empty then, and nothing sets Playback again. Use the recording in Mic finishes a recording, when it exists."
  - check:
      type: question
      q: "You record 10 seconds, then drag the handles to keep only seconds 2 to 5. What changes?"
      options: ["Only which part of it plays", "It cuts the recording to 3 seconds", "Mic.length changes to 3", "Nothing until a Set action runs"]
      answer: 0
      feedback: [null, "Drag the handles back out. Can you hear the start again?", "Mic.length was set when recording finished. Does trimming re-record?", "Trimming works straight away on the recorder's own player."]
      explain: "Trimming only changes which part plays; the whole recording is kept, so you can drag the handles back out and hear it all again."
```

### Nib's playback

Nib wanted Playback ready from the start.

### Trimming

Try it on the recorder before you answer.

## Make it yours: play it straight away

```step
stage: modify
insight: "Adding Play to the same event makes the app react the moment the recording is ready, with no extra click."
try: { playground: appbuilder, starter: "app.json#done", keep: build, level: 3, height: 680 }
check:
  type: code
  text: "The recording plays by itself as soon as recording finishes."
  rules: { event: [["when Mic finishes a recording", "Play Playback"]] }
```

Play the recording back automatically: add **Playback**, **Play Playback** at the end of **Mic finishes a recording**.

More ideas: add the recording's length to the minutes practised, or a message when a recording is under 3 seconds ("Try a longer one").
