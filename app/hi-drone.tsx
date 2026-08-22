"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CapturedAudio,
  HiDroneEngine,
  PercussionName,
} from "./audio-engine";

type Tab = "sound" | "behaviour" | "patch";
type Globals = {
  tension: number;
  movement: number;
  density: number;
  space: number;
  damage: number;
};
type Cell = {
  active: boolean;
  time: number;
  chance: number;
  repeats: number;
  target: string;
  next: number;
};
type PercussionSettings = Record<PercussionName, { decay: number; shape: number; hold: boolean }>;
type PatchCable = { id: string; source: string; target: string; amount: number };
type Scene = {
  globals: Globals;
  pitches: number[];
  percussion: PercussionSettings;
  cells: Cell[];
  patches: PatchCable[];
};

const VOICE_NAMES = ["Moss", "Glass", "Ash", "Choir", "Wire", "Fog", "Root", "Moon"];
const VOICE_COLORS = ["moss", "amber", "rose", "ice", "violet", "rust", "lime", "blue"];
const PERCUSSION: { id: PercussionName; label: string; detail: string }[] = [
  { id: "body", label: "Body", detail: "low resonator" },
  { id: "bass", label: "Bass", detail: "driven membrane" },
  { id: "dust", label: "Dust", detail: "filtered noise" },
  { id: "metal", label: "Metal", detail: "inharmonic bank" },
];
const SOURCE_OPTIONS = [
  ["lfo-a", "Breath A"],
  ["lfo-b", "Breath B"],
  ["random", "Uncertainty"],
  ["chaos", "Feedback weather"],
];
const TARGET_OPTIONS = [
  ["pair-0", "Voice pair 1–2"],
  ["pair-1", "Voice pair 3–4"],
  ["pair-2", "Voice pair 5–6"],
  ["pair-3", "Voice pair 7–8"],
  ["filter", "Master filter"],
  ["delay", "Delay time"],
  ["drive", "Damage"],
];

const DEFAULT_GLOBALS: Globals = {
  tension: 34,
  movement: 38,
  density: 45,
  space: 46,
  damage: 22,
};
const DEFAULT_PITCHES = [36, 41, 43, 48, 50, 55, 57, 60];
const DEFAULT_PERCUSSION: PercussionSettings = {
  body: { decay: 48, shape: 34, hold: false },
  bass: { decay: 58, shape: 52, hold: false },
  dust: { decay: 38, shape: 62, hold: false },
  metal: { decay: 72, shape: 44, hold: false },
};
const DEFAULT_CELLS: Cell[] = [
  { active: true, time: 1.3, chance: 94, repeats: 1, target: "body", next: 1 },
  { active: true, time: 2.1, chance: 72, repeats: 1, target: "voice-2", next: 2 },
  { active: true, time: 3.4, chance: 64, repeats: 2, target: "dust", next: 3 },
  { active: true, time: 5.5, chance: 76, repeats: 1, target: "voice-5", next: 4 },
  { active: false, time: 0.7, chance: 46, repeats: 3, target: "metal", next: 5 },
  { active: true, time: 8.9, chance: 58, repeats: 1, target: "bass", next: 6 },
  { active: false, time: 13, chance: 82, repeats: 1, target: "voice-7", next: 7 },
  { active: true, time: 21, chance: 40, repeats: 1, target: "metal", next: 0 },
];
const DEFAULT_PATCHES: PatchCable[] = [
  { id: "initial-a", source: "lfo-a", target: "pair-0", amount: 34 },
  { id: "initial-b", source: "random", target: "filter", amount: 18 },
];

const cloneScene = (scene: Scene): Scene => JSON.parse(JSON.stringify(scene)) as Scene;

