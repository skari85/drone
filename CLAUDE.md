# Drone Engine — handoff to Claude

## What this is

`hi-drone` is Óskar's self-generating ambient drone/soundscape web app —
Brian Eno "Music for Airports"-style generative music, built entirely in
one client component with the Web Audio API (no audio libraries). It was
originally scaffolded through OpenAI's "sites" tooling and is deployed to
Cloudflare Workers, live at `hi-drone.georgoskar.chatgpt.site`.

Stack: Next.js (app router) served through `vinext` (a Vite-based
Next-compatible framework, still in beta), deployed via `wrangler` to
Cloudflare Workers. `npm run dev` / `npm run build` / `npm run start` all
proxy to `vinext dev` / `vinext build` / `vinext start`.

The entire app lives in two files:
- `app/page.tsx` — everything: UI + the full audio engine.
- `app/globals.css` — all styling (Tailwind v4 base + a lot of custom CSS;
  no Tailwind utility classes are used in the markup, it's all plain
  hand-written classes).

`drone-engine.html` at the repo root is a **stale standalone export** —
much simpler than the current `app/page.tsx` (no sub/air oscillators, no
chorus/drive/noise, no Audio Input, no recording). Don't treat it as a
reference for the current engine; nobody has cleaned it up yet (see TODO).

There is also now a **Tauri desktop build** (`src-tauri/`, `tauri-src/`,
`vite.tauri.config.ts`) for a standalone macOS/Windows/Linux app, aimed at
one-time-payment distribution (Lemon Squeezy, not yet wired up). See
"Tauri desktop app" below before touching any of that.

## Tauri desktop app

`tauri-src/main.tsx` mounts the exact same `app/page.tsx` component used by
the web version into a plain static Vite bundle — no vinext/Next SSR
involved, since the engine is 100% client-side already. `vite.tauri.config.ts`
builds that to `dist-tauri/` (gitignored), which `src-tauri/tauri.conf.json`
points Tauri's webview at. **Don't fork the audio engine for desktop** — if
it needs to diverge from the web version, that's a discussion, not a given.

`src-tauri/Info.plist` adds `NSMicrophoneUsageDescription` so the mic
recording feature's permission prompt actually shows on macOS instead of
silently failing.

Build with `npm run tauri:build` (produces a `.app` and a `.dmg` under
`~/.cargo-target/hi-drone/release/bundle/`) or `npm run tauri:dev` for a
live dev window. **Do not run plain `tauri build`/`cargo tauri build`** —
use the npm scripts, which set `CARGO_TARGET_DIR` to a path outside the
repo. Reason: this repo lives on `/Volumes/lacie`, an exFAT external drive
(confirmed via `mount`), and exFAT can't hold macOS resource forks, so the
cross-OS bridge this project has been developed through leaves a `._*`
AppleDouble shadow file next to almost everything. Cargo's build script
tried to read one of those as if it were the real file (`stream did not
contain valid UTF-8`) and hard-failed — moving `target/` off the exFAT
volume fixed the build-output half of that, but source-tree shadow files
(e.g. `src-tauri/capabilities/._default.json`) can still trip up Tauri's
own build.rs since it reads straight from the repo. If a build fails with
that exact "stream did not contain valid UTF-8" error again, the fix is:
```
find . -path ./.git -prune -o -name "._*" -type f -print0 | xargs -0 rm -f
```
run from the repo root, then rebuild. This is a standing hazard of working
on this volume, not a one-time fluke — expect to hit it again.

The built app is currently **unsigned and not notarized** — fine for
testing on this Mac, but a fresh Gatekeeper-protected Mac will refuse to
open it normally (right-click → Open works around it once). Before selling
this via Lemon Squeezy, it needs an Apple Developer Program enrollment plus
codesigning + notarization, or paying customers will hit a scary "Apple
cannot check it for malicious software" wall on first launch.

## Audio architecture (app/page.tsx)

Everything routes through one graph built once in `ensureAudio()`:

- **Drone voices** — the generative core. A scheduler (`generateNote` /
  `scheduleNext`) picks notes from a selected scale at prime-number-ratio
  intervals (Eno's "incommensurable timing" trick — loops never sync back
  up). Each voice is: N detuned oscillators + a sub-octave sine + a
  quiet 2nd/3rd-harmonic "air" partial → lowpass filter → gain (long
  exponential attack/release) → stereo panner → dry/reverb/delay sends.
  Filter cutoff, pitch, volume, and pan each get their own slow LFO
  (or, in "random" modulation mode, a `setInterval`-driven random walk).
