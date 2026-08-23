'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';

type DroneScaleName = 'minor' | 'dorian' | 'phrygian' | 'pentaMinor' | 'pentaMajor' | 'wholeTone' | 'harmonicMinor' | 'lydian';
type ModulationShape = 'sine' | 'random';
type NoiseColor = 'brown' | 'pink' | 'white';
type SampleMode = 'granular' | 'loop';
type PulsePattern = 'off' | 'steady' | 'doom' | 'sparse';
type DroneSettings = { basePitch: number; detuneCents: number; oscCount: number; waveform: OscillatorType; modulationShape: ModulationShape; filterRate: number; filterDepth: number; pitchDrift: number; volLfoDepth: number; panDepth: number; noiseColor: NoiseColor; noiseAmount: number; reverbAmount: number; delayAmount: number; delayTime: number; delayFeedback: number; chorusAmount: number; driveAmount: number; masterVolume: number; scale: DroneScaleName; genSpeed: number; maxVoices: number };
type DroneVoiceNode = { noteName: string; semitone: number; oscillators: Array<{ osc: OscillatorNode; gain: GainNode }>; subOsc: OscillatorNode; subGain: GainNode; airOsc: OscillatorNode; airGain: GainNode; voiceGain: GainNode; filter: BiquadFilterNode; panner: StereoPannerNode; filterLfo: OscillatorNode; filterLfoGain: GainNode; pitchLfo: OscillatorNode; pitchLfoGain: GainNode; volLfo: OscillatorNode; volLfoGain: GainNode; panLfo: OscillatorNode; panLfoGain: GainNode; randomInterval: number | null };
type SampleSettings = { grainRate: number; grainPitch: number; grainVolume: number; grainSize: number; grainDrift: number; grainDensity: number };
type Graph = {
  context: AudioContext; master: GainNode; toneHigh: BiquadFilterNode; toneLow: BiquadFilterNode; compressor: DynamicsCompressorNode; analyser: AnalyserNode;
  droneMaster: GainNode; droneBus: GainNode; droneDrive: WaveShaperNode; droneChorusDry: GainNode; droneChorusDelay: DelayNode; droneChorusWet: GainNode; droneChorusLfo: OscillatorNode; droneChorusDepth: GainNode;
  droneDry: GainNode; droneReverb: ConvolverNode; droneReverbPreDelay: DelayNode; droneReverbWet: GainNode;
  droneDelay: DelayNode; droneDelayFilter: BiquadFilterNode; droneDelayFeedback: GainNode; droneDelayWet: GainNode;
  droneNoise: AudioBufferSourceNode; droneNoiseFilter: BiquadFilterNode; droneNoiseGain: GainNode;
  droneVoices: Map<number, DroneVoiceNode>;
  sampleGain: GainNode; sampleFilter: BiquadFilterNode; sampleBuffer: AudioBuffer | null; loopSource: AudioBufferSourceNode | null; granularTimer: number | null;
  recordProcessor: ScriptProcessorNode | null;
  pulseOsc: OscillatorNode; pulseGain: GainNode; pulseFilter: BiquadFilterNode; pulseTimer: number | null; pulseStep: number;
  wanderLfo: OscillatorNode; wanderReverbGain: GainNode; wanderToneGain: GainNode; wanderChorusGain: GainNode;
};