const formatTime = (seconds: number) => {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function HiDrone() {
  const engineRef = useRef<HiDroneEngine | null>(null);
  if (!engineRef.current) engineRef.current = new HiDroneEngine();

  const [tab, setTab] = useState<Tab>("sound");
  const [powered, setPowered] = useState(false);
  const [globals, setGlobals] = useState(DEFAULT_GLOBALS);
  const [voicePitches, setVoicePitches] = useState(DEFAULT_PITCHES);
  const [latchedVoices, setLatchedVoices] = useState<boolean[]>(Array(8).fill(false));
  const [percussion, setPercussion] = useState<PercussionSettings>(DEFAULT_PERCUSSION);
  const [cells, setCells] = useState<Cell[]>(DEFAULT_CELLS);
  const [patches, setPatches] = useState<PatchCable[]>(DEFAULT_PATCHES);
  const [selectedSource, setSelectedSource] = useState("lfo-a");
  const [selectedTarget, setSelectedTarget] = useState("pair-0");
  const [firingCell, setFiringCell] = useState<number | null>(null);
  const [pulseTarget, setPulseTarget] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [capture, setCapture] = useState<CapturedAudio | null>(null);
  const [exporting, setExporting] = useState<"mp3" | null>(null);
  const [scenes, setScenes] = useState<(Scene | null)[]>([null, null, null, null]);
  const [message, setMessage] = useState("Touch POWER, then play a surface.");
  const [loaded, setLoaded] = useState(false);

  const globalsRef = useRef(globals);
  const pitchesRef = useRef(voicePitches);
  const percussionRef = useRef(percussion);
  const cellsRef = useRef(cells);
  const patchesRef = useRef(patches);
  const recordingRef = useRef(recording);
  const nextFireRef = useRef<number[]>(Array(8).fill(0));
  const randomValueRef = useRef(0);
  const randomChangedRef = useRef(0);

  useEffect(() => { globalsRef.current = globals; }, [globals]);
  useEffect(() => { pitchesRef.current = voicePitches; }, [voicePitches]);
  useEffect(() => { percussionRef.current = percussion; }, [percussion]);
  useEffect(() => { cellsRef.current = cells; }, [cells]);
  useEffect(() => { patchesRef.current = patches; }, [patches]);
  useEffect(() => { recordingRef.current = recording; }, [recording]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("hi-drone-project-v1");
      if (stored) {
        const project = JSON.parse(stored) as Partial<{
          globals: Globals;
          pitches: number[];
          percussion: PercussionSettings;
          cells: Cell[];
          patches: PatchCable[];
          scenes: (Scene | null)[];
        }>;
        if (project.globals) setGlobals(project.globals);
        if (project.pitches?.length === 8) setVoicePitches(project.pitches);
        if (project.percussion) setPercussion(project.percussion);
        if (project.cells?.length === 8) setCells(project.cells);
        if (project.patches) setPatches(project.patches);
        if (project.scenes?.length === 4) setScenes(project.scenes);
        setMessage("Local patch restored.");
      }
    } catch {
      setMessage("Started with a clean patch.");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem("hi-drone-project-v1", JSON.stringify({
      globals,
      pitches: voicePitches,
      percussion,
      cells,
      patches,
      scenes,
    }));
  }, [loaded, globals, voicePitches, percussion, cells, patches, scenes]);

  useEffect(() => {
    engineRef.current?.setGlobals({
      tension: globals.tension / 100,
      movement: globals.movement / 100,
      density: globals.density / 100,
      space: globals.space / 100,
      damage: globals.damage / 100,
    });
  }, [globals]);

  const recordGesture = useCallback(() => {
    if (recordingRef.current) setEventCount((count) => count + 1);
  }, []);

  const ensurePower = useCallback(async () => {
    const engine = engineRef.current!;
    await engine.start();
    await engine.resume();
    if (!powered) {
      setPowered(true);
      setMessage("Engine alive. Everything you hear is generated here.");
    }
  }, [powered]);

  const triggerTarget = useCallback((target: string, velocity = 0.76) => {
    const engine = engineRef.current!;
    setPulseTarget(target);
    window.setTimeout(() => setPulseTarget((current) => current === target ? null : current), 180);
    if (target.startsWith("voice-")) {
      const index = Number(target.slice(6));
      engine.pluckVoice(index, pitchesRef.current[index], velocity);
    } else {
      const percussionName = target as PercussionName;
      const settings = percussionRef.current[percussionName];
      engine.hitPercussion(percussionName, velocity, settings.decay / 100);
    }
    recordGesture();
  }, [recordGesture]);

  useEffect(() => {
    if (!powered) return;
    const now = performance.now();
    nextFireRef.current = cells.map((cell, index) => now + cell.time * 1000 * (0.35 + index * 0.08));

    const interval = window.setInterval(() => {
      const time = performance.now();
      const currentCells = cellsRef.current;
      const currentGlobals = globalsRef.current;

      currentCells.forEach((cell, index) => {
        if (!cell.active || time < nextFireRef.current[index]) return;
        const jitter = 1 + (Math.random() - 0.5) * currentGlobals.movement / 250;
        nextFireRef.current[index] = time + Math.max(80, cell.time * 1000 * jitter);
        if (Math.random() * 100 > cell.chance) return;
        setFiringCell(index);
        window.setTimeout(() => setFiringCell((current) => current === index ? null : current), 180);
        for (let repeat = 0; repeat < cell.repeats; repeat += 1) {
          window.setTimeout(
            () => triggerTarget(cell.target, 0.58 + Math.random() * 0.32),
            repeat * Math.max(65, 220 - currentGlobals.tension * 1.45),
          );
        }
        if (cell.next >= 0 && currentCells[cell.next]?.active) {
          nextFireRef.current[cell.next] = Math.min(
            nextFireRef.current[cell.next],
            time + Math.max(70, cell.time * 170),
          );
        }
      });

      const seconds = time / 1000;
      if (time - randomChangedRef.current > 320 + (100 - currentGlobals.movement) * 10) {
        randomValueRef.current = Math.random() * 2 - 1;
        randomChangedRef.current = time;
      }
      patchesRef.current.forEach((patch) => {
        let signal = 0;
        if (patch.source === "lfo-a") signal = Math.sin(seconds * (0.13 + currentGlobals.movement / 180) * Math.PI * 2);
        if (patch.source === "lfo-b") signal = Math.sin(seconds * (0.047 + currentGlobals.tension / 350) * Math.PI * 2 + 1.7);
        if (patch.source === "random") signal = randomValueRef.current;
        if (patch.source === "chaos") signal = Math.sin(seconds * 0.31) * Math.sin(seconds * 0.073 + 2.1);
        engineRef.current?.applyPatch(patch.target, signal * patch.amount / 100);
      });
    }, 45);
    return () => window.clearInterval(interval);
  }, [powered, triggerTarget]);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const interval = window.setInterval(() => setRecordingSeconds((Date.now() - started) / 1000), 250);
    return () => window.clearInterval(interval);
  }, [recording]);

  const togglePower = async () => {
    const engine = engineRef.current!;
    if (powered) {
      await engine.suspend();
      setPowered(false);
      setMessage("Engine sleeping. Your patch is still here.");
    } else {
      await ensurePower();
    }
  };

  const tapVoice = async (index: number) => {
    await ensurePower();
    engineRef.current!.pluckVoice(index, voicePitches[index], 0.8);
    recordGesture();
  };

  const toggleVoiceLatch = async (index: number) => {
    await ensurePower();
    setLatchedVoices((current) => {
      const next = [...current];
      next[index] = !next[index];
      if (next[index]) engineRef.current!.startVoice(index, voicePitches[index]);
      else engineRef.current!.stopVoice(index);
      return next;
    });
    recordGesture();
  };

  const updateVoicePitch = (index: number, pitch: number) => {
    setVoicePitches((current) => current.map((value, position) => position === index ? pitch : value));
    engineRef.current!.updateVoice(index, pitch);
    recordGesture();
  };

  const hitPercussion = async (name: PercussionName) => {
    await ensurePower();
    triggerTarget(name, 0.84);
  };

  const togglePercussionHold = async (name: PercussionName) => {
    await ensurePower();
    const enabled = !percussion[name].hold;
    setPercussion((current) => ({ ...current, [name]: { ...current[name], hold: enabled } }));
    engineRef.current!.holdPercussion(name, enabled);
    recordGesture();
  };

  const updateCell = (index: number, patch: Partial<Cell>) => {
    setCells((current) => current.map((cell, position) => position === index ? { ...cell, ...patch } : cell));
    recordGesture();
  };

  const addPatch = () => {
    const existing = patches.find((patch) => patch.source === selectedSource && patch.target === selectedTarget);
    if (existing) {
      setMessage("That influence already exists—raise its amount below.");
      return;
    }
    setPatches((current) => [...current, {
      id: `${Date.now()}-${selectedSource}-${selectedTarget}`,
      source: selectedSource,
      target: selectedTarget,
      amount: 28,
    }]);
    recordGesture();
    setMessage("New influence connected.");
  };

  const currentScene = useCallback((): Scene => ({
    globals: { ...globals },
    pitches: [...voicePitches],
    percussion: JSON.parse(JSON.stringify(percussion)) as PercussionSettings,
    cells: cells.map((cell) => ({ ...cell })),
    patches: patches.map((patch) => ({ ...patch })),
  }), [globals, voicePitches, percussion, cells, patches]);

  const useScene = (index: number) => {
    const stored = scenes[index];
    if (!stored) {
      setScenes((current) => current.map((scene, position) => position === index ? cloneScene(currentScene()) : scene));
      setMessage(`Scene ${String.fromCharCode(65 + index)} stored.`);
      return;
    }
    const scene = cloneScene(stored);
    setGlobals(scene.globals);
    setVoicePitches(scene.pitches);
    setPercussion(scene.percussion);
    setCells(scene.cells);
    setPatches(scene.patches);
    latchedVoices.forEach((active, voiceIndex) => {
      if (active) engineRef.current!.updateVoice(voiceIndex, scene.pitches[voiceIndex]);
    });
    setMessage(`Scene ${String.fromCharCode(65 + index)} recalled.`);
    recordGesture();
  };

  const startCapture = async () => {
    await ensurePower();
    engineRef.current!.beginCapture();
    setCapture(null);
    setRecordingSeconds(0);
    setEventCount(0);
    setRecording(true);
    setMessage("Capturing audio and gestures.");
  };

  const stopCapture = () => {
    const result = engineRef.current!.finishCapture();
    setRecording(false);
    setCapture(result);
    setMessage(result ? `Captured ${formatTime(result.duration)} and ${eventCount} gestures.` : "Nothing was captured.");
  };

  const exportMp3 = async () => {
    if (!capture) return;
    setExporting("mp3");
    try {
      const blob = await engineRef.current!.mp3Blob(capture);
      downloadBlob(blob, `hi-drone-${Date.now()}.mp3`);
      setMessage("MP3 exported locally.");
    } catch {
      setMessage("MP3 encoding failed in this browser. WAV remains available.");
    } finally {
      setExporting(null);
    }
  };

  const targetOptions = useMemo(() => [
    ...VOICE_NAMES.map((name, index) => [`voice-${index}`, `Voice ${index + 1}: ${name}`]),
    ...PERCUSSION.map((voice) => [voice.id, voice.label]),
  ], []);

  return (
    <main className="instrument-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <h1>HI DRONE</h1>
            <p>organismic composition station</p>
          </div>
        </div>
        <div className="top-actions">
          <div className={`engine-state ${powered ? "is-live" : ""}`}>
            <span aria-hidden="true" />{powered ? "engine alive" : "engine asleep"}
          </div>
          <button className={`power-button ${powered ? "is-live" : ""}`} onClick={togglePower} type="button">
            <span aria-hidden="true">◉</span> {powered ? "SLEEP" : "POWER"}
          </button>
        </div>
      </header>

      <section className="global-rack" aria-label="Global controls">
        {(Object.keys(globals) as (keyof Globals)[]).map((key) => (
          <label className="macro-control" key={key}>
            <span><b>{key}</b><output>{globals[key]}</output></span>
            <input
              type="range"
              min="0"
              max="100"
              value={globals[key]}
              onChange={(event) => {
                setGlobals((current) => ({ ...current, [key]: Number(event.target.value) }));
                recordGesture();
              }}
            />
          </label>
        ))}
        <div className="scene-bank" aria-label="Scenes">
          <span>SCENES</span>
          <div>
            {scenes.map((scene, index) => (
              <button
                type="button"
                className={scene ? "has-scene" : ""}
                key={index}
                onClick={() => useScene(index)}
                title={scene ? "Recall stored scene" : "Store current state"}
              >
                {String.fromCharCode(65 + index)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <nav className="mode-tabs" aria-label="Instrument surfaces">
        {(["sound", "behaviour", "patch"] as Tab[]).map((mode) => (
          <button
            type="button"
            key={mode}
            className={tab === mode ? "is-active" : ""}
            onClick={() => setTab(mode)}
          >
            <span>{mode === "sound" ? "01" : mode === "behaviour" ? "02" : "03"}</span>
            {mode}
          </button>
        ))}
      </nav>

      <section className="working-surface">
        {tab === "sound" && (
          <div className="sound-surface">
            <div className="surface-heading">
              <div><span>DRONE FIELD</span><h2>Eight interacting voices</h2></div>
              <p>Tap for a phrase. Latch to let a voice live.</p>
            </div>
            <div className="voice-grid">
              {VOICE_NAMES.map((name, index) => (
                <article className={`voice-module ${latchedVoices[index] ? "is-latched" : ""} tone-${VOICE_COLORS[index]}`} key={name}>
                  <div className="module-index">{String(index + 1).padStart(2, "0")}</div>
                  <button
                    type="button"
                    className={`voice-pad ${pulseTarget === `voice-${index}` ? "is-pulsing" : ""}`}
                    onClick={() => tapVoice(index)}
                  >
                    <span className="voice-core" aria-hidden="true" />
                    <strong>{name}</strong>
                    <small>{Math.round(440 * Math.pow(2, (voicePitches[index] - 69) / 12))} Hz</small>
                  </button>
                  <label>
                    <span>TUNE <output>{voicePitches[index]}</output></span>
                    <input
                      type="range"
                      min="24"
                      max="76"
                      value={voicePitches[index]}
                      onChange={(event) => updateVoicePitch(index, Number(event.target.value))}
                    />
                  </label>
                  <button type="button" className="latch-button" onClick={() => toggleVoiceLatch(index)}>
                    <span aria-hidden="true" />{latchedVoices[index] ? "LIVING" : "LATCH"}
                  </button>
                </article>
              ))}
            </div>

            <div className="surface-heading percussion-heading">
              <div><span>PULSE FIELD</span><h2>Four percussive bodies</h2></div>
              <p>Every impact can be held open as a drone.</p>
            </div>
            <div className="percussion-grid">
              {PERCUSSION.map((voice) => {
                const settings = percussion[voice.id];
                return (
                  <article className={`percussion-module ${settings.hold ? "is-held" : ""}`} key={voice.id}>
                    <button
                      type="button"
                      className={`percussion-pad ${pulseTarget === voice.id ? "is-pulsing" : ""}`}
                      onClick={() => hitPercussion(voice.id)}
                    >
                      <span aria-hidden="true" />
                      <strong>{voice.label}</strong>
                      <small>{voice.detail}</small>
                    </button>
                    <label>
                      <span>DECAY <output>{settings.decay}</output></span>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        value={settings.decay}
                        onChange={(event) => setPercussion((current) => ({
                          ...current,
                          [voice.id]: { ...current[voice.id], decay: Number(event.target.value) },
                        }))}
                      />
                    </label>
                    <button type="button" className="hold-button" onClick={() => togglePercussionHold(voice.id)}>
                      {settings.hold ? "RELEASE DRONE" : "HOLD AS DRONE"}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {tab === "behaviour" && (
          <div className="behaviour-surface">
            <div className="surface-heading">
              <div><span>INFINITE NOW</span><h2>Eight cells synthesize behaviour</h2></div>
              <p>No grid. Each cell waits, acts, then wakes another.</p>
            </div>
            <div className="cell-network" aria-label="Behaviour cell network">
              <svg aria-hidden="true" viewBox="0 0 1000 520" preserveAspectRatio="none">
                {cells.map((cell, index) => {
                  const columns = 4;
                  const x1 = 125 + (index % columns) * 250;
                  const y1 = index < columns ? 110 : 410;
                  const next = cell.next;
                  const x2 = 125 + (next % columns) * 250;
                  const y2 = next < columns ? 110 : 410;
                  return <path key={index} d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`} />;
                })}
              </svg>
              <div className="cell-grid">
                {cells.map((cell, index) => (
                  <article className={`behaviour-cell ${cell.active ? "is-active" : ""} ${firingCell === index ? "is-firing" : ""}`} key={index}>
                    <div className="cell-head">
                      <button
                        type="button"
                        className="cell-number"
                        onClick={() => updateCell(index, { active: !cell.active })}
                      >
                        {index + 1}
                      </button>
                      <span>{cell.active ? "awake" : "sleeping"}</span>
                    </div>
                    <label>
                      <span>WAIT <output>{cell.time.toFixed(1)}s</output></span>
                      <input type="range" min="0.1" max="30" step="0.1" value={cell.time} onChange={(event) => updateCell(index, { time: Number(event.target.value) })} />
                    </label>
                    <label>
                      <span>CHANCE <output>{cell.chance}%</output></span>
                      <input type="range" min="0" max="100" value={cell.chance} onChange={(event) => updateCell(index, { chance: Number(event.target.value) })} />
                    </label>
                    <div className="cell-selects">
                      <label><span>ACT ON</span>
                        <select value={cell.target} onChange={(event) => updateCell(index, { target: event.target.value })}>
                          {targetOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                        </select>
                      </label>
                      <label><span>WAKE</span>
                        <select value={cell.next} onChange={(event) => updateCell(index, { next: Number(event.target.value) })}>
                          {cells.map((_, targetIndex) => <option value={targetIndex} key={targetIndex}>Cell {targetIndex + 1}</option>)}
                        </select>
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "patch" && (
          <div className="patch-surface">
            <div className="surface-heading">
              <div><span>INFLUENCE MATRIX</span><h2>Let one system disturb another</h2></div>
              <p>Connections are modulation, not decoration.</p>
            </div>
            <div className="patch-builder">
              <fieldset>
                <legend>1 · Choose a source</legend>
                <div className="choice-grid">
                  {SOURCE_OPTIONS.map(([value, label]) => (
                    <button type="button" key={value} className={selectedSource === value ? "is-selected" : ""} onClick={() => setSelectedSource(value)}>
                      <span className="source-glyph" aria-hidden="true">∿</span>{label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="patch-arrow" aria-hidden="true">→</div>
              <fieldset>
                <legend>2 · Choose a destination</legend>
                <div className="choice-grid target-grid">
                  {TARGET_OPTIONS.map(([value, label]) => (
                    <button type="button" key={value} className={selectedTarget === value ? "is-selected" : ""} onClick={() => setSelectedTarget(value)}>
                      <span className="target-glyph" aria-hidden="true">◎</span>{label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <button type="button" className="connect-button" onClick={addPatch}>CONNECT INFLUENCE</button>
            </div>

            <div className="cable-list">
              <div className="cable-list-head"><span>LIVE CONNECTIONS</span><b>{patches.length}</b></div>
              {patches.length === 0 && <p className="empty-cables">No influence cables. The machine remains stable.</p>}
              {patches.map((patch) => {
                const source = SOURCE_OPTIONS.find(([value]) => value === patch.source)?.[1] ?? patch.source;
                const target = TARGET_OPTIONS.find(([value]) => value === patch.target)?.[1] ?? patch.target;
                return (
                  <div className="cable-row" key={patch.id}>
                    <span className="cable-source"><i aria-hidden="true" />{source}</span>
                    <span className="cable-line" aria-hidden="true" />
                    <span className="cable-target">{target}<i aria-hidden="true" /></span>
                    <label>
                      <span>AMOUNT <output>{patch.amount}</output></span>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={patch.amount}
                        onChange={(event) => setPatches((current) => current.map((item) => item.id === patch.id ? { ...item, amount: Number(event.target.value) } : item))}
                      />
                    </label>
                    <button type="button" className="remove-cable" onClick={() => setPatches((current) => current.filter((item) => item.id !== patch.id))}>REMOVE</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <footer className={`capture-rack ${recording ? "is-recording" : ""}`}>
        <div className="capture-status">
          <div className="capture-light" aria-hidden="true" />
          <div>
            <span>{recording ? "CAPTURING PERFORMANCE" : capture ? "PERFORMANCE HELD" : "CAPTURE READY"}</span>
            <strong>{recording ? formatTime(recordingSeconds) : capture ? formatTime(capture.duration) : "00:00"}</strong>
          </div>
          <small>{recording ? `${eventCount} gestures` : message}</small>
        </div>
        <div className="capture-actions">
          {!recording ? (
            <button type="button" className="record-button" onClick={startCapture}><span aria-hidden="true" />CAPTURE</button>
          ) : (
            <button type="button" className="stop-button" onClick={stopCapture}>■ STOP</button>
          )}
          <button type="button" disabled={!capture || recording} onClick={() => capture && downloadBlob(engineRef.current!.wavBlob(capture), `hi-drone-${Date.now()}.wav`)}>WAV</button>
          <button type="button" disabled={!capture || recording || exporting === "mp3"} onClick={exportMp3}>{exporting ? "ENCODING…" : "MP3"}</button>
        </div>
      </footer>
    </main>
  );
}