- **Master bus** — `droneDry` + `droneReverb` (a procedurally-generated
  convolution impulse, no audio files) + `droneDelay` (with feedback and
  its own lowpass) sum into `droneBus` → a soft `WaveShaper` "drive" →
  chorus (a modulated short delay) → `droneMaster` → `master` → a fixed
  highpass/lowpass "tone" pair → compressor → analyser (drives the bar
  visualizer) → destination.
- **Noise bed** — a looping brown/pink/white noise buffer, filtered, fed
  into the same dry/reverb/delay sends, gain-gated by "Noise amount" and
  only audible while `running`.

## Features added in the last Cowork session

Óskar first asked for a mic-based "record voice mode." He then supplied
`droneengine2.html` (his "v3" reference build) as **the actual spec to
build from**, so the mic-recording idea was dropped in favor of what that
file really does. What's in the codebase now, on top of the engine above:

1. **Audio Input** (`sampleGain`/`sampleFilter` in the graph) — drop or
   browse any audio file (WAV/MP3/OGG/FLAC/M4A, including a voice memo)
   and it's decoded to an `AudioBuffer`, then played back either:
   - **Granular** — overlapping grains scheduled continuously, with
     position drift within the buffer, per-grain pitch jitter, and a
     random per-grain lowpass — matches the existing prime/randomness
     aesthetic rather than a strict loop.
   - **Loop** — a plain looping `AudioBufferSourceNode` with adjustable
     playback rate and detune.
   A "Through FX Chain" toggle routes the sample into the same
   dry/reverb/delay sends the drone voices use, or straight to `master`
   (dry, bypassing the room).
2. **Record & Export** — taps `master`'s output via a `ScriptProcessorNode`
   (deprecated API, but simplest and universally supported; nothing newer
   is needed for this), captures stereo Float32 chunks, and on stop
   encodes them to MP3 with `lamejs` (dynamically imported, so it never
   loads until someone actually exports) and triggers a browser download.
   **Bug fixed vs. the reference**: the reference `droneengine2.html`
   never wrote to the processor's `outputBuffer`, so recording would have
   gone silent — this version passes the signal straight through.
3. **Pulse** — a small nod to `timpaul/doom-loop`'s step sequencer (which
   uses integer step-length *ratios* instead of a fixed metronome). A
   single persistent sub-oscillator (`pulseOsc` → `pulseFilter` →
   `pulseGain`) gets short percussive gain envelopes scheduled on
   ratio-timed steps. Three patterns (Steady / Doom / Sparse), off by
   default, plus speed and depth sliders. Deliberately subtle — the brief
   was "a bit of pulse," not a beat.
4. **Wander** — inspired by `pac-dev/AmbientGarden`'s "musical landscape"
   framing. That project's actual engine is a WASM/Teasynth node-graph
   system (via GitHub's API/robots restrictions I could only read its
   README, not its source), so this isn't ported code — it's an original
   Web Audio implementation of the same idea: a single very-slow LFO
   (`wanderLfo`) fanned out to three gain scalers that nudge reverb send,
   overall tone brightness (`toneLow.frequency`), and chorus width
   together, so the room keeps drifting through its own space over
   minutes. Off by default.

## Features added in this session

Óskar asked to also be able to record short sounds/vocals and feed them to
the synth — this **reverses** the earlier "mic idea is dead" call (see old
Constraints note below, now corrected). Implemented as an *additional* input
path into the existing Audio Input engine, not a replacement for file drop:

5. **Mic recording** — a "🎙 Record Voice / Sound" button next to the file
   drop zone (visible whenever no sample is loaded, hidden once one is).
   Uses `navigator.mediaDevices.getUserMedia` + `MediaRecorder` to capture up
   to `MIC_MAX_SECONDS` (60s) of audio, then on stop decodes the resulting
   Blob with the same `context.decodeAudioData` call `handleSampleFile` uses
   for dropped files and drops it straight into `graph.sampleBuffer`. From
   there it's indistinguishable from a file upload — same Granular/Loop
   modes, same Through FX Chain toggle, same grain controls. Mic
   permission/support errors surface inline (`micError`) instead of failing
   silently; a live 60s safety cutoff auto-stops long takes.

## Bug fixed

