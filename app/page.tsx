'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Surface = 'sound' | 'behaviour' | 'patch';
type CellMode = 'pulse' | 'gate' | 'random' | 'delay' | 'repeater';
type EventKind = 'voice' | 'pulse' | 'gesture' | 'patch' | 'scene';

type Voice = { id: number; name: string; base: number; tone: string; role: string };
type Percussion = { id: number; name: string; role: string; tone: string };
type Cell = { id: number; name: string; mode: CellMode; target: number; kind: 'voice' | 'perc'; interval: number; probability: number; colour: string };
type Patch = { id: number; source: string; target: string; amount: number };
type PerfEvent = { at: number; label: string; kind: EventKind };
type VoiceNode = { carrier: OscillatorNode; shadow: OscillatorNode; mod: GainNode; gain: GainNode; filter: BiquadFilterNode; panner: StereoPannerNode };
type Graph = { context: AudioContext; master: GainNode; compressor: DynamicsCompressorNode; analyser: AnalyserNode; capture: MediaStreamAudioDestinationNode; voices: Map<number, VoiceNode> };

const voices: Voice[] = [
  { id: 0, name: 'Moss', base: 65, tone: 'moss', role: 'low bloom' },
  { id: 1, name: 'Glass', base: 87, tone: 'amber', role: 'bright edge' },
  { id: 2, name: 'Ash', base: 98, tone: 'rose', role: 'dry grain' },
  { id: 3, name: 'Choir', base: 131, tone: 'ice', role: 'soft fifth' },
  { id: 4, name: 'Wire', base: 147, tone: 'violet', role: 'metal string' },
  { id: 5, name: 'Fog', base: 196, tone: 'rust', role: 'slow air' },
  { id: 6, name: 'Root', base: 220, tone: 'lime', role: 'warm centre' },
  { id: 7, name: 'Moon', base: 262, tone: 'blue', role: 'high halo' },
];
const percussion: Percussion[] = [
  { id: 0, name: 'Body', role: 'low resonator', tone: 'body' },
  { id: 1, name: 'Bass', role: 'driven membrane', tone: 'bass' },
  { id: 2, name: 'Dust', role: 'filtered noise', tone: 'dust' },
  { id: 3, name: 'Metal', role: 'inharmonic bank', tone: 'metal' },
];
const initialCells: Cell[] = [
  { id: 0, name: 'Murmur', mode: 'pulse', target: 0, kind: 'voice', interval: 640, probability: 72, colour: 'moss' },
  { id: 1, name: 'Static', mode: 'random', target: 1, kind: 'voice', interval: 960, probability: 42, colour: 'amber' },
  { id: 2, name: 'Throb', mode: 'repeater', target: 0, kind: 'perc', interval: 480, probability: 66, colour: 'rose' },
  { id: 3, name: 'Wake', mode: 'gate', target: 3, kind: 'voice', interval: 1280, probability: 34, colour: 'ice' },
  { id: 4, name: 'Crush', mode: 'delay', target: 2, kind: 'perc', interval: 1760, probability: 58, colour: 'violet' },
  { id: 5, name: 'Drift', mode: 'random', target: 5, kind: 'voice', interval: 2080, probability: 30, colour: 'lime' },
  { id: 6, name: 'Ember', mode: 'pulse', target: 1, kind: 'perc', interval: 800, probability: 46, colour: 'rust' },
  { id: 7, name: 'Orbit', mode: 'repeater', target: 7, kind: 'voice', interval: 1440, probability: 38, colour: 'blue' },
];
const initialPatches: Patch[] = [
  { id: 0, source: 'Breath A', target: 'Voice pairs', amount: 28 },
  { id: 1, source: 'Uncertainty', target: 'Filter', amount: 44 },
  { id: 2, source: 'Feedback weather', target: 'Delay', amount: 18 },
];
const defaultMacros = { tension: 34, movement: 38, density: 45, space: 46, damage: 22 };
type Macros = typeof defaultMacros;