const droneScales: Record<DroneScaleName, { label: string; intervals: number[] }> = {
  minor: { label: 'D Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { label: 'D Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { label: 'E Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
  pentaMinor: { label: 'Pentatonic Min', intervals: [0, 3, 5, 7, 10] },
  pentaMajor: { label: 'Pentatonic Maj', intervals: [0, 2, 4, 7, 9] },
  wholeTone: { label: 'Whole Tone', intervals: [0, 2, 4, 6, 8, 10] },
  harmonicMinor: { label: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
  lydian: { label: 'F Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
};
const dronePrimes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53];
const noteNames = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const defaultDroneSettings: DroneSettings = {
  basePitch: 55, detuneCents: 7, oscCount: 5, waveform: 'sine', modulationShape: 'sine', filterRate: 0.05, filterDepth: 0.6,
  pitchDrift: 0.15, volLfoDepth: 0.3, panDepth: 0.35, noiseColor: 'brown', noiseAmount: 0.12,
  reverbAmount: 0.7, delayAmount: 0.4, delayTime: 0.8, delayFeedback: 0.45, chorusAmount: 0.18, driveAmount: 0.04,
  masterVolume: 0.5, scale: 'minor', genSpeed: 8, maxVoices: 6,
};
const defaultSampleSettings: SampleSettings = { grainRate: 0.5, grainPitch: -12, grainVolume: 0.6, grainSize: 2.0, grainDrift: 0.3, grainDensity: 4 };
const MIC_MAX_SECONDS = 60;
const waveformOptions: Array<{ label: string; value: OscillatorType }> = [
  { label: 'Sine', value: 'sine' },
  { label: 'Tri', value: 'triangle' },
  { label: 'Saw', value: 'sawtooth' },
];
// Ratio-based step patterns for the Pulse — borrowed from the "doom loop"
// idea of an 8-step sequencer using integer ratios for step length instead
// of a fixed metronome, so the pulse breathes unevenly rather than ticking.
const pulsePatterns: Record<Exclude<PulsePattern, 'off'>, number[]> = {
  steady: [1, 1, 1, 1],
  doom: [1, 1, 2, 1, 1, 2, 1, 3],
  sparse: [2, 3, 2, 5],
};

const createDriveCurve = (amount: number) => {
  const curve = new Float32Array(2048);
  const drive = 1 + amount * 36;
  for (let index = 0; index < curve.length; index += 1) {
    const x = (index * 2) / (curve.length - 1) - 1;
    curve[index] = amount <= 0.001 ? x : Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
};
const createDroneReverb = (context: AudioContext, duration = 4.2) => {
  const convolver = context.createConvolver();
  const length = Math.floor(context.sampleRate * duration);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    let lowpass = 0;
    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      const decay = Math.exp(-3.2 * progress);
      const build = index < context.sampleRate * 0.01 ? index / (context.sampleRate * 0.01) : 1;
      const white = Math.random() * 2 - 1;
      // One-pole lowpass that closes over time — the tail gets darker as it fades
      lowpass += (0.28 - 0.22 * progress) * (white - lowpass);
      data[index] = lowpass * decay * build * 1.1;
    }
  }
  convolver.buffer = impulse;
  return convolver;
};
const createNoiseBuffer = (context: AudioContext, duration = 2) => {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  // True brown noise via a leaky integrator — deep, warm, rumble-free
  let last = 0;
  for (let index = 0; index < data.length; index += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[index] = last * 3.2;
  }
  return buffer;
};
const formatHertz = (value: number) => String(Number(value.toFixed(3)));
const floatTo16BitPCM = (input: Float32Array) => {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
};

type Mp3Encoder = { encodeBuffer: (left: Int16Array, right: Int16Array) => Uint8Array; flush: () => Uint8Array };
type LameModule = { Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => Mp3Encoder };

export default function DroneEnginePage() {
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [settings, setSettings] = useState<DroneSettings>(defaultDroneSettings);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voiceCount, setVoiceCount] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);

  // Audio Input: drop in any sound file and it becomes a granular/looped drone.
  const [sampleSettings, setSampleSettings] = useState<SampleSettings>(defaultSampleSettings);
  const [sampleMode, setSampleMode] = useState<SampleMode>('granular');
  const [sampleThroughFx, setSampleThroughFx] = useState(true);
  const [sampleLoaded, setSampleLoaded] = useState(false);
  const [sampleName, setSampleName] = useState('');
  const [sampleMeta, setSampleMeta] = useState('');
  const [sampleStatus, setSampleStatus] = useState('None');
  const [isDragging, setIsDragging] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);

  // Mic recording: capture a short sound or vocal take and feed it into the
  // same sample engine as a dropped file (granular/loop, Through FX Chain).
  const [micState, setMicState] = useState<'idle' | 'requesting' | 'recording' | 'processing'>('idle');
  const [micTime, setMicTime] = useState('00:00');
  const [micError, setMicError] = useState<string | null>(null);

  // Record & Export: capture the full mix and download it as an MP3.
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState('00:00');
  const [recordStatus, setRecordStatus] = useState('Idle');

  // Pulse: an occasional soft sub thump, timed with uneven step ratios
  // (a nod to doom-loop's ratio-based step sequencer) rather than a strict beat.
  const [pulsePattern, setPulsePattern] = useState<PulsePattern>('off');
  const [pulseSpeed, setPulseSpeed] = useState(1.4);
  const [pulseDepth, setPulseDepth] = useState(50);

  // Wander: a very slow macro drift across reverb/brightness/width, so the
  // room keeps slowly moving through its own space instead of settling.
  const [wanderOn, setWanderOn] = useState(false);
  const [wanderSpeed, setWanderSpeed] = useState(0.02);
  const [wanderDepth, setWanderDepth] = useState(40);

  const graphRef = useRef<Graph | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const settingsRef = useRef(settings);
  const sampleSettingsRef = useRef(sampleSettings);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const generationTimerRef = useRef<number | null>(null);
  const seedRef = useRef(0);
  const voiceIdRef = useRef(0);
  const generateNoteRef = useRef<() => void>(() => {});

  const recordedLeftRef = useRef<Float32Array[]>([]);
  const recordedRightRef = useRef<Float32Array[]>([]);
  const recordStartRef = useRef(0);
  const recordTickRef = useRef<number | null>(null);

  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micChunksRef = useRef<Blob[]>([]);
  const micStartRef = useRef(0);
  const micTickRef = useRef<number | null>(null);
  const micStopRef = useRef<() => void>(() => {});

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { sampleSettingsRef.current = sampleSettings; }, [sampleSettings]);
  useEffect(() => { seedRef.current = Math.floor(Math.random() * 100000); }, []);

  const nextRandom = useCallback(() => {
    seedRef.current = (seedRef.current * 1664525 + 1013904223) >>> 0;
    return seedRef.current / 4294967296;
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
    const droneMaster = context.createGain();
    const droneBus = context.createGain();
    const droneDrive = context.createWaveShaper();
    const droneChorusDry = context.createGain();
    const droneChorusDelay = context.createDelay(0.05);
    const droneChorusWet = context.createGain();
    const droneChorusLfo = context.createOscillator();
    const droneChorusDepth = context.createGain();
    const droneDry = context.createGain();
    const droneReverb = createDroneReverb(context);
    const droneReverbWet = context.createGain();
    const droneDelay = context.createDelay(5);
    const droneDelayFeedback = context.createGain();
    const droneDelayWet = context.createGain();
    const droneNoise = context.createBufferSource();
    const droneNoiseFilter = context.createBiquadFilter();
    const droneNoiseGain = context.createGain();
    const toneHigh = context.createBiquadFilter();
    const toneLow = context.createBiquadFilter();
    const droneReverbPreDelay = context.createDelay(0.2);
    const droneDelayFilter = context.createBiquadFilter();
    const sampleGain = context.createGain();
    const sampleFilter = context.createBiquadFilter();
    const pulseOsc = context.createOscillator();
    const pulseGain = context.createGain();
    const pulseFilter = context.createBiquadFilter();
    const wanderLfo = context.createOscillator();
    const wanderReverbGain = context.createGain();
    const wanderToneGain = context.createGain();
    const wanderChorusGain = context.createGain();

    master.gain.value = 0.48;
    toneHigh.type = 'highpass';
    toneHigh.frequency.value = 28;
    toneLow.type = 'lowpass';
    toneLow.frequency.value = 13500;
    droneReverbPreDelay.delayTime.value = 0.03;
    droneDelayFilter.type = 'lowpass';
    droneDelayFilter.frequency.value = 2400;
    droneDelayFilter.Q.value = 0.5;
    compressor.threshold.value = -18;
    compressor.knee.value = 24;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.02;
    compressor.release.value = 0.35;
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;
    droneDry.gain.value = 1 - defaultDroneSettings.reverbAmount * 0.5;
    droneMaster.gain.value = defaultDroneSettings.masterVolume;
    droneDrive.curve = createDriveCurve(defaultDroneSettings.driveAmount);
    droneDrive.oversample = '2x';
    droneChorusDry.gain.value = 1 - defaultDroneSettings.chorusAmount * 0.35;
    droneChorusDelay.delayTime.value = 0.018;
    droneChorusWet.gain.value = defaultDroneSettings.chorusAmount;
    droneChorusLfo.frequency.value = 0.23;
    droneChorusDepth.gain.value = defaultDroneSettings.chorusAmount * 0.004;
    droneReverbWet.gain.value = defaultDroneSettings.reverbAmount;
    droneDelay.delayTime.value = defaultDroneSettings.delayTime;
    droneDelayFeedback.gain.value = defaultDroneSettings.delayFeedback;
    droneDelayWet.gain.value = defaultDroneSettings.delayAmount;
    droneNoise.buffer = createNoiseBuffer(context);
    droneNoise.loop = true;
    droneNoiseFilter.type = 'lowpass';
    droneNoiseFilter.frequency.value = 720;
    droneNoiseGain.gain.value = 0;

    // Audio Input chain: whatever the user drops in (granular grains or a
    // simple loop) lands here, then optionally joins the same dry/reverb/
    // delay sends the drone voices use ("through FX"), or goes straight to
    // master if the user wants it dry.
    sampleFilter.type = 'lowpass';
    sampleFilter.frequency.value = 2000;
    sampleFilter.Q.value = 1.5;
    sampleGain.gain.value = defaultSampleSettings.grainVolume * 0.4;
    sampleGain.connect(sampleFilter);
    sampleFilter.connect(droneDry);
    sampleFilter.connect(droneReverbPreDelay);
    sampleFilter.connect(droneDelay);

    // Pulse: a single persistent sub oscillator gated by short envelope hits
    // scheduled on ratio-based steps — silent until a pattern is selected.
    pulseOsc.type = 'sine';
    pulseOsc.frequency.value = defaultDroneSettings.basePitch / 2;
    pulseFilter.type = 'lowpass';
    pulseFilter.frequency.value = 220;
    pulseGain.gain.value = 0;
    pulseOsc.connect(pulseFilter);
    pulseFilter.connect(pulseGain);
    pulseGain.connect(droneDry);
    pulseGain.connect(droneReverbPreDelay);
    pulseOsc.start();

    // Wander: a very slow LFO fanned out to reverb send, tone brightness,
    // and chorus width together, so the room drifts as one connected thing.
    wanderLfo.frequency.value = 0.02;
    wanderReverbGain.gain.value = 0;
    wanderToneGain.gain.value = 0;
    wanderChorusGain.gain.value = 0;
    wanderLfo.connect(wanderReverbGain);
    wanderLfo.connect(wanderToneGain);
    wanderLfo.connect(wanderChorusGain);
    wanderReverbGain.connect(droneReverbWet.gain);
    wanderToneGain.connect(toneLow.frequency);
    wanderChorusGain.connect(droneChorusWet.gain);
    wanderLfo.start();

    droneDelay.connect(droneDelayFilter);
    droneDelayFilter.connect(droneDelayFeedback);
    droneDelayFeedback.connect(droneDelay);
    droneChorusLfo.connect(droneChorusDepth);
    droneChorusDepth.connect(droneChorusDelay.delayTime);
    droneChorusLfo.start();
    droneNoise.connect(droneNoiseFilter);
    droneNoiseFilter.connect(droneNoiseGain);
    droneNoiseGain.connect(droneDry);
    droneNoiseGain.connect(droneReverbPreDelay);
    droneNoiseGain.connect(droneDelay);
    droneNoise.start();
    master.connect(toneHigh);
    toneHigh.connect(toneLow);
    toneLow.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(context.destination);
    droneDry.connect(droneBus);
    droneReverbPreDelay.connect(droneReverb);
    droneReverb.connect(droneReverbWet);
    droneReverbWet.connect(droneBus);
    droneDelay.connect(droneDelayWet);
    droneDelayWet.connect(droneBus);
    droneDelayWet.connect(droneReverbPreDelay);
    droneBus.connect(droneDrive);
    droneDrive.connect(droneChorusDry);
    droneDrive.connect(droneChorusDelay);
    droneChorusDelay.connect(droneChorusWet);
    droneChorusDry.connect(droneMaster);
    droneChorusWet.connect(droneMaster);
    droneMaster.connect(master);

    graphRef.current = {
      context, master, toneHigh, toneLow, compressor, analyser, droneMaster, droneBus, droneDrive, droneChorusDry, droneChorusDelay, droneChorusWet, droneChorusLfo, droneChorusDepth,
      droneDry, droneReverb, droneReverbPreDelay, droneReverbWet, droneDelay, droneDelayFilter, droneDelayFeedback, droneDelayWet, droneNoise, droneNoiseFilter, droneNoiseGain,
      droneVoices: new Map(),
      sampleGain, sampleFilter, sampleBuffer: null, loopSource: null, granularTimer: null,
      recordProcessor: null,
      pulseOsc, pulseGain, pulseFilter, pulseTimer: null, pulseStep: 0,
      wanderLfo, wanderReverbGain, wanderToneGain, wanderChorusGain,
    };
    await context.resume();
    return graphRef.current;
  }, []);

  const stopVoice = useCallback((id: number) => {
    const graph = graphRef.current;
    const voice = graph?.droneVoices.get(id);
    if (!graph || !voice) return;
    const now = graph.context.currentTime;
    voice.voiceGain.gain.cancelScheduledValues(now);
    voice.voiceGain.gain.setTargetAtTime(0, now, 0.5);
    window.setTimeout(() => {
      voice.oscillators.forEach(({ osc }) => { try { osc.stop(); } catch {} });
      try { voice.subOsc.stop(); } catch {}
      try { voice.airOsc.stop(); } catch {}
      try { voice.filterLfo.stop(); } catch {}
      try { voice.pitchLfo.stop(); } catch {}
      try { voice.volLfo.stop(); } catch {}
      try { voice.panLfo.stop(); } catch {}
      if (voice.randomInterval) window.clearInterval(voice.randomInterval);
    }, 650);
    graph.droneVoices.delete(id);
    setVoiceCount(graph.droneVoices.size);
    setNotes(Array.from(graph.droneVoices.values()).map((item) => item.noteName));
  }, []);

  const stopAllVoices = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    Array.from(graph.droneVoices.keys()).forEach(stopVoice);
    if (generationTimerRef.current) window.clearTimeout(generationTimerRef.current);
    generationTimerRef.current = null;
  }, [stopVoice]);

  const createVoice = useCallback(async (frequency: number, noteName: string, semitone: number) => {
    const graph = await ensureAudio();
    const current = settingsRef.current;
    const now = graph.context.currentTime;
    const id = voiceIdRef.current += 1;
    const voiceGain = graph.context.createGain();
    const filter = graph.context.createBiquadFilter();
    const panner = graph.context.createStereoPanner();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    filter.Q.value = 2;
    // Normalized per-oscillator level so 8 oscillators don't clip harder than 2
    const oscLevel = 1 / Math.sqrt(current.oscCount);
    const oscillators: Array<{ osc: OscillatorNode; gain: GainNode }> = [];
    for (let index = 0; index < current.oscCount; index += 1) {
      const osc = graph.context.createOscillator();
      const oscGain = graph.context.createGain();
      const oscPan = graph.context.createStereoPanner();
      osc.type = current.waveform;
      osc.frequency.value = frequency;
      osc.detune.value = (current.oscCount > 1 ? (index / (current.oscCount - 1) - 0.5) * 2 * current.detuneCents : 0) + (nextRandom() * 2 - 1) * 2;
      oscGain.gain.value = (0.55 + nextRandom() * 0.3) * oscLevel;
      // Spread the unison across the stereo field — width comes free with detune
      oscPan.pan.value = current.oscCount > 1 ? (index / (current.oscCount - 1) - 0.5) * 0.55 : 0;
      osc.connect(oscGain); oscGain.connect(oscPan); oscPan.connect(filter); osc.start();
      oscillators.push({ osc, gain: oscGain });
    }
    // Sub oscillator one octave down — always a clean sine for weight without mud
    const subOsc = graph.context.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.value = frequency / 2;
    const subGain = graph.context.createGain();
    subGain.gain.value = 0.6 * oscLevel;
    subOsc.connect(subGain); subGain.connect(filter); subOsc.start();
    // Air partial — a quiet 2nd or 3rd harmonic that shimmers above the drone
    const airOsc = graph.context.createOscillator();
    airOsc.type = 'sine';
    airOsc.frequency.value = frequency * (nextRandom() < 0.5 ? 2 : 3);
    airOsc.detune.value = 4 + nextRandom() * 4;
    const airGain = graph.context.createGain();
    airGain.gain.value = 0.1 + nextRandom() * 0.06;
    airOsc.connect(airGain); airGain.connect(filter); airOsc.start();
    const filterLfo = graph.context.createOscillator();
    filterLfo.frequency.value = current.filterRate * (dronePrimes[Math.floor(nextRandom() * dronePrimes.length)] / 10);
    const filterLfoGain = graph.context.createGain();
    filterLfoGain.gain.value = current.modulationShape === 'sine' ? current.filterDepth * 3000 : 0;
    filterLfo.connect(filterLfoGain); filterLfoGain.connect(filter.frequency); filterLfo.start();
    const pitchLfo = graph.context.createOscillator();
    pitchLfo.frequency.value = current.filterRate * 0.3 * (dronePrimes[Math.floor(nextRandom() * dronePrimes.length)] / 10);
    const pitchLfoGain = graph.context.createGain();
    pitchLfoGain.gain.value = current.modulationShape === 'sine' ? current.pitchDrift * 50 : 0;
    pitchLfo.connect(pitchLfoGain); oscillators.forEach(({ osc }) => pitchLfoGain.connect(osc.detune)); pitchLfoGain.connect(subOsc.detune); pitchLfoGain.connect(airOsc.detune); pitchLfo.start();
    const volLfo = graph.context.createOscillator();
    volLfo.frequency.value = current.filterRate * 0.5 * (dronePrimes[Math.floor(nextRandom() * dronePrimes.length)] / 10);
    const volLfoGain = graph.context.createGain();
    volLfoGain.gain.value = current.modulationShape === 'sine' ? current.volLfoDepth * 0.3 : 0;
    volLfo.connect(volLfoGain); volLfoGain.connect(voiceGain.gain); volLfo.start();
    const panLfo = graph.context.createOscillator();
    panLfo.frequency.value = current.filterRate * 0.37 * (dronePrimes[Math.floor(nextRandom() * dronePrimes.length)] / 10);
    const panLfoGain = graph.context.createGain();
    panLfoGain.gain.value = current.modulationShape === 'sine' ? current.panDepth : 0;
    panLfo.connect(panLfoGain); panLfoGain.connect(panner.pan); panLfo.start();
    filter.connect(voiceGain); voiceGain.connect(panner); panner.connect(graph.droneDry); panner.connect(graph.droneReverbPreDelay); panner.connect(graph.droneDelay);
    const attackTime = 3 + nextRandom() * 5;
    const releaseTime = 6 + nextRandom() * 8;
    const sustainLevel = 0.14 + nextRandom() * 0.08;
    const noteDuration = 20 + nextRandom() * 30;
    // Exponential swell in, long natural decay out — no linear ramp "knees"
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.setTargetAtTime(sustainLevel, now, attackTime / 3.5);
    voiceGain.gain.setTargetAtTime(0.0001, now + noteDuration, releaseTime / 3.5);
    let randomInterval: number | null = null;
    if (current.modulationShape === 'random') {
      const intervalMs = Math.max(480, 1000 / Math.max(0.01, current.filterRate * 4));
      randomInterval = window.setInterval(() => {
        const time = graph.context.currentTime;
        const glide = Math.max(0.18, intervalMs / 1000 * 0.78);
        filter.frequency.setTargetAtTime(240 + nextRandom() * current.filterDepth * 4200, time, glide);
        panner.pan.setTargetAtTime((nextRandom() * 2 - 1) * current.panDepth, time, glide);
        oscillators.forEach(({ osc }) => osc.detune.setTargetAtTime((nextRandom() * 2 - 1) * current.pitchDrift * 50, time, glide));
        subOsc.detune.setTargetAtTime((nextRandom() * 2 - 1) * current.pitchDrift * 18, time, glide);
      }, intervalMs);
    }
    const voice = { noteName, semitone, oscillators, subOsc, subGain, airOsc, airGain, voiceGain, filter, panner, filterLfo, filterLfoGain, pitchLfo, pitchLfoGain, volLfo, volLfoGain, panLfo, panLfoGain, randomInterval };
    graph.droneVoices.set(id, voice);
    setVoiceCount(graph.droneVoices.size);
    setNotes(Array.from(graph.droneVoices.values()).map((item) => item.noteName));
    window.setTimeout(() => stopVoice(id), (noteDuration + releaseTime + 1) * 1000);
  }, [ensureAudio, nextRandom, stopVoice]);

  const generateNote = useCallback(async () => {
    const graph = graphRef.current;
    const current = settingsRef.current;
    if (!runningRef.current || pausedRef.current) return;
    if (graph && graph.droneVoices.size >= current.maxVoices) {
      const primeMultiplier = 0.7 + (dronePrimes[Math.floor(nextRandom() * 6)] / dronePrimes[6]) * 0.6;
      generationTimerRef.current = window.setTimeout(() => generateNoteRef.current(), current.genSpeed * primeMultiplier * 1000);
      return;
    }
    const scale = droneScales[current.scale].intervals;
    const baseMidi = Math.round(12 * Math.log2(current.basePitch / 16.351));
    // Every scale tone the engine is allowed to speak, across the working register
    const candidates: number[] = [];
    for (let octave = 0; octave < 3; octave += 1) {
      for (const interval of scale) {
        for (let degreeOctave = 0; degreeOctave < 2; degreeOctave += 1) {
          candidates.push(baseMidi + interval + (octave + degreeOctave) * 12);
        }
      }
    }
    const activeVoices = graph ? Array.from(graph.droneVoices.values()) : [];
    let totalSemitones: number;
    if (activeVoices.length > 0 && nextRandom() < 0.42) {
      // Consonance-aware path: anchor to a sounding voice and snap to a
      // nearby scale tone at a consonant interval (octave, fifth, fourth, third)
      const anchor = activeVoices[Math.floor(nextRandom() * activeVoices.length)].semitone;
      const consonantSteps = [-12, -7, -5, 0, 3, 4, 5, 7, 8, 9, 12];
      const target = anchor + consonantSteps[Math.floor(nextRandom() * consonantSteps.length)];
      totalSemitones = candidates.reduce((best, candidate) => (Math.abs(candidate - target) < Math.abs(best - target) ? candidate : best), candidates[0]);
    } else {
      // Free path: weighted toward low degrees and low octaves
      const random = nextRandom();
      const scaleIndex = Math.floor(Math.pow(random, 1.8) * scale.length * 2);
      const octaveRandom = nextRandom();
      const octave = octaveRandom < 0.55 ? 1 : octaveRandom < 0.88 ? 2 : 3;
      const semitones = scale[scaleIndex % scale.length] + Math.floor(scaleIndex / scale.length) * 12;
      totalSemitones = baseMidi + semitones + (octave - 1) * 12;
    }
    const frequency = 16.351 * Math.pow(2, totalSemitones / 12);
    await createVoice(frequency, `${noteNames[((totalSemitones % 12) + 12) % 12]}${Math.floor(totalSemitones / 12)}`, totalSemitones);
    if (runningRef.current && !pausedRef.current) {
      const primeMultiplier = 0.7 + (dronePrimes[Math.floor(nextRandom() * 6)] / dronePrimes[6]) * 0.6;
      generationTimerRef.current = window.setTimeout(() => generateNoteRef.current(), current.genSpeed * primeMultiplier * 1000);
    }
  }, [createVoice, nextRandom]);

  useEffect(() => { generateNoteRef.current = () => { void generateNote(); }; }, [generateNote]);

  const startEngine = useCallback(async () => {
    setStarting(true);
    await ensureAudio();
    setStarted(true);
    setRunning(true);
    setPaused(false);
    runningRef.current = true;
    pausedRef.current = false;
    window.setTimeout(generateNote, 450);
    window.setTimeout(generateNote, 2450);
  }, [ensureAudio, generateNote]);

  const togglePause = useCallback(() => {
    setPaused((previous) => {
      const next = !previous;
      pausedRef.current = next;
      if (!next) window.setTimeout(generateNote, 80);
      return next;
    });
  }, [generateNote]);

  const newSeed = useCallback(() => {
    seedRef.current = Math.floor(Math.random() * 100000);
    if (runningRef.current && !pausedRef.current) window.setTimeout(generateNote, 80);
  }, [generateNote]);

  const releaseAll = useCallback(() => {
    stopAllVoices();
    if (runningRef.current && !pausedRef.current) {
      generationTimerRef.current = window.setTimeout(generateNote, 1200);
    }
  }, [generateNote, stopAllVoices]);

  const updateSetting = <K extends keyof DroneSettings>(key: K, value: DroneSettings[K]) => {
    setSettings((previous) => ({ ...previous, [key]: value }));
  };
  const updateSampleSetting = <K extends keyof SampleSettings>(key: K, value: SampleSettings[K]) => {
    setSampleSettings((previous) => ({ ...previous, [key]: value }));
  };

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.context.currentTime;
    graph.droneMaster.gain.setTargetAtTime(settings.masterVolume, now, 0.08);
    graph.droneReverbWet.gain.setTargetAtTime(settings.reverbAmount, now, 0.12);
    graph.droneDry.gain.setTargetAtTime(1 - settings.reverbAmount * 0.5, now, 0.12);
    graph.droneDelayWet.gain.setTargetAtTime(settings.delayAmount, now, 0.12);
    graph.droneDelay.delayTime.setTargetAtTime(settings.delayTime, now, 0.12);
    graph.droneDelayFeedback.gain.setTargetAtTime(settings.delayFeedback, now, 0.12);
    graph.droneDrive.curve = createDriveCurve(settings.driveAmount);
    graph.droneChorusDry.gain.setTargetAtTime(1 - settings.chorusAmount * 0.35, now, 0.12);
    graph.droneChorusWet.gain.setTargetAtTime(settings.chorusAmount, now, 0.12);
    graph.droneChorusDepth.gain.setTargetAtTime(settings.chorusAmount * 0.004, now, 0.12);
    graph.droneChorusLfo.frequency.setTargetAtTime(0.12 + settings.filterRate * 2, now, 0.2);
    graph.droneNoiseGain.gain.setTargetAtTime(running ? settings.noiseAmount * 0.12 : 0, now, 0.24);
    graph.droneNoiseFilter.type = settings.noiseColor === 'white' ? 'allpass' : 'lowpass';
    graph.droneNoiseFilter.frequency.setTargetAtTime(settings.noiseColor === 'brown' ? 720 : settings.noiseColor === 'pink' ? 3800 : 12000, now, 0.18);
    graph.pulseOsc.frequency.setTargetAtTime(settings.basePitch / 2, now, 0.3);
    graph.droneVoices.forEach((voice) => {
      const sine = settings.modulationShape === 'sine';
      voice.filterLfo.frequency.setTargetAtTime(settings.filterRate, now, 0.2);
      voice.filterLfoGain.gain.setTargetAtTime(sine ? settings.filterDepth * 3000 : 0, now, 0.2);
      voice.pitchLfo.frequency.setTargetAtTime(settings.filterRate * 0.3, now, 0.2);
      voice.pitchLfoGain.gain.setTargetAtTime(sine ? settings.pitchDrift * 50 : 0, now, 0.2);
      voice.volLfo.frequency.setTargetAtTime(settings.filterRate * 0.5, now, 0.2);
      voice.volLfoGain.gain.setTargetAtTime(sine ? settings.volLfoDepth * 0.3 : 0, now, 0.2);
      voice.panLfo.frequency.setTargetAtTime(settings.filterRate * 0.37, now, 0.2);
      voice.panLfoGain.gain.setTargetAtTime(sine ? settings.panDepth : 0, now, 0.2);
      if (voice.randomInterval) window.clearInterval(voice.randomInterval);
      voice.randomInterval = null;
      if (!sine) {
        const intervalMs = Math.max(480, 1000 / Math.max(0.01, settings.filterRate * 4));
        voice.randomInterval = window.setInterval(() => {
          const current = settingsRef.current;
          const time = graph.context.currentTime;
          const glide = Math.max(0.18, intervalMs / 1000 * 0.78);
          voice.filter.frequency.setTargetAtTime(240 + nextRandom() * current.filterDepth * 4200, time, glide);
          voice.panner.pan.setTargetAtTime((nextRandom() * 2 - 1) * current.panDepth, time, glide);
          voice.oscillators.forEach(({ osc }) => osc.detune.setTargetAtTime((nextRandom() * 2 - 1) * current.pitchDrift * 50, time, glide));
          voice.subOsc.detune.setTargetAtTime((nextRandom() * 2 - 1) * current.pitchDrift * 18, time, glide);
        }, intervalMs);
      }
    });
  }, [running, settings, nextRandom]);

  // ── Audio Input: granular + loop engine ─────────────────────────

  const stopGranular = useCallback(() => {
    const graph = graphRef.current;
    if (graph?.granularTimer) { window.clearTimeout(graph.granularTimer); graph.granularTimer = null; }
  }, []);

  const scheduleGrain = useCallback((startTime: number) => {
    const graph = graphRef.current;
    if (!graph || !graph.sampleBuffer) return;
    const current = sampleSettingsRef.current;
    const bufferDuration = graph.sampleBuffer.duration;
    const grainDur = current.grainSize;
    const rate = current.grainRate;
    const drift = current.grainDrift;
    const centerPos = bufferDuration * 0.5;
    const driftRange = bufferDuration * 0.4 * drift;
    let startPos = centerPos + (Math.random() - 0.5) * 2 * driftRange;
    startPos = Math.max(0, Math.min(startPos, Math.max(0.01, bufferDuration - grainDur / rate - 0.01)));
    const source = graph.context.createBufferSource();
    source.buffer = graph.sampleBuffer;
    source.playbackRate.value = rate;
    source.detune.value = current.grainPitch * 100 + (Math.random() - 0.5) * 20;
    const grainGain = graph.context.createGain();
    const peakLevel = 0.15 + Math.random() * 0.1;
    const attackTime = grainDur * 0.3;
    const releaseTime = grainDur * 0.3;
    grainGain.gain.setValueAtTime(0, startTime);
    grainGain.gain.linearRampToValueAtTime(peakLevel, startTime + attackTime);
    grainGain.gain.setValueAtTime(peakLevel, startTime + grainDur - releaseTime);
    grainGain.gain.linearRampToValueAtTime(0, startTime + grainDur);
    const grainFilter = graph.context.createBiquadFilter();
    grainFilter.type = 'lowpass';
    grainFilter.frequency.value = 800 + Math.random() * 1500;
    grainFilter.Q.value = 1 + Math.random() * 2;
    source.connect(grainFilter);
    grainFilter.connect(grainGain);
    grainGain.connect(graph.sampleGain);
    source.start(startTime, startPos, grainDur / rate + 0.1);
    source.stop(startTime + grainDur + 0.1);
    source.onended = () => {
      try { source.disconnect(); } catch {}
      try { grainFilter.disconnect(); } catch {}
      try { grainGain.disconnect(); } catch {}
    };
  }, []);

  const scheduleNextGrain = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || !graph.sampleBuffer || !runningRef.current) return;
    if (pausedRef.current) { graph.granularTimer = window.setTimeout(scheduleNextGrain, 500); return; }
    const current = sampleSettingsRef.current;
    const now = graph.context.currentTime;
    for (let index = 0; index < current.grainDensity; index += 1) {
      scheduleGrain(now + (index / current.grainDensity) * (current.grainSize * 0.5));
    }
    const interval = (current.grainSize / current.grainRate) * 500;
    graph.granularTimer = window.setTimeout(scheduleNextGrain, Math.max(interval, 200));
  }, [scheduleGrain]);

  const startGranular = useCallback(() => {
    stopGranular();
    scheduleNextGrain();
    setSampleStatus('Granular');
  }, [scheduleNextGrain, stopGranular]);

  const stopLoop = useCallback(() => {
    const graph = graphRef.current;
    if (graph?.loopSource) {
      try { graph.loopSource.stop(); } catch {}
      try { graph.loopSource.disconnect(); } catch {}
      graph.loopSource = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || !graph.sampleBuffer) return;
    stopLoop();
    const current = sampleSettingsRef.current;
    const source = graph.context.createBufferSource();
    source.buffer = graph.sampleBuffer;
    source.loop = true;
    source.playbackRate.value = current.grainRate;
    source.detune.value = current.grainPitch * 100;
    source.connect(graph.sampleGain);
    source.start();
    graph.loopSource = source;
    setSampleStatus('Loop');
  }, [stopLoop]);

  const startSampleEngine = useCallback(() => {
    if (sampleMode === 'granular') startGranular(); else startLoop();
  }, [sampleMode, startGranular, startLoop]);

  const stopSampleEngine = useCallback(() => {
    stopGranular();
    stopLoop();
  }, [stopGranular, stopLoop]);

  const handleSampleFile = useCallback(async (file: File) => {
    setSampleError(null);
    try {
      const graph = await ensureAudio();
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await graph.context.decodeAudioData(arrayBuffer);
      graph.sampleBuffer = decoded;
      setSampleName(file.name);
      const minutes = Math.floor(decoded.duration / 60);
      const seconds = Math.floor(decoded.duration % 60);
      setSampleMeta(`${decoded.sampleRate} Hz • ${decoded.numberOfChannels}ch • ${minutes}:${String(seconds).padStart(2, '0')} • ${decoded.duration.toFixed(1)}s`);
      setSampleLoaded(true);
      setSampleStatus('Loaded');
      if (sampleMode === 'granular') startGranular(); else startLoop();
    } catch {
      setSampleError("Couldn't decode that audio file — try a WAV, MP3, OGG, FLAC, or M4A.");
    }
  }, [ensureAudio, sampleMode, startGranular, startLoop]);

  const removeSample = useCallback(() => {
    stopSampleEngine();
    const graph = graphRef.current;
    if (graph) graph.sampleBuffer = null;
    setSampleLoaded(false);
    setSampleName('');
    setSampleMeta('');
    setSampleStatus('None');
    setSampleError(null);
  }, [stopSampleEngine]);

  const chooseSampleMode = useCallback((mode: SampleMode) => {
    setSampleMode(mode);
    if (sampleLoaded) {
      if (mode === 'granular') { stopLoop(); startGranular(); } else { stopGranular(); startLoop(); }
    }
  }, [sampleLoaded, startGranular, startLoop, stopGranular, stopLoop]);

  const toggleSampleThroughFx = useCallback(() => {
    setSampleThroughFx((previous) => {
      const next = !previous;
      const graph = graphRef.current;
      if (graph) {
        try { graph.sampleFilter.disconnect(); } catch {}
        if (next) {
          graph.sampleFilter.connect(graph.droneDry);
          graph.sampleFilter.connect(graph.droneReverbPreDelay);
          graph.sampleFilter.connect(graph.droneDelay);
        } else {
          graph.sampleFilter.connect(graph.master);
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.context.currentTime;
    graph.sampleGain.gain.setTargetAtTime(sampleSettings.grainVolume * 0.4, now, 0.05);
    if (graph.loopSource) {
      graph.loopSource.playbackRate.setTargetAtTime(sampleSettings.grainRate, now, 0.1);
      graph.loopSource.detune.setTargetAtTime(sampleSettings.grainPitch * 100, now, 0.1);
    }
  }, [sampleSettings]);

  // ── Audio Input: mic recording — capture a short sound/vocal take and
  // decode it into the same sampleBuffer a dropped file would use ─────

  const loadRecordedBlob = useCallback(async (blob: Blob) => {
    setMicState('processing');
    try {
      const graph = await ensureAudio();
      const arrayBuffer = await blob.arrayBuffer();
      const decoded = await graph.context.decodeAudioData(arrayBuffer);
      graph.sampleBuffer = decoded;
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setSampleName(`Voice recording — ${timestamp}`);
      const minutes = Math.floor(decoded.duration / 60);
      const seconds = Math.floor(decoded.duration % 60);
      setSampleMeta(`${decoded.sampleRate} Hz • ${decoded.numberOfChannels}ch • ${minutes}:${String(seconds).padStart(2, '0')} • ${decoded.duration.toFixed(1)}s`);
      setSampleLoaded(true);
      setSampleStatus('Loaded');
      setSampleError(null);
      if (sampleMode === 'granular') startGranular(); else startLoop();
    } catch {
      setMicError("Couldn't process that recording — try again.");
    } finally {
      setMicState('idle');
    }
  }, [ensureAudio, sampleMode, startGranular, startLoop]);

  const updateMicTime = useCallback(() => {
    const elapsed = Math.floor((Date.now() - micStartRef.current) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    setMicTime(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    if (elapsed >= MIC_MAX_SECONDS) micStopRef.current();
  }, []);

  const stopMicRecording = useCallback(() => {
    const recorder = micRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  }, []);

  useEffect(() => { micStopRef.current = stopMicRecording; }, [stopMicRecording]);

  const startMicRecording = useCallback(async () => {
    setMicError(null);
    if (micState !== 'idle') return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicError("This browser doesn't support microphone recording.");
      return;
    }
    setMicState('requesting');
    try {
      await ensureAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      micChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) micChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        if (micTickRef.current) { window.clearInterval(micTickRef.current); micTickRef.current = null; }
        stream.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
        const blob = new Blob(micChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        micChunksRef.current = [];
        void loadRecordedBlob(blob);
      };
      micRecorderRef.current = recorder;
      recorder.start();
      micStartRef.current = Date.now();
      setMicTime('00:00');
      setMicState('recording');
      micTickRef.current = window.setInterval(updateMicTime, 250);
    } catch {
      setMicState('idle');
      setMicError("Couldn't access the microphone — check your browser's permission settings.");
    }
  }, [micState, ensureAudio, updateMicTime, loadRecordedBlob]);

  const toggleMicRecording = useCallback(() => {
    if (micState === 'recording') stopMicRecording(); else void startMicRecording();
  }, [micState, stopMicRecording, startMicRecording]);

  // ── Record & Export: capture the master mix and encode to MP3 ──

  const updateRecordTime = useCallback(() => {
    const elapsed = Math.floor((Date.now() - recordStartRef.current) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    setRecordTime(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
  }, []);

  const encodeAndDownload = useCallback(async () => {
    const graph = graphRef.current;
    if (!graph) return;
    try {
      const totalLength = recordedLeftRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
      const leftData = new Float32Array(totalLength);
      const rightData = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of recordedLeftRef.current) { leftData.set(chunk, offset); offset += chunk.length; }
      offset = 0;
      for (const chunk of recordedRightRef.current) { rightData.set(chunk, offset); offset += chunk.length; }
      recordedLeftRef.current = [];
      recordedRightRef.current = [];

      // lamejs ships no TypeScript types, and it's dynamically imported so it
      // never has to load until someone actually exports a recording.
      // @ts-expect-error lamejs has no type declarations
      const lameImport = (await import('lamejs')) as unknown as LameModule & { default?: LameModule };
      const Mp3Encoder = lameImport.Mp3Encoder ?? lameImport.default?.Mp3Encoder;
      if (!Mp3Encoder) throw new Error('MP3 encoder unavailable');
      const encoder = new Mp3Encoder(2, graph.context.sampleRate, 128);
      const mp3Data: Uint8Array[] = [];
      const blockSize = 1152;
      for (let index = 0; index < leftData.length; index += blockSize) {
        const leftChunk = floatTo16BitPCM(leftData.subarray(index, index + blockSize));
        const rightChunk = floatTo16BitPCM(rightData.subarray(index, index + blockSize));
        const buffer = encoder.encodeBuffer(leftChunk, rightChunk);
        if (buffer.length > 0) mp3Data.push(new Uint8Array(buffer));
      }
      const tail = encoder.flush();
      if (tail.length > 0) mp3Data.push(new Uint8Array(tail));

      const blob = new Blob(mp3Data as BlobPart[], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      link.download = `drone-engine-${timestamp}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setRecordStatus(`Exported ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
      setRecordTime('00:00');
    } catch (error) {
      setRecordStatus(`Export failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }, []);

  const stopRecording = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || !graph.recordProcessor) return;
    if (recordTickRef.current) { window.clearInterval(recordTickRef.current); recordTickRef.current = null; }
    const processor = graph.recordProcessor;
    try { graph.master.disconnect(); } catch {}
    try { processor.disconnect(); } catch {}
    graph.master.connect(graph.toneHigh);
    graph.recordProcessor = null;
    setIsRecording(false);
    setRecordStatus('Encoding MP3…');
    window.setTimeout(() => { void encodeAndDownload(); }, 50);
  }, [encodeAndDownload]);

  const startRecording = useCallback(async () => {
    const graph = await ensureAudio();
    if (graph.recordProcessor) return;
    const bufferSize = 4096;
    const processor = graph.context.createScriptProcessor(bufferSize, 2, 2);
    recordedLeftRef.current = [];
    recordedRightRef.current = [];
    processor.onaudioprocess = (event) => {
      const leftIn = event.inputBuffer.getChannelData(0);
      const rightIn = event.inputBuffer.getChannelData(1);
      recordedLeftRef.current.push(new Float32Array(leftIn));
      recordedRightRef.current.push(new Float32Array(rightIn));
      // Pass the signal straight through so recording never mutes playback.
      event.outputBuffer.getChannelData(0).set(leftIn);
      event.outputBuffer.getChannelData(1).set(rightIn);
    };
    graph.master.disconnect();
    graph.master.connect(processor);
    processor.connect(graph.toneHigh);
    graph.recordProcessor = processor;
    recordStartRef.current = Date.now();
    setIsRecording(true);
    setRecordStatus('Recording');
    setRecordTime('00:00');
    recordTickRef.current = window.setInterval(updateRecordTime, 100);
  }, [ensureAudio, updateRecordTime]);

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording(); else void startRecording();
  }, [isRecording, startRecording, stopRecording]);

  // ── Pulse: ratio-timed soft sub thump ───────────────────────────

  const triggerPulseHit = useCallback((depth: number) => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.context.currentTime;
    const peak = 0.08 + (depth / 100) * 0.22;
    graph.pulseGain.gain.cancelScheduledValues(now);
    graph.pulseGain.gain.setValueAtTime(graph.pulseGain.gain.value, now);
    graph.pulseGain.gain.linearRampToValueAtTime(peak, now + 0.012);
    graph.pulseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
  }, []);

  const schedulePulse = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || pulsePattern === 'off' || !runningRef.current) return;
    const pattern = pulsePatterns[pulsePattern];
    const step = pattern[graph.pulseStep % pattern.length];
    triggerPulseHit(pulseDepth);
    graph.pulseStep += 1;
    graph.pulseTimer = window.setTimeout(schedulePulse, step * pulseSpeed * 1000);
  }, [pulsePattern, pulseDepth, pulseSpeed, triggerPulseHit]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    if (graph.pulseTimer) { window.clearTimeout(graph.pulseTimer); graph.pulseTimer = null; }
    if (pulsePattern !== 'off' && runningRef.current) {
      graph.pulseStep = 0;
      schedulePulse();
    }
    return () => {
      if (graph.pulseTimer) { window.clearTimeout(graph.pulseTimer); graph.pulseTimer = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulsePattern, running]);

  // ── Wander: slow macro drift across reverb / brightness / width ─

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.context.currentTime;
    graph.wanderLfo.frequency.setTargetAtTime(wanderSpeed, now, 2);
    const depth = wanderOn ? wanderDepth / 100 : 0;
    graph.wanderReverbGain.gain.setTargetAtTime(depth * 0.18, now, 1.5);
    graph.wanderToneGain.gain.setTargetAtTime(depth * 2600, now, 1.5);
    graph.wanderChorusGain.gain.setTargetAtTime(depth * 0.05, now, 1.5);
  }, [wanderOn, wanderSpeed, wanderDepth]);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context2d = canvas.getContext('2d');
    if (!context2d) return;
    let frame = 0;
    const draw = () => {
      const graph = graphRef.current;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
      }
      const canvasW = canvas.width;
      const canvasH = canvas.height;
      context2d.fillStyle = 'rgba(10, 10, 15, 0.15)';
      context2d.fillRect(0, 0, canvasW, canvasH);
      if (graph) {
        const bufferLength = graph.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        graph.analyser.getByteFrequencyData(dataArray);
        const barCount = 64;
        const barWidth = canvasW / barCount;
        for (let index = 0; index < barCount; index += 1) {
          const dataIndex = Math.floor(index * bufferLength / barCount);
          const value = dataArray[dataIndex] / 255;
          const barHeight = value * canvasH * 0.8;
          const hue = index / barCount;
          let r; let g; let b;
          if (hue < 0.5) {
            r = 108 + (50 - 108) * (hue * 2);
            g = 92 + (80 - 92) * (hue * 2);
            b = 231;
          } else {
            r = 50 + (225 - 50) * ((hue - 0.5) * 2);
            g = 80 + (112 - 80) * ((hue - 0.5) * 2);
            b = 231 + (85 - 231) * ((hue - 0.5) * 2);
          }
          const alpha = 0.3 + value * 0.7;
          context2d.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          context2d.fillRect(index * barWidth, canvasH - barHeight, barWidth - 2, barHeight);
          if (value > 0.5) {
            context2d.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
            context2d.fillRect(index * barWidth, 0, barWidth - 2, canvasH);
          }
        }
      }
      frame = window.requestAnimationFrame(draw);
    };
    draw();
    return () => window.cancelAnimationFrame(frame);
  }, [started]);

  const onDropZoneDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) void handleSampleFile(file);
  }, [handleSampleFile]);

  const status = paused ? 'Paused' : running ? 'Generating' : 'Standby';

  return (
    <div className="container">
      <header>
        <h1>Drone Engine</h1>
        <p>SELF-GENERATING AMBIENT SOUNDSCAPES</p>
      </header>

      {!started && (
        <div className="start-screen">
          <button className="start-btn" type="button" disabled={starting} onClick={() => { void startEngine(); }}>{starting ? 'Loading...' : 'BEGIN'}</button>
          <p className="start-hint">Click to start audio. Best with headphones.</p>
        </div>
      )}

      {started && (
        <div className="interface">
          <div className="visualizer-wrap">
            <div className="viz-label">Spectrum</div>
            <div className={`viz-status${isRecording ? ' recording' : ''}`}>{isRecording ? 'Recording' : status}</div>
            <canvas ref={canvasRef} aria-label="Live drone spectrum visualizer" />
          </div>

          <div className="now-playing">
            Active voices: <strong>{voiceCount}</strong> &nbsp;|&nbsp; Notes:{' '}
            {notes.length
              ? notes.map((note, index) => <span key={`${note}-${index}`} className="note-display active">{note}</span>)
              : <span className="notes-empty">—</span>}
            &nbsp;|&nbsp; Sample: <strong>{sampleStatus}</strong>
          </div>

          <div className={`record-bar${isRecording ? ' recording' : ''}`}>
            <button className={`btn btn-danger${isRecording ? ' recording' : ''}`} type="button" onClick={toggleRecording}>{isRecording ? 'Stop & Export' : 'Record'}</button>
            <span className="record-time">{recordTime}</span>
            <span className="record-status">{recordStatus}</span>
            <div style={{ flex: 1 }} />
            <span className="record-hint">Records the full mix as MP3 — synth + sample drone</span>
          </div>

          <div className="controls">
            <div className="panel panel-full">
              <h3>Audio Input — Feed Your Own Sound</h3>
              <div
                className={`drop-zone${isDragging ? ' dragging' : ''}`}
                onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={(event) => { event.preventDefault(); setIsDragging(false); }}
                onDrop={onDropZoneDrop}
                style={{ display: sampleLoaded ? 'none' : 'block' }}
              >
                <div className="drop-zone-icon">⊕</div>
                <div className="drop-zone-text">Drop an audio file here or click to browse</div>
                <div className="drop-zone-hint">WAV, MP3, OGG, FLAC, M4A — any audio becomes a drone</div>
                <input type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleSampleFile(file); }} />
              </div>

              {!sampleLoaded && (
                <div className="mic-record-row">
                  <button
                    className={`btn${micState === 'recording' ? ' btn-danger recording' : ''}`}
                    type="button"
                    disabled={micState === 'requesting' || micState === 'processing'}
                    onClick={toggleMicRecording}
                  >
                    {micState === 'recording' ? `⏹ Stop Recording (${micTime})`
                      : micState === 'requesting' ? 'Requesting mic…'
                      : micState === 'processing' ? 'Processing…'
                      : '🎙 Record Voice / Sound'}
                  </button>
                  <span className="mic-hint">Records up to {MIC_MAX_SECONDS}s from your mic and feeds it into the drone, same as a dropped file.</span>
                  {micError && <div className="voice-error">{micError}</div>}
                </div>
              )}

              {sampleLoaded && (
                <div className="sample-loaded active">
                  <div className="sample-info">
                    <div className="sample-info-icon">♪</div>
                    <div className="sample-info-text">
                      <div className="sample-info-name">{sampleName}</div>
                      <div className="sample-info-meta">{sampleMeta}</div>
                    </div>
                    <button className="btn btn-warm" type="button" style={{ padding: '6px 14px', fontSize: 11 }} onClick={removeSample}>Remove</button>
                  </div>

                  <div className="sample-grain-controls">
                    <div>
                      <div className="slider-group">
                        <div className="slider-label"><span>Playback rate</span><span>{sampleSettings.grainRate.toFixed(2)}×</span></div>
                        <input type="range" min="0.1" max="2" step="0.05" value={sampleSettings.grainRate} onChange={(event) => updateSampleSetting('grainRate', Number(event.target.value))} />
                      </div>
                      <div className="slider-group">
                        <div className="slider-label"><span>Pitch shift</span><span>{sampleSettings.grainPitch > 0 ? '+' : ''}{sampleSettings.grainPitch} st</span></div>
                        <input type="range" min="-24" max="12" step="1" value={sampleSettings.grainPitch} onChange={(event) => updateSampleSetting('grainPitch', Number(event.target.value))} />
                      </div>
                      <div className="slider-group">
                        <div className="slider-label"><span>Sample volume</span><span>{Math.round(sampleSettings.grainVolume * 100)}%</span></div>
                        <input type="range" min="0" max="100" step="1" value={sampleSettings.grainVolume * 100} onChange={(event) => updateSampleSetting('grainVolume', Number(event.target.value) / 100)} />
                      </div>
                    </div>
                    <div>
                      <div className="slider-group">
                        <div className="slider-label"><span>Grain size</span><span>{sampleSettings.grainSize.toFixed(1)} s</span></div>
                        <input type="range" min="0.1" max="10" step="0.1" value={sampleSettings.grainSize} onChange={(event) => updateSampleSetting('grainSize', Number(event.target.value))} />
                      </div>
                      <div className="slider-group">
                        <div className="slider-label"><span>Position drift</span><span>{Math.round(sampleSettings.grainDrift * 100)}%</span></div>
                        <input type="range" min="0" max="100" step="1" value={sampleSettings.grainDrift * 100} onChange={(event) => updateSampleSetting('grainDrift', Number(event.target.value) / 100)} />
                      </div>
                      <div className="slider-group">
                        <div className="slider-label"><span>Grain density</span><span>{sampleSettings.grainDensity} grains</span></div>
                        <input type="range" min="1" max="8" step="1" value={sampleSettings.grainDensity} onChange={(event) => updateSampleSetting('grainDensity', Number(event.target.value))} />
                      </div>
                    </div>
                  </div>

                  <div className="btn-row">
                    <button className={`btn${sampleMode === 'granular' ? ' active' : ''}`} type="button" onClick={() => chooseSampleMode('granular')}>Granular Mode</button>
                    <button className={`btn${sampleMode === 'loop' ? ' active' : ''}`} type="button" onClick={() => chooseSampleMode('loop')}>Simple Loop Mode</button>
                    <button className={`btn${sampleThroughFx ? ' active' : ''}`} type="button" onClick={toggleSampleThroughFx}>Through FX Chain</button>
                  </div>
                  <div className="sample-help">
                    <strong>Granular</strong>: chops audio into overlapping grains for evolving texture.{' '}
                    <strong>Loop</strong>: plays the sample as a continuous slowed-down loop.{' '}
                    <strong>Through FX</strong>: routes the sample through the reverb/delay/filter chain below.
                  </div>
                  {sampleError && <div className="voice-error">{sampleError}</div>}
                </div>
              )}
              {!sampleLoaded && sampleError && <div className="voice-error">{sampleError}</div>}
            </div>

            <div className="panel">
              <h3>Tone</h3>
              <div className="slider-group">
                <div className="slider-label"><span>Base pitch</span><span>{settings.basePitch} Hz</span></div>
                <input type="range" min="27" max="110" step="1" value={settings.basePitch} onChange={(event) => updateSetting('basePitch', Number(event.target.value))} />
              </div>
              <div className="slider-group">
                <div className="slider-label"><span>Detune spread</span><span>{settings.detuneCents} cents</span></div>
                <input type="range" min="0" max="30" step="1" value={settings.detuneCents} onChange={(event) => updateSetting('detuneCents', Number(event.target.value))} />
              </div>
              <div className="slider-group">
                <div className="slider-label"><span>Oscillators</span><span>{settings.oscCount}</span></div>
                <input type="range" min="2" max="8" step="1" value={settings.oscCount} onChange={(event) => updateSetting('oscCount', Number(event.target.value))} />
              </div>
              <div className="slider-group">
                <div className="slider-label"><span>Waveform</span></div>
                <div className="btn-row">
                  {waveformOptions.map((option) => (
                    <button key={option.value} type="button" className={`btn${settings.waveform === option.value ? ' active' : ''}`} onClick={() => updateSetting('waveform', option.value)}>{option.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel">
              <h3>Modulation</h3>
              <div className="slider-group">
                <div className="slider-label"><span>Filter sweep speed</span><span>{formatHertz(settings.filterRate)} Hz</span></div>
                <input type="range" min="0.005" max="0.5" step="0.005" value={settings.filterRate} onChange={(event) => updateSetting('filterRate', Number(event.target.value))} />
              </div>
              <div className="slider-group">
                <div className="slider-label"><span>Filter depth</span><span>{Math.round(settings.filterDepth * 100)}%</span></div>
                <input type="range" min="0" max="100" step="1" value={settings.filterDepth * 100} onChange={(event) => updateSetting('filterDepth', Number(event.target.value) / 100)} />
              </div>
              <div className="slider-group">
                <div className="slider-label"><span>Pitch drift</span><span>{Math.round(settings.pitchDrift * 100)}%</span></div>
                <input type="range" min="0" max="50" step="1" value={settings.pitchDrift * 100} onChange={(event) => updateSetting('pitchDrift', Number(event.target.value) / 100)} />
              </div>
              <div className="slider-group">
                <div className="slider-label"><span>Volume swell</span><span>{Math.round(settings.volLfoDepth * 100)}%</span></div>
                <input type="range" min="0" max="80" step="1" value={settings.volLfoDepth * 100} onChange={(event) => updateSetting('volLfoDepth', Number(event.target.value) / 100)} />
              </div>
            </div>

            <div className="panel">
              <h3>Space</h3>
              <div className="slider-group">
                <div className="slider-label"><span>Reverb</span><span>{Math.round(settings.reverbAmount * 100)}%</span></div>
                <input type="range" min="0" max="100" step="1" value={settings.reverbAmount * 100} onChange={(event) => updateSetting('reverbAmount', Number(event.target.value) / 100)} />
              </div>
              <div className="slider-group">
                <div className="slider-label"><span>Delay</span><span>{Math.round(settings.delayAmount * 100)}%</span></div>
                <input type="range" min="0" max="100" step="1" value={settings.delayAmount * 100} onChange={(event) => updateSetting('delayAmount', Number(event.target.value) / 100)} />
              </div>
              <div className="slider-group">
                <div className="slider-label"><span>Delay time</span><span>{settings.delayTime.toFixed(1)} s</span></div>
                <input type="range" min="0.1" max="3" step="0.1" value={settings.delayTime} onChange={(event) => updateSetting('delayTime', Number(event.target.value))} />
              </div>
              <div className="slider-group">
                <div className="slider-label"><span>Master volume</span><span>{Math.round(settings.masterVolume * 100)}%</span></div>
                <input type="range" min="0" max="100" step="1" value={settings.masterVolume * 100} onChange={(event) => updateSetting('masterVolume', Number(event.target.value) / 100)} />
              </div>
            </div>

            <div className="panel panel-full">
              <h3>Scale &amp; Generation</h3>
              <div className="scale-row" style={{ marginBottom: 16 }}>
                {(Object.keys(droneScales) as DroneScaleName[]).map((name) => (
                  <button key={name} type="button" className={`scale-btn${settings.scale === name ? ' active' : ''}`} onClick={() => updateSetting('scale', name)}>{droneScales[name].label}</button>
                ))}
              </div>
              <div className="slider-group">
                <div className="slider-label"><span>Generation speed (new note interval)</span><span>{settings.genSpeed} s</span></div>
                <input type="range" min="2" max="30" step="1" value={settings.genSpeed} onChange={(event) => updateSetting('genSpeed', Number(event.target.value))} />
              </div>
              <div className="slider-group">
                <div className="slider-label"><span>Max voices</span><span>{settings.maxVoices}</span></div>
                <input type="range" min="1" max="12" step="1" value={settings.maxVoices} onChange={(event) => updateSetting('maxVoices', Number(event.target.value))} />
              </div>
              <div className="btn-row" style={{ marginTop: 16 }}>
                <button className={`btn${paused ? ' active' : ''}`} type="button" onClick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>
                <button className="btn" type="button" onClick={newSeed}>New Seed</button>
                <button className="btn btn-warm" type="button" onClick={releaseAll}>Stop All</button>
              </div>
            </div>

            <div className="panel panel-full">
              <h3>Pulse &amp; Wander</h3>
              <div className="pulse-wander-grid">
                <div>
                  <div className="slider-label" style={{ marginBottom: 8 }}><span>Pulse — a soft, unevenly-timed sub thump</span></div>
                  <div className="scale-row" style={{ marginBottom: 16 }}>
                    <button type="button" className={`scale-btn${pulsePattern === 'off' ? ' active' : ''}`} onClick={() => setPulsePattern('off')}>Off</button>
                    <button type="button" className={`scale-btn${pulsePattern === 'steady' ? ' active' : ''}`} onClick={() => setPulsePattern('steady')}>Steady</button>
                    <button type="button" className={`scale-btn${pulsePattern === 'doom' ? ' active' : ''}`} onClick={() => setPulsePattern('doom')}>Doom</button>
                    <button type="button" className={`scale-btn${pulsePattern === 'sparse' ? ' active' : ''}`} onClick={() => setPulsePattern('sparse')}>Sparse</button>
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Pulse speed</span><span>{pulseSpeed.toFixed(1)} s/step</span></div>
                    <input type="range" min="0.5" max="4" step="0.1" value={pulseSpeed} onChange={(event) => setPulseSpeed(Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Pulse depth</span><span>{pulseDepth}%</span></div>
                    <input type="range" min="0" max="100" step="1" value={pulseDepth} onChange={(event) => setPulseDepth(Number(event.target.value))} />
                  </div>
                </div>
                <div>
                  <div className="slider-label" style={{ marginBottom: 8 }}><span>Wander — a slow drift through the room</span></div>
                  <div className="btn-row" style={{ marginBottom: 16 }}>
                    <button type="button" className={`btn${wanderOn ? ' active' : ''}`} onClick={() => setWanderOn((previous) => !previous)}>{wanderOn ? 'Wandering' : 'Wander Off'}</button>
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Wander speed</span><span>{formatHertz(wanderSpeed)} Hz</span></div>
                    <input type="range" min="0.004" max="0.08" step="0.001" value={wanderSpeed} onChange={(event) => setWanderSpeed(Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Wander depth</span><span>{wanderDepth}%</span></div>
                    <input type="range" min="0" max="100" step="1" value={wanderDepth} onChange={(event) => setWanderDepth(Number(event.target.value))} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="info">
            Built with Web Audio API. Uses incommensurable timing, detuned oscillators, slow LFOs, granular synthesis, and procedural reverb.
            Drop in a sound file or record your voice straight from the mic to weave it into the drone, and record the whole mix out as an MP3.
            Inspired by Brian Eno&apos;s generative music systems. Every session sounds different.
          </div>
        </div>
      )}
    </div>
  );
}