`app/globals.css` was missing a closing brace after
`.panel-full { grid-column: 1 / -1;`. Since CSS nesting is valid syntax,
every rule after it silently became nested *inside* `.panel-full` (there
was a matching stray extra `}` at the very end of the file to prove it),
so slider/button styling only applied inside the "Scale & Generation"
panel — the Tone/Modulation/Space panels rendered with unstyled
browser-default controls. This was almost certainly why the live site
didn't look like Óskar's reference mockup. Fixed; verify visually (see
TODO) since it was never seen rendered in a real browser this session.

## Verification done so far

- `npx tsc --noEmit -p tsconfig.json` against the **real project
  tsconfig** — clean, zero errors — after `npm install` picked up the new
  `lamejs` dependency (added to `package.json`).
- `npm install` itself succeeded (20 packages added); some `EPERM`
  cleanup warnings appeared removing stale platform-specific optional
  binaries, harmless and specific to this session's cross-OS mounted
  filesystem.
- A live `npm run dev` smoke test was attempted through the same mounted
  bridge and **crashed** on `EPERM: operation not permitted, unlink
  .../node_modules/.vite/deps/.__metadata-rsc.json` — this is that
  session's sandboxed VM refusing to delete files on the mount (a known,
  documented limitation of that bridge), not a real bug. It should not
  happen running `npm run dev` directly on Óskar's Mac. If it ever does,
  `rm -rf node_modules/.vite` clears Vite's dependency-optimizer cache.
- **This session**: ran `npm run dev` for real (normal terminal, not a
  sandboxed bridge) — binds to **port 3000** (not 4001). Loaded it in an
  actual browser and confirmed the CSS fix: Tone/Modulation/Space/Pulse &
  Wander panels all render styled sliders/buttons matching Scale &
  Generation, not browser defaults. Clicked the new mic-record button — the
  browser preview tool used for this check sandboxes/blocks mic access
  entirely, which correctly surfaced the `micError` message ("Couldn't
  access the microphone…") instead of hanging or throwing, confirming the
  error path works. `npx tsc --noEmit` still clean after the mic-recording
  addition.
- **Still not done**: nobody has heard actual sound out of this build yet —
  the sandboxed browser tool has no audio output and no real mic, so mic
  recording, granular/loop playback, Through FX audibility, Pulse/Wander
  subtlety, and the exported MP3's audio content all still need a real pass
  on Óskar's Mac.

## TODO

1. ~~Run `npm run dev` for real and confirm the port.~~ Done — port 3000.
2. ~~Check the CSS fix in a real browser.~~ Done — all panels styled.
3. On real hardware: click "🎙 Record Voice / Sound", grant mic access,
   record a few seconds of voice, confirm it loads as a sample and plays
   (Granular and Loop modes), same as a dropped file.
4. Drop an audio file onto the Audio Input panel; confirm both Granular
   and Loop modes play, and that the "Through FX Chain" toggle audibly
   changes the sound (wet vs. dry).
5. Click Record, let it run a few seconds, Stop & Export, and confirm the
   downloaded MP3 actually plays and isn't silent or corrupt.
6. Turn on Pulse (try all three patterns) and Wander; confirm both are
   audible but stay subtle at their defaults.
7. Decide what to do with the stale root `drone-engine.html` — update it
   to match `app/page.tsx`, or delete it so it stops diverging. Still
   undecided; nobody has touched it.

## Constraints / what not to change

- Keep this a single-file app (`app/page.tsx` + `app/globals.css`) unless
  Óskar explicitly asks to split it up — that's the existing convention
  and it's intentional (easy to paste into ChatGPT's "sites" tooling,
  easy to diff).
- Mic recording is back, by Óskar's explicit request in a later session —
  the earlier "mic idea is dead" call is reversed. It's additive, not a
  replacement: file-based Audio Input still works exactly as before, mic
  recording is a second way to fill the same `sampleBuffer`. Don't remove
  the file drop zone in favor of mic-only, and don't make mic recording the
  primary/first-run interaction — it's a peer option next to file upload.
- Keep the generative/procedural character (prime-ratio timing, LFOs
  everywhere, nothing perfectly periodic) — Pulse and Wander were
  designed to add texture without turning this into a metronomic
  instrument. If asked for more rhythm/melody features later, keep them
  optional and off-by-default like Pulse/Wander are.
- No gamification, accounts, or analytics — this is Óskar's own
  instrument/installation piece, not a product.