const formatSeconds = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export default function Home() {
  const [surface, setSurface] = useState<Surface>('sound');
  const [powered, setPowered] = useState(false);
  const [macros, setMacros] = useState<Macros>(defaultMacros);
  const [activeVoices, setActiveVoices] = useState<number[]>([]);
  const [latchedVoices, setLatchedVoices] = useState<number[]>([]);
  const [heldPercs, setHeldPercs] = useState<number[]>([]);
  const [cells, setCells] = useState<Cell[]>(initialCells);
  const [patches, setPatches] = useState<Patch[]>(initialPatches);
  const [scenes, setScenes] = useState<Record<string, { macros: Macros; cells: Cell[]; patches: Patch[] }>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('hi-drone-scenes') || '{}'); } catch { return {}; }
  });
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [events, setEvents] = useState<PerfEvent[]>([]);
  const [pulse, setPulse] = useState<number | null>(null);
  const [captureState, setCaptureState] = useState<'ready' | 'recording' | 'held'>('ready');
  const [captureSeconds, setCaptureSeconds] = useState(0);
  const [take, setTake] = useState<Blob | null>(null);
  const [meter, setMeter] = useState(0);
  const [notice, setNotice] = useState('Touch POWER, then play a surface.');

  const graphRef = useRef<Graph | null>(null);
  const cellsRef = useRef(cells);
  const macrosRef = useRef(macros);
  const captureStartedRef = useRef(0);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => { cellsRef.current = cells; }, [cells]);
  useEffect(() => { macrosRef.current = macros; }, [macros]);

  const addEvent = useCallback((label: string, kind: EventKind) => {
    const at = captureStartedRef.current ? Date.now() - captureStartedRef.current : Date.now();
    setEvents((previous) => [...previous.slice(-39), { at, label, kind }]);
  }, []);

  const ensureAudio = useCallback(async () => {
    if (graphRef.current) {
      if (graphRef.current.context.state === 'suspended') await graphRef.current.context.resume();
      return graphRef.current;
    }
    const context = new AudioContext();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const analyser = context.createAnalyser();
    const capture = context.createMediaStreamDestination();
    master.gain.value = 0.48;
    compressor.threshold.value = -16;
    compressor.knee.value = 22;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.18;
    analyser.fftSize = 128;
    master.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(context.destination);
    compressor.connect(capture);
    graphRef.current = { context, master, compressor, analyser, capture, voices: new Map() };
    await context.resume();
    return graphRef.current;
  }, []);

  const stopVoice = useCallback((id: number) => {
    const graph = graphRef.current;
    const node = graph?.voices.get(id);
    if (!graph || !node) return;
    const now = graph.context.currentTime;
    node.gain.gain.cancelScheduledValues(now);
    node.gain.gain.setTargetAtTime(0, now, 0.14);
    node.carrier.stop(now + 0.55);
    node.shadow.stop(now + 0.55);
    graph.voices.delete(id);
    setActiveVoices((previous) => previous.filter((voiceId) => voiceId !== id));
  }, []);

  const activateVoice = useCallback(async (id: number, origin: 'gesture' | 'cell' = 'gesture') => {
    const graph = await ensureAudio();
    const voice = voices[id];
    if (graph.voices.has(id)) {
      if (!latchedVoices.includes(id)) stopVoice(id);
      return;
    }
    const frequency = voice.base * (0.94 + (macrosRef.current.tension / 100) * 0.12);
    const carrier = graph.context.createOscillator();
    const shadow = graph.context.createOscillator();
    const mod = graph.context.createGain();
    const gain = graph.context.createGain();
    const filter = graph.context.createBiquadFilter();
    const panner = graph.context.createStereoPanner();
    carrier.type = id % 3 === 0 ? 'sine' : id % 3 === 1 ? 'triangle' : 'sawtooth';
    shadow.type = id % 2 === 0 ? 'sine' : 'square';
    carrier.frequency.value = frequency;
    shadow.frequency.value = frequency * (1.003 + id * 0.0018);
    mod.gain.value = frequency * (0.015 + macrosRef.current.damage / 1800);
    filter.type = id % 2 ? 'bandpass' : 'lowpass';
    filter.frequency.value = 320 + macrosRef.current.movement * 16 + id * 110;
    filter.Q.value = 0.8 + macrosRef.current.tension / 18;
    gain.gain.value = 0;
    panner.pan.value = (id - 3.5) / 6;
    shadow.connect(mod); mod.connect(carrier.frequency); carrier.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(graph.master);
    const now = graph.context.currentTime;
    gain.gain.setTargetAtTime(0.065 + macrosRef.current.density / 1900, now, 0.24);
    carrier.start(); shadow.start();
    graph.voices.set(id, { carrier, shadow, mod, gain, filter, panner });
    setActiveVoices((previous) => [...new Set([...previous, id])]);
    setNotice(`${voice.name} is breathing`);
    addEvent(`${voice.name} / ${origin}`, 'voice');
  }, [addEvent, ensureAudio, latchedVoices, stopVoice]);

  const triggerPercussion = useCallback(async (id: number, origin: 'gesture' | 'cell' = 'gesture') => {
    const graph = await ensureAudio();
    const item = percussion[id];
    const now = graph.context.currentTime;
    const length = Math.max(0.25, 0.3 + macrosRef.current.space / 160);
    const buffer = graph.context.createBuffer(1, Math.floor(graph.context.sampleRate * length), graph.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / data.length, id === 1 ? 2.4 : 4.2);
    const source = graph.context.createBufferSource();
    const filter = graph.context.createBiquadFilter();
    const gain = graph.context.createGain();
    source.buffer = buffer;
    filter.type = id === 0 ? 'lowpass' : id === 3 ? 'bandpass' : 'highpass';
    filter.frequency.value = id === 0 ? 210 : id === 1 ? 110 : id === 2 ? 1900 : 3400;
    filter.Q.value = id === 3 ? 7 : 1.4;
    gain.gain.setValueAtTime(0.001, now); gain.gain.exponentialRampToValueAtTime(0.16 + macrosRef.current.damage / 800, now + 0.008); gain.gain.exponentialRampToValueAtTime(0.001, now + length);
    source.connect(filter); filter.connect(gain); gain.connect(graph.master); source.start(now); source.stop(now + length + 0.03);
    addEvent(`${item.name} / ${origin}`, 'pulse'); setNotice(`${item.name} struck the field`);
  }, [addEvent, ensureAudio]);

  const togglePower = useCallback(async () => {
    if (powered) { graphRef.current?.context.suspend(); setPowered(false); setNotice('engine asleep'); addEvent('engine asleep', 'gesture'); return; }
    await ensureAudio(); setPowered(true); setNotice('engine awake — touch a body'); addEvent('engine awake', 'gesture');
  }, [addEvent, ensureAudio, powered]);

  useEffect(() => {
    if (!powered) return;
    clockRef.current = 0;
    const interval = setInterval(() => {
      clockRef.current += 80;
      cellsRef.current.forEach((cell) => {
        const intervalMs = Math.max(220, cell.interval * (1 - (macrosRef.current.movement / 100) * 0.28));
        if (clockRef.current % Math.round(intervalMs / 80) !== 0) return;
        const chance = Math.min(0.98, (cell.probability / 100) * (0.65 + (macrosRef.current.density / 100) * 0.55));
        if (Math.random() > chance) return;
        setPulse(cell.id); window.setTimeout(() => setPulse((current) => current === cell.id ? null : current), 240);
        if (cell.kind === 'voice') { const target = cell.mode === 'random' ? Math.floor(Math.random() * voices.length) : cell.target; activateVoice(target, 'cell'); if (cell.mode === 'gate') window.setTimeout(() => stopVoice(target), 220 + macrosRef.current.space * 8); }
        else { const target = cell.mode === 'random' ? Math.floor(Math.random() * percussion.length) : cell.target; triggerPercussion(target, 'cell'); }
      });
    }, 80);
    return () => clearInterval(interval);
  }, [activateVoice, powered, stopVoice, triggerPercussion]);

  useEffect(() => {
    if (!graphRef.current) return;
    let frame = 0; const data = new Uint8Array(graphRef.current.analyser.fftSize);
    const draw = () => { const analyser = graphRef.current?.analyser; if (!analyser) return; analyser.getByteTimeDomainData(data); const peak = data.reduce((highest, value) => Math.max(highest, Math.abs(value - 128)), 0); setMeter(Math.min(100, Math.round((peak / 72) * 100))); frame = requestAnimationFrame(draw); };
    draw(); return () => cancelAnimationFrame(frame);
  }, [powered]);

  const saveScene = useCallback((slot: string) => {
    const next = { ...scenes, [slot]: { macros, cells, patches } }; setScenes(next); setActiveScene(slot); localStorage.setItem('hi-drone-scenes', JSON.stringify(next)); addEvent(`scene ${slot} stored`, 'scene'); setNotice(`scene ${slot} held in local memory`);
  }, [addEvent, cells, macros, patches, scenes]);
  const loadScene = useCallback((slot: string) => {
    const scene = scenes[slot]; if (!scene) { saveScene(slot); return; }
    setMacros(scene.macros); setCells(scene.cells); setPatches(scene.patches); setActiveScene(slot); addEvent(`scene ${slot} recalled`, 'scene'); setNotice(`scene ${slot} is breathing`);
  }, [addEvent, saveScene, scenes]);

  const startCapture = useCallback(async () => {
    const graph = await ensureAudio();
    if (!('MediaRecorder' in window)) { setNotice('capture is not supported in this browser'); return; }
    const preferred = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
    const recorder = new MediaRecorder(graph.capture.stream, preferred ? { mimeType: preferred } : undefined);
    chunksRef.current = []; recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => { setTake(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })); setCaptureState('held'); setNotice('last moment held — export it or keep mutating'); };
    recorder.start(250); recorderRef.current = recorder; captureStartedRef.current = Date.now(); setEvents([]); setCaptureSeconds(0); setCaptureState('recording'); setNotice('capturing gestures and sound'); addEvent('capture started', 'gesture');
    captureTimerRef.current = setInterval(() => setCaptureSeconds(Math.floor((Date.now() - captureStartedRef.current) / 1000)), 500);
  }, [addEvent, ensureAudio]);
  const stopCapture = useCallback(() => { recorderRef.current?.stop(); recorderRef.current = null; if (captureTimerRef.current) clearInterval(captureTimerRef.current); addEvent('capture stopped', 'gesture'); setCaptureSeconds(Math.floor((Date.now() - captureStartedRef.current) / 1000)); }, [addEvent]);
  const saveLastMoment = useCallback(() => { setCaptureState('held'); setNotice(events.length ? `last ${events.length} gestures held in the timeline` : 'nothing has happened yet'); addEvent('last moment held', 'gesture'); }, [addEvent, events.length]);
  const downloadTake = useCallback((extension: string) => { if (!take) return; const url = URL.createObjectURL(take); const link = document.createElement('a'); link.href = url; link.download = `hi-drone-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.${extension}`; link.click(); URL.revokeObjectURL(url); }, [take]);

  const updateMacro = (key: keyof Macros, value: number) => { setMacros((previous) => ({ ...previous, [key]: value })); addEvent(`${key} ${value}`, 'gesture'); };
  const toggleLatch = (id: number) => { setLatchedVoices((previous) => previous.includes(id) ? previous.filter((voiceId) => voiceId !== id) : [...previous, id]); addEvent(`${voices[id].name} latch`, 'gesture'); };
  const toggleHold = (id: number) => { setHeldPercs((previous) => previous.includes(id) ? previous.filter((percId) => percId !== id) : [...previous, id]); addEvent(`${percussion[id].name} ${heldPercs.includes(id) ? 'released' : 'held as drone'}`, 'gesture'); };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === ' ') { event.preventDefault(); togglePower(); }
      if (event.key.toLowerCase() === 'r') {
        if (captureState === 'recording') stopCapture();
        else startCapture();
      }
      if (/^[1-8]$/.test(event.key)) activateVoice(Number(event.key) - 1);
      if (event.key === '[') setSurface('sound'); if (event.key === ']') setSurface('behaviour'); if (event.key === '\\') setSurface('patch');
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [activateVoice, captureState, startCapture, stopCapture, togglePower]);

  const timeline = useMemo(() => events.slice(-14), [events]);
  const slots = ['A', 'B', 'C', 'D'];
  const modes: CellMode[] = ['pulse', 'gate', 'random', 'delay', 'repeater'];

  return <main className="instrument-shell">
    <header className="topbar"><div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><div><h1>HI DRONE</h1><p>organismic composition station</p></div></div><div className="top-actions"><div className={`engine-state ${powered ? 'awake' : ''}`}><span aria-hidden="true" />{powered ? 'engine awake' : 'engine asleep'}</div><button className={`power-button ${powered ? 'is-on' : ''}`} type="button" onClick={togglePower}><span aria-hidden="true">◉</span> POWER</button></div></header>
    <section className="global-rack" aria-label="Global controls">{(Object.keys(macros) as Array<keyof Macros>).map((key) => <label className="macro-control" key={key}><span><b>{key}</b><output>{macros[key]}</output></span><input type="range" min="0" max="100" value={macros[key]} onChange={(event) => updateMacro(key, Number(event.target.value))} /></label>)}<div className="scene-bank" aria-label="Scenes"><span>SCENES</span><div>{slots.map((slot) => <button key={slot} type="button" className={activeScene === slot ? 'is-active' : ''} title={scenes[slot] ? `Recall scene ${slot}` : `Store scene ${slot}`} onClick={() => loadScene(slot)} onContextMenu={(event) => { event.preventDefault(); saveScene(slot); }}>{slot}</button>)}</div></div></section>
    <nav className="mode-tabs" aria-label="Instrument surfaces">{(['sound', 'behaviour', 'patch'] as Surface[]).map((item, index) => <button key={item} className={surface === item ? 'is-active' : ''} type="button" onClick={() => setSurface(item)}><span>0{index + 1}</span>{item}</button>)}</nav>
    <section className="working-surface">
      {surface === 'sound' && <div className="sound-surface"><div className="surface-heading"><div><span>DRONE FIELD</span><h2>Eight interacting voices</h2></div><p>Tap for a phrase. Latch to let a voice live.</p></div><div className="voice-grid">{voices.map((voice) => <article className={`voice-module tone-${voice.tone} ${activeVoices.includes(voice.id) ? 'is-active' : ''}`} key={voice.id}><div className="module-index">0{voice.id + 1}</div><button className="voice-pad" type="button" onClick={() => activateVoice(voice.id)}><span className="voice-core" aria-hidden="true" /><strong>{voice.name}</strong><small>{Math.round(voice.base * (0.94 + macros.tension / 100 * 0.12))} Hz · {voice.role}</small></button><label><span>TUNE <output>{Math.round(24 + (voice.base / 262) * 36)}</output></span><input aria-label={`${voice.name} tune`} type="range" min="24" max="76" defaultValue={Math.round(24 + (voice.base / 262) * 36)} /></label><button className={`latch-button ${latchedVoices.includes(voice.id) ? 'is-on' : ''}`} type="button" onClick={() => toggleLatch(voice.id)}><span aria-hidden="true" />{latchedVoices.includes(voice.id) ? 'LATCHED' : 'LATCH'}</button></article>)}</div><div className="surface-heading percussion-heading"><div><span>PULSE FIELD</span><h2>Four percussive bodies</h2></div><p>Every impact can be held open as a drone.</p></div><div className="percussion-grid">{percussion.map((item) => <article className={`percussion-module ${item.tone}`} key={item.id}><button className="percussion-pad" type="button" onClick={() => triggerPercussion(item.id)}><span aria-hidden="true" /><strong>{item.name}</strong><small>{item.role}</small></button><label><span>DECAY <output>{48 + item.id * 10}</output></span><input aria-label={`${item.name} decay`} type="range" min="5" max="100" defaultValue={48 + item.id * 10} /></label><button className={`hold-button ${heldPercs.includes(item.id) ? 'is-on' : ''}`} type="button" onClick={() => toggleHold(item.id)}>{heldPercs.includes(item.id) ? 'RELEASE DRONE' : 'HOLD AS DRONE'}</button></article>)}</div></div>}
      {surface === 'behaviour' && <div className="behaviour-surface"><div className="surface-heading"><div><span>BEHAVIOUR NETWORK</span><h2>Eight cells with unfinished plans</h2></div><p>Cells drift, wake each other and forget what they meant to do.</p></div><div className="network-field"><div className="network-lines" aria-hidden="true"><i /><i /><i /><i /><i /></div>{cells.map((cell) => <article className={`cell cell-${cell.colour} ${pulse === cell.id ? 'is-pulsing' : ''}`} key={cell.id}><div className="cell-orbit" /><div className="cell-head"><span>0{cell.id + 1}</span><strong>{cell.name}</strong><b>{cell.mode}</b></div><div className="cell-body"><div className="cell-target">{cell.kind === 'voice' ? voices[cell.target]?.name : percussion[cell.target]?.name}</div><div className="cell-stats"><span>{cell.interval}ms</span><span>{cell.probability}% chance</span></div></div><label><span>PROBABILITY <output>{cell.probability}</output></span><input type="range" min="0" max="100" value={cell.probability} onChange={(event) => setCells((previous) => previous.map((entry) => entry.id === cell.id ? { ...entry, probability: Number(event.target.value) } : entry))} /></label><select aria-label={`${cell.name} mode`} value={cell.mode} onChange={(event) => setCells((previous) => previous.map((entry) => entry.id === cell.id ? { ...entry, mode: event.target.value as CellMode } : entry))}>{modes.map((mode) => <option key={mode}>{mode}</option>)}</select></article>)}</div></div>}
      {surface === 'patch' && <div className="patch-surface"><div className="surface-heading"><div><span>PATCH WEATHER</span><h2>Three connections are awake</h2></div><p>Drag the atmosphere through the instrument. Nothing is permanent.</p></div><div className="patch-grid"><div className="patch-column"><span className="column-label">SOURCES</span>{['Breath A', 'Breath B', 'Uncertainty', 'Feedback weather'].map((source) => <button className="patch-node source" key={source} type="button"><i />{source}<small>signal</small></button>)}</div><div className="patch-visual" aria-hidden="true"><div className="signal signal-one" /><div className="signal signal-two" /><div className="signal signal-three" /></div><div className="patch-column"><span className="column-label">TARGETS</span>{['Voice pairs', 'Filter', 'Delay', 'Drive'].map((target) => <button className="patch-node target" key={target} type="button"><i />{target}<small>destination</small></button>)}</div></div><div className="cable-list">{patches.map((patch) => <article className="cable" key={patch.id}><span className="cable-dot" /><strong>{patch.source}</strong><span className="cable-arrow">→</span><strong>{patch.target}</strong><label><span>AMOUNT <output>{patch.amount}</output></span><input type="range" min="-100" max="100" value={patch.amount} onChange={(event) => setPatches((previous) => previous.map((entry) => entry.id === patch.id ? { ...entry, amount: Number(event.target.value) } : entry))} /></label><button type="button" onClick={() => setPatches((previous) => previous.filter((entry) => entry.id !== patch.id))}>REMOVE</button></article>)}</div></div>}
    </section>
    <section className="telemetry-rack"><div className="telemetry-label"><span>FIELD TELEMETRY</span><strong>{notice}</strong></div><div className="meter" aria-label={`audio activity ${meter}%`}><span style={{ width: `${meter}%` }} /></div><div className="shortcut-hint">SPACE power · 1–8 voices · R capture · [ ] \\ surfaces</div></section>
    <section className="timeline-rack"><div className="timeline-heading"><span>EVENT WEATHER</span><strong>{timeline.length ? `${timeline.length} gestures in memory` : 'waiting for a first disturbance'}</strong></div><div className="timeline-track">{timeline.map((event, index) => <div className={`timeline-event ${event.kind}`} key={`${event.at}-${index}`} style={{ left: `${Math.min(96, (index / Math.max(1, timeline.length - 1)) * 92 + 2)}%` }} title={event.label}><i /><span>{event.label}</span></div>)}</div></section>
    <footer className={`capture-rack ${captureState === 'recording' ? 'is-recording' : ''}`}><div className="capture-status"><div className="capture-light" aria-hidden="true" /><div><span>{captureState === 'recording' ? 'CAPTURING PERFORMANCE' : captureState === 'held' ? 'PERFORMANCE HELD' : 'CAPTURE READY'}</span><strong>{captureState === 'recording' ? formatSeconds(captureSeconds) : take ? formatSeconds(captureSeconds) : '00:00'}</strong></div><small>{captureState === 'recording' ? `${events.length} gestures` : 'Audio + gesture memory stays local.'}</small></div><div className="capture-actions">{captureState === 'recording' ? <button className="stop-button" type="button" onClick={stopCapture}>■ STOP</button> : <><button className="record-button" type="button" onClick={startCapture}><span aria-hidden="true" />CAPTURE</button><button className="save-moment" type="button" onClick={saveLastMoment}>SAVE LAST MOMENT</button></>}{take && <><button type="button" onClick={() => downloadTake('webm')}>AUDIO</button><button type="button" onClick={() => downloadTake('webm')}>EXPORT</button></>}</div></footer>
  </main>;
}
