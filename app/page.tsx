'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { composeMelody, mutateComposition } from './melodic-engine';
import type { ComposerSettings, MelodyComposition, MelodyContour, MelodyMode, MelodyNote, MelodyProgression } from './melodic-engine';

type DroneScaleName = 'minor' | 'dorian' | 'phrygian' | 'pentaMinor' | 'pentaMajor' | 'wholeTone' | 'harmonicMinor' | 'lydian';
type ModulationShape = 'sine' | 'random';
type NoiseColor = 'brown' | 'pink' | 'white';
type SampleMode = 'granular' | 'loop';
type PulsePattern = 'off' | 'steady' | 'doom' | 'sparse';
type TechnoPresetName = 'classic' | 'detroit' | 'hardgroove' | 'rumble' | 'broken';
type TechnoSettings = { bpm: number; hatDensity: number; snareDensity: number; tomActivity: number; evolveBars: number; volume: number; hatPulses: number; snarePulses: number; tomPulses: number; humanize: number; swing: number; kickMode: 'four' | 'broken' };
type TechnoPattern = { kicks: Set<number>; hats: Set<number>; snares: Set<number>; ghostSnares: Set<number>; toms: Set<number>; hatChance: number };
type MelodySettings = ComposerSettings & { enabled: boolean; composerEnabled: boolean; root: number; density: number; evolveBars: number; brightness: number; volume: number; duck: boolean; duckDepth: number; duckRelease: number; tranceGate: boolean; gateDepth: number; gatePattern: 'quarter' | 'eighth' | 'sixteenth' | 'pulse' };
type DroneSettings = { basePitch: number; detuneCents: number; oscCount: number; waveform: OscillatorType; modulationShape: ModulationShape; filterRate: number; filterDepth: number; pitchDrift: number; volLfoDepth: number; panDepth: number; noiseColor: NoiseColor; noiseAmount: number; reverbAmount: number; delayAmount: number; delayTime: number; delayFeedback: number; chorusAmount: number; driveAmount: number; masterVolume: number; scale: DroneScaleName; genSpeed: number; maxVoices: number; kickSpace: boolean; kickDuckDepth: number; kickDuckRelease: number; kickBassDuckDepth: number; kickBassDuckRelease: number; kickBassSplit: number; synthLowCut: number; synthHighCut: number; synthCompThreshold: number; synthCompRatio: number; synthLimiterCeiling: number; drumDriveAmount: number; drumCompThreshold: number; drumCompRatio: number; drumLimiterCeiling: number; eqLowGain: number; eqMidGain: number; eqHighGain: number; masterSaturation: number; compThreshold: number; compRatio: number; compAttack: number; compRelease: number; limiterCeiling: number };
type DroneVoiceNode = { noteName: string; semitone: number; oscillators: Array<{ osc: OscillatorNode; gain: GainNode }>; subOsc: OscillatorNode; subGain: GainNode; airOsc: OscillatorNode; airGain: GainNode; voiceGain: GainNode; filter: BiquadFilterNode; panner: StereoPannerNode; filterLfo: OscillatorNode; filterLfoGain: GainNode; pitchLfo: OscillatorNode; pitchLfoGain: GainNode; volLfo: OscillatorNode; volLfoGain: GainNode; panLfo: OscillatorNode; panLfoGain: GainNode; randomInterval: number | null };
type SampleSettings = { grainRate: number; grainPitch: number; grainVolume: number; grainSize: number; grainDrift: number; grainDensity: number };
type PatchCables = { toneToMod: boolean; modToSpace: boolean; spaceToTone: boolean };
type VocalSettings = { pitch: number; formant: number; tube: number };
type MidiMode = 'off' | 'trigger' | 'root';
type MidiInputPort = { index: number; name: string };
type MidiMessage = { messageType: 'noteOn' | 'noteOff' | 'clock' | 'start' | 'continue' | 'stop'; channel: number | null; note: number | null; velocity: number | null };
type MidiStatus = { state: 'connected' | 'disconnected' | 'error'; message: string };
type LiveVoice = { oscillators: OscillatorNode[]; subOsc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode; panner: StereoPannerNode };
type PerformanceMacros = { bloom: number; weight: number; motion: number; distance: number };
type AcidSettings = { enabled: boolean; cutoff: number; resonance: number; drive: number; octave: number; accent: number; steps: boolean[]; accents: boolean[] };
type LiveGrid = { kicks: boolean[]; hats: boolean[]; snares: boolean[]; toms: boolean[] };
type ArtistSceneId = 'longBlend' | 'redline' | 'orbit' | 'reduction' | 'peakPressure';
type ArtistScene = { id: ArtistSceneId; artist: string; title: string; description: string; settings: Partial<DroneSettings>; techno: Partial<TechnoSettings>; melody: Partial<MelodySettings>; macros: Partial<PerformanceMacros>; acid: Partial<AcidSettings>; rumble: RumbleDna; ritual: number };
type GestureFrame = { at: number; macros: PerformanceMacros };
type MixerChannelId = 'drone' | 'machine' | 'melody' | 'acid' | 'input' | 'pulse' | 'ritual' | 'master';
type MixerChannelSetting = { volume: number; muted: boolean; low: number; mid: number; high: number };
type MixerSettings = Record<MixerChannelId, MixerChannelSetting>;
type MixerChannelNodes = { input: GainNode; low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode; output: GainNode };
type MasterMeter = { compressor: number; limiter: number };
type RumbleDna = 'cavern' | 'metal' | 'dust' | 'sub';
type AfterimageSettings = { enabled: boolean; memory: number; erosion: number; mutation: number };
type FrozenVoice = LiveVoice;
type PerformanceScene = {
  settings: DroneSettings; macros: PerformanceMacros; harmonicGravity: number;
  pulsePattern: PulsePattern; pulseSpeed: number; pulseDepth: number;
  wanderOn: boolean; wanderSpeed: number; wanderDepth: number;
  patchCables: PatchCables; sampleSettings: SampleSettings; sampleMode: SampleMode; sampleThroughFx: boolean;
};
type Graph = {
  context: AudioContext; master: GainNode; toneHigh: BiquadFilterNode; toneLow: BiquadFilterNode; masterDrive: WaveShaperNode; compressor: DynamicsCompressorNode; analyser: AnalyserNode;
  eqLow: BiquadFilterNode; eqMid: BiquadFilterNode; eqHigh: BiquadFilterNode; limiter: DynamicsCompressorNode;
  droneMaster: GainNode; droneBus: GainNode; synthBus: GainNode; synthBassFilter: BiquadFilterNode; synthBassDuckGain: GainNode; synthPresenceFilter: BiquadFilterNode; synthMixBus: GainNode; synthDuckGain: GainNode; synthLowCut: BiquadFilterNode; synthHighCut: BiquadFilterNode; synthCompressor: DynamicsCompressorNode; synthLimiter: DynamicsCompressorNode; droneDrive: WaveShaperNode; droneChorusDry: GainNode; droneChorusDelay: DelayNode; droneChorusWet: GainNode; droneChorusLfo: OscillatorNode; droneChorusDepth: GainNode;
  drumBus: GainNode; drumDrive: WaveShaperNode; drumCompressor: DynamicsCompressorNode; drumLimiter: DynamicsCompressorNode; technoGain: GainNode; melodyGain: GainNode; melodyDuckGain: GainNode; melodyGateGain: GainNode; rumbleSend: GainNode; rumbleReverb: ConvolverNode; rumbleFilter: BiquadFilterNode; rumbleGain: GainNode;
  droneDry: GainNode; droneReverb: ConvolverNode; droneReverbPreDelay: DelayNode; droneReverbWet: GainNode;
  droneDelay: DelayNode; droneDelayFilter: BiquadFilterNode; droneDelayFeedback: GainNode; droneDelayWet: GainNode;
  droneNoise: AudioBufferSourceNode; droneNoiseFilter: BiquadFilterNode; droneNoiseGain: GainNode;
  droneVoices: Map<number, DroneVoiceNode>;
  sampleGain: GainNode; sampleFilter: BiquadFilterNode; sampleFormantFilters: BiquadFilterNode[]; sampleTubeDrive: WaveShaperNode; sampleTubeTone: BiquadFilterNode; sampleBuffer: AudioBuffer | null; sampleOriginalBuffer: AudioBuffer | null; loopSource: AudioBufferSourceNode | null; granularTimer: number | null;
  recordProcessor: ScriptProcessorNode | null; ritualProcessor: ScriptProcessorNode;
  pulseOsc: OscillatorNode; pulseGain: GainNode; pulseFilter: BiquadFilterNode; pulseTimer: number | null; pulseStep: number;
  wanderLfo: OscillatorNode; wanderReverbGain: GainNode; wanderToneGain: GainNode; wanderChorusGain: GainNode;
  mixerChannels: Record<MixerChannelId, MixerChannelNodes>;
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
const freqForSemitone = (semitone: number) => 16.351 * Math.pow(2, semitone / 12);
const nameForSemitone = (semitone: number) => `${noteNames[((semitone % 12) + 12) % 12]}${Math.floor(semitone / 12)}`;
// Keyboard Play: two QWERTY rows mapped to ascending degrees of the current
// scale (never chromatic) — lower row one octave up from basePitch, upper
// row a further octave up, so nothing you play can land off-scale.
const keyboardRowLower = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
const keyboardRowUpper = ['w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
const keyboardKeyMap: Record<string, { degreeIndex: number; octaveOffset: number }> = {};
keyboardRowLower.forEach((key, index) => { keyboardKeyMap[key] = { degreeIndex: index, octaveOffset: 12 }; });
keyboardRowUpper.forEach((key, index) => { keyboardKeyMap[key] = { degreeIndex: index, octaveOffset: 24 }; });
const defaultDroneSettings: DroneSettings = {
  basePitch: 55, detuneCents: 7, oscCount: 5, waveform: 'sine', modulationShape: 'sine', filterRate: 0.05, filterDepth: 0.6,
  pitchDrift: 0.15, volLfoDepth: 0.3, panDepth: 0.35, noiseColor: 'brown', noiseAmount: 0.12,
  reverbAmount: 0.7, delayAmount: 0.4, delayTime: 0.8, delayFeedback: 0.45, chorusAmount: 0.18, driveAmount: 0.04,
  masterVolume: 0.5, scale: 'minor', genSpeed: 8, maxVoices: 6,
  // Keep subsonic build-up away from the kick by default. The synth bus,
  // including its reverb and delay returns, ducks independently of the kick.
  kickSpace: true, kickDuckDepth: 26, kickDuckRelease: 170, kickBassDuckDepth: 78, kickBassDuckRelease: 260, kickBassSplit: 180, synthLowCut: 34, synthHighCut: 9000,
  synthCompThreshold: -24, synthCompRatio: 3, synthLimiterCeiling: -2,
  drumDriveAmount: 0.1, drumCompThreshold: -15, drumCompRatio: 4, drumLimiterCeiling: -1,
  // Gentle mix-bus processing: preserve the kick transient, add a trace of
  // shared harmonic colour, and let the limiter catch only true overs.
  eqLowGain: -1, eqMidGain: 0, eqHighGain: 1, masterSaturation: 0.025, compThreshold: -12, compRatio: 2, compAttack: 0.03, compRelease: 0.25, limiterCeiling: -1,
};
const defaultSampleSettings: SampleSettings = { grainRate: 0.5, grainPitch: -12, grainVolume: 0.6, grainSize: 2.0, grainDrift: 0.3, grainDensity: 4 };
const defaultVocalSettings: VocalSettings = { pitch: 0, formant: 0, tube: 0 };
const defaultPerformanceMacros: PerformanceMacros = { bloom: 0, weight: 0, motion: 0, distance: 0 };
const defaultAfterimageSettings: AfterimageSettings = { enabled: true, memory: 62, erosion: 54, mutation: 38 };
const defaultTechnoSettings: TechnoSettings = { bpm: 132, hatDensity: 68, snareDensity: 32, tomActivity: 34, evolveBars: 8, volume: 56, hatPulses: 9, snarePulses: 1, tomPulses: 2, humanize: 9, swing: 0, kickMode: 'four' };
const defaultMelodySettings: MelodySettings = { enabled: true, composerEnabled: false, mode: 'hypnotic', phraseBars: 8, complexity: 46, repetition: 76, variation: 32, range: 2, contour: 'arch', progression: 'deep', noteLength: 48, root: 50, density: 48, evolveBars: 8, brightness: 36, volume: 32, duck: false, duckDepth: 62, duckRelease: 220, tranceGate: false, gateDepth: 88, gatePattern: 'eighth' };
const emptySteps = () => Array.from({ length: 16 }, () => false);
const defaultAcidSettings: AcidSettings = { enabled: false, cutoff: 42, resonance: 66, drive: 32, octave: 1, accent: 68, steps: [true, false, false, true, false, true, false, false, true, false, true, false, false, true, false, false], accents: [false, false, false, true, false, false, false, false, true, false, false, false, false, true, false, false] };
const defaultLiveGrid = (): LiveGrid => ({ kicks: emptySteps(), hats: emptySteps(), snares: emptySteps(), toms: emptySteps() });
const mixerChannelMeta: Array<{ id: MixerChannelId; label: string; color: string }> = [
  { id: 'drone', label: 'Drone', color: '#8d7cff' }, { id: 'machine', label: 'Machine', color: '#e17055' },
  { id: 'melody', label: 'Melody', color: '#6fc8ff' }, { id: 'acid', label: 'Acid', color: '#ffd166' },
  { id: 'input', label: 'Input', color: '#00b894' }, { id: 'pulse', label: 'Pulse', color: '#b7ef78' },
  { id: 'ritual', label: 'Ritual', color: '#f58ab3' }, { id: 'master', label: 'Master', color: '#ffffff' },
];
const defaultMixerChannel = (): MixerChannelSetting => ({ volume: 100, muted: false, low: 0, mid: 0, high: 0 });
const defaultMixerSettings = (): MixerSettings => Object.fromEntries(mixerChannelMeta.map(({ id }) => [id, { ...defaultMixerChannel(), volume: id === 'acid' ? defaultTechnoSettings.volume : 100 }])) as MixerSettings;
const artistScenes: Record<ArtistSceneId, ArtistScene> = {
  longBlend: { id: 'longBlend', artist: 'Carl Cox', title: 'The Long Blend', description: 'Layered groove, broad space, and patient transitions.', settings: { reverbAmount: 0.78, delayAmount: 0.48, chorusAmount: 0.26, driveAmount: 0.055, masterVolume: 0.56 }, techno: { bpm: 130, hatPulses: 9, snarePulses: 2, tomPulses: 2, hatDensity: 74, tomActivity: 38, swing: 13, volume: 66 }, melody: { enabled: true, mode: 'hypnotic', repetition: 82, variation: 24, contour: 'wave', progression: 'deep', density: 52, brightness: 44, volume: 42 }, macros: { bloom: 52, weight: 56, motion: 38, distance: 52 }, acid: { enabled: false }, rumble: 'cavern', ritual: 58 },
  redline: { id: 'redline', artist: 'Charlotte de Witte', title: 'Redline', description: 'Acid pressure and relentlessly rising tension.', settings: { reverbAmount: 0.44, delayAmount: 0.22, driveAmount: 0.11, filterRate: 0.1, filterDepth: 0.76, masterVolume: 0.58 }, techno: { bpm: 138, hatPulses: 12, snarePulses: 1, tomPulses: 2, hatDensity: 88, tomActivity: 44, evolveBars: 4, volume: 70 }, melody: { enabled: false, mode: 'callResponse', repetition: 86, variation: 28, contour: 'rise', progression: 'static' }, macros: { bloom: 18, weight: 78, motion: 68, distance: 18 }, acid: { enabled: true, cutoff: 64, resonance: 86, drive: 62, octave: 1, accent: 84 }, rumble: 'sub', ritual: 76 },
  orbit: { id: 'orbit', artist: 'Jeff Mills', title: 'Orbit', description: 'Fast machine dialogue, polyrhythm, and metallic futures.', settings: { reverbAmount: 0.32, delayAmount: 0.36, delayTime: 0.47, filterRate: 0.16, filterDepth: 0.82, pitchDrift: 0.38 }, techno: { bpm: 140, hatPulses: 11, snarePulses: 3, tomPulses: 4, hatDensity: 86, snareDensity: 52, tomActivity: 76, evolveBars: 2, humanize: 4, swing: 5, volume: 64 }, melody: { enabled: true, mode: 'arpeggio', complexity: 76, repetition: 54, variation: 62, contour: 'wave', progression: 'rising', density: 68, brightness: 74, volume: 38 }, macros: { bloom: 24, weight: 50, motion: 92, distance: 28 }, acid: { enabled: true, cutoff: 48, resonance: 72, drive: 38, octave: 2, accent: 72 }, rumble: 'metal', ritual: 66 },
  reduction: { id: 'reduction', artist: 'Richie Hawtin', title: 'Reduction', description: 'Less material, more movement: a recorded gesture becomes the arrangement.', settings: { reverbAmount: 0.56, delayAmount: 0.28, chorusAmount: 0.12, driveAmount: 0.035, filterRate: 0.04, filterDepth: 0.48 }, techno: { bpm: 128, hatPulses: 6, snarePulses: 1, tomPulses: 0, hatDensity: 62, snareDensity: 12, tomActivity: 8, evolveBars: 12, humanize: 2, swing: 0, volume: 52 }, melody: { enabled: false, mode: 'hypnotic', complexity: 24, repetition: 94, variation: 14, range: 1, contour: 'arch', progression: 'static' }, macros: { bloom: 42, weight: 40, motion: 32, distance: 48 }, acid: { enabled: false }, rumble: 'dust', ritual: 44 },
  peakPressure: { id: 'peakPressure', artist: 'Adam Beyer', title: 'Peak Pressure', description: 'Punch, roll, rumble, and a clear route to the peak.', settings: { reverbAmount: 0.48, delayAmount: 0.2, driveAmount: 0.09, drumDriveAmount: 0.18, kickBassDuckDepth: 91, masterVolume: 0.58 }, techno: { bpm: 136, hatPulses: 12, snarePulses: 1, tomPulses: 3, hatDensity: 87, snareDensity: 28, tomActivity: 80, evolveBars: 4, humanize: 7, swing: 7, volume: 72 }, melody: { enabled: true, mode: 'callResponse', complexity: 42, repetition: 74, variation: 54, contour: 'rise', progression: 'classic', density: 28, brightness: 28, volume: 24, tranceGate: true, gatePattern: 'eighth' }, macros: { bloom: 28, weight: 88, motion: 62, distance: 22 }, acid: { enabled: false }, rumble: 'sub', ritual: 82 },
};
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
// Evenly distributes a number of pulses around a step grid. This compact
// modular form is equivalent to a Euclidean rhythm for our 16-step machine.
const euclideanSteps = (pulses: number, steps = 16, rotation = 0) => {
  const count = clamp(Math.round(pulses), 0, steps);
  return new Set(Array.from({ length: steps }, (_, step) => step).filter((step) => (((step - rotation + steps) % steps) * count) % steps < count));
};
const MIC_MAX_SECONDS = 60;
// Overall level for uploaded/recorded Audio Input playback. Was 0.4 — far
// too conservative next to grain envelope peaks that were already quiet,
// so samples were nearly inaudible; the master compressor keeps this safe.
const SAMPLE_GAIN_SCALE = 1.15;
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
const createTubeCurve = (amount: number) => {
  const curve = new Float32Array(4096);
  const drive = 1 + amount * 9;
  for (let index = 0; index < curve.length; index += 1) {
    const x = (index * 2) / (curve.length - 1) - 1;
    // A restrained asymmetric response keeps the vocal warm before it reaches
    // the main FX bus instead of turning into a harsh distortion stage.
    curve[index] = amount <= 0.001 ? x : (Math.tanh(x * drive * (x >= 0 ? 1.08 : 0.88)) + x * 0.08) / 1.08;
  }
  return curve;
};
const createMixerChannelNodes = (context: AudioContext): MixerChannelNodes => {
  const input = context.createGain();
  const low = context.createBiquadFilter();
  const mid = context.createBiquadFilter();
  const high = context.createBiquadFilter();
  const output = context.createGain();
  low.type = 'lowshelf'; low.frequency.value = 180; low.gain.value = 0;
  mid.type = 'peaking'; mid.frequency.value = 1100; mid.Q.value = 0.8; mid.gain.value = 0;
  high.type = 'highshelf'; high.frequency.value = 5200; high.gain.value = 0;
  output.gain.value = 1;
  input.connect(low); low.connect(mid); mid.connect(high); high.connect(output);
  return { input, low, mid, high, output };
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
const formatDuration = (seconds: number) => {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
};
const floatTo16BitPCM = (input: Float32Array) => {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
};

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
  const [vocalSettings, setVocalSettings] = useState<VocalSettings>(defaultVocalSettings);
  const [vocalRenderStatus, setVocalRenderStatus] = useState('Ready');
  const [sampleMode, setSampleMode] = useState<SampleMode>('granular');
  const [sampleThroughFx, setSampleThroughFx] = useState(true);
  const [sampleLoaded, setSampleLoaded] = useState(false);
  const [sampleName, setSampleName] = useState('');
  const [sampleMeta, setSampleMeta] = useState('');
  const [sampleDuration, setSampleDuration] = useState(0);
  const [sampleStatus, setSampleStatus] = useState('None');
  const [isDragging, setIsDragging] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [samplePosition, setSamplePosition] = useState(0);
  const [sampleActive, setSampleActive] = useState(false);

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

  // Minimal Machine: the kick is deliberately invariant; all movement is
  // confined to the smaller voices so the rhythm stays hypnotic.
  const [technoSettings, setTechnoSettings] = useState<TechnoSettings>(defaultTechnoSettings);
  const [technoPreset, setTechnoPreset] = useState<TechnoPresetName | 'mix'>('classic');
  const [melodySettings, setMelodySettings] = useState<MelodySettings>(defaultMelodySettings);
  const [melodyEvolution, setMelodyEvolution] = useState(0);
  const [melodyComposition, setMelodyComposition] = useState<MelodyComposition | null>(null);
  const [melodyActiveBar, setMelodyActiveBar] = useState(0);
  const [technoPlaying, setTechnoPlaying] = useState(false);
  const [technoEvolution, setTechnoEvolution] = useState(0);

  // Wander: a very slow macro drift across reverb/brightness/width, so the
  // room keeps slowly moving through its own space instead of settling.
  const [wanderOn, setWanderOn] = useState(false);
  const [wanderSpeed, setWanderSpeed] = useState(0.02);
  const [wanderDepth, setWanderDepth] = useState(40);

  // Keyboard Play: press A S D F G H J K L (and W E R T Y U I O P an octave
  // up) to play soft, scale-locked notes by hand — off by default, a peer
  // to Pulse/Wander rather than the primary interaction.
  const [keyboardPlayOn, setKeyboardPlayOn] = useState(false);
  const [activeKeys, setActiveKeys] = useState<Record<string, boolean>>({});
  const [keyboardTranspose, setKeyboardTranspose] = useState(0);
  const [keyboardShine, setKeyboardShine] = useState(35);
  const [midiPorts, setMidiPorts] = useState<MidiInputPort[]>([]);
  const [midiPortIndex, setMidiPortIndex] = useState<number | null>(null);
  const [midiStatus, setMidiStatus] = useState('No MIDI input connected');
  const [midiMode, setMidiMode] = useState<MidiMode>('off');
  const [midiClockSync, setMidiClockSync] = useState(false);
  const [midiBpm, setMidiBpm] = useState<number | null>(null);
  const [midiRootNote, setMidiRootNote] = useState<number | null>(null);
  const [patchCables, setPatchCables] = useState<PatchCables>({ toneToMod: true, modToSpace: true, spaceToTone: false });
  const [macros, setMacros] = useState<PerformanceMacros>(defaultPerformanceMacros);
  const [harmonicGravity, setHarmonicGravity] = useState(50);
  const [freezeActive, setFreezeActive] = useState(false);
  const [scenes, setScenes] = useState<{ a: PerformanceScene | null; b: PerformanceScene | null }>({ a: null, b: null });
  const [morphSeconds, setMorphSeconds] = useState(45);
  const [morphTarget, setMorphTarget] = useState<'a' | 'b' | null>(null);
  const [morphProgress, setMorphProgress] = useState(0);
  const [afterimage, setAfterimage] = useState<AfterimageSettings>(defaultAfterimageSettings);
  const [rumbleDna, setRumbleDna] = useState<RumbleDna>('cavern');
  const [ritualIntensity, setRitualIntensity] = useState(52);
  const [ritualStatus, setRitualStatus] = useState('Listening to the last 30 seconds');
  const [blackoutMode, setBlackoutMode] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  // Performance additions stay alongside the existing patch: they are silent
  // until explicitly armed, so the original instrument always opens unchanged.
  const [acidSettings, setAcidSettings] = useState<AcidSettings>(defaultAcidSettings);
  const [liveGrid, setLiveGrid] = useState<LiveGrid>(defaultLiveGrid);
  const [liveGridArmed, setLiveGridArmed] = useState(false);
  const [activeArtistScene, setActiveArtistScene] = useState<ArtistSceneId | null>(null);
  const [conductorBars, setConductorBars] = useState(16);
  const [conductorTarget, setConductorTarget] = useState<ArtistSceneId | null>(null);
  const [conductorProgress, setConductorProgress] = useState(0);
  const [gestureFrames, setGestureFrames] = useState<GestureFrame[]>([]);
  const [gestureRecording, setGestureRecording] = useState(false);
  const [gesturePlaying, setGesturePlaying] = useState(false);
  const [deckLevels, setDeckLevels] = useState({ groove: defaultTechnoSettings.volume, melodic: defaultMelodySettings.volume, atmosphere: 54 });
  const [deckFocus, setDeckFocus] = useState<'groove' | 'melodic' | 'atmosphere' | null>(null);
  const [mixBoardOpen, setMixBoardOpen] = useState(false);
  const [mixerSettings, setMixerSettings] = useState<MixerSettings>(defaultMixerSettings);
  const [masterMeter, setMasterMeter] = useState<MasterMeter>({ compressor: 0, limiter: 0 });

  const graphRef = useRef<Graph | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const masteringCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const masterMeterTickRef = useRef(0);
  const sampleWaveformRef = useRef<HTMLCanvasElement | null>(null);
  const settingsRef = useRef(settings);
  const sampleSettingsRef = useRef(sampleSettings);
  const samplePositionRef = useRef(samplePosition);
  const granularPositionRef = useRef(0);
  const sampleActiveRef = useRef(sampleActive);
  const scheduleNextGrainRef = useRef<() => void>(() => {});
  const schedulePulseRef = useRef<() => void>(() => {});
  const scheduleTechnoStepRef = useRef<() => void>(() => {});
  const vocalRenderVersionRef = useRef(0);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const generationTimerRef = useRef<number | null>(null);
  const seedRef = useRef(0);
  const voiceIdRef = useRef(0);
  const generateNoteRef = useRef<() => void>(() => {});
  const keyVoicesRef = useRef<Map<string, LiveVoice>>(new Map());
  const midiVoicesRef = useRef<Map<string, LiveVoice>>(new Map());
  const midiModeRef = useRef<MidiMode>(midiMode);
  const midiClockSyncRef = useRef(midiClockSync);
  const midiRootNoteRef = useRef<number | null>(null);
  const midiHeldRootsRef = useRef<Map<string, number>>(new Map());
  const technoSettingsRef = useRef(technoSettings);
  const melodySettingsRef = useRef(melodySettings);
  const technoPlayingRef = useRef(technoPlaying);
  const technoTimerRef = useRef<number | null>(null);
  const technoStepRef = useRef(0);
  const technoBarRef = useRef(0);
  const technoPatternRef = useRef<TechnoPattern>({ kicks: euclideanSteps(4), hats: euclideanSteps(defaultTechnoSettings.hatPulses), snares: euclideanSteps(defaultTechnoSettings.snarePulses, 16, 12), ghostSnares: new Set(), toms: new Set(), hatChance: 0.68 });
  const melodyPhraseRef = useRef<Array<number | null>>(Array(16).fill(null));
  const melodyCompositionRef = useRef<MelodyComposition | null>(null);
  const melodyActiveBarRef = useRef(0);
  const midiClockRef = useRef({ ticks: 0, startedAt: 0 });
  const frozenVoicesRef = useRef<Map<number, FrozenVoice>>(new Map());
  const frozenVoiceIdRef = useRef(0);
  const morphTimerRef = useRef<number | null>(null);
  const morphVersionRef = useRef(0);
  const acidSettingsRef = useRef(acidSettings);
  const acidLastFrequencyRef = useRef<number | null>(null);
  const liveGridRef = useRef(liveGrid);
  const liveGridArmedRef = useRef(liveGridArmed);
  const conductorTimerRef = useRef<number | null>(null);
  const conductorVersionRef = useRef(0);
  const gestureFramesRef = useRef<GestureFrame[]>([]);
  const gestureRecordStartRef = useRef(0);
  const gesturePlaybackTimerRef = useRef<number | null>(null);

  const recordedLeftRef = useRef<Float32Array[]>([]);
  const recordedRightRef = useRef<Float32Array[]>([]);
  const recordStartRef = useRef(0);
  const recordTickRef = useRef<number | null>(null);
  const ritualLeftRef = useRef<Float32Array[]>([]);
  const ritualRightRef = useRef<Float32Array[]>([]);
  const afterimageRef = useRef(afterimage);
  const rumbleDnaRef = useRef(rumbleDna);
  const afterimageStepRef = useRef(0);
  const ritualPressTimerRef = useRef<number | null>(null);
  const ritualTapTimerRef = useRef<number | null>(null);
  const ritualLongPressRef = useRef(false);
  const ritualNextSceneRef = useRef<'a' | 'b'>('a');

  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micChunksRef = useRef<Blob[]>([]);
  const micStartRef = useRef(0);
  const micTickRef = useRef<number | null>(null);
  const micStopRef = useRef<() => void>(() => {});

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { technoSettingsRef.current = technoSettings; }, [technoSettings]);
  useEffect(() => { melodySettingsRef.current = melodySettings; }, [melodySettings]);
  useEffect(() => { technoPlayingRef.current = technoPlaying; }, [technoPlaying]);
  useEffect(() => { sampleSettingsRef.current = sampleSettings; }, [sampleSettings]);
  useEffect(() => { samplePositionRef.current = samplePosition; }, [samplePosition]);
  useEffect(() => { sampleActiveRef.current = sampleActive; }, [sampleActive]);
  useEffect(() => { afterimageRef.current = afterimage; }, [afterimage]);
  useEffect(() => { rumbleDnaRef.current = rumbleDna; }, [rumbleDna]);
  useEffect(() => { acidSettingsRef.current = acidSettings; }, [acidSettings]);
  useEffect(() => { liveGridRef.current = liveGrid; }, [liveGrid]);
  useEffect(() => { liveGridArmedRef.current = liveGridArmed; }, [liveGridArmed]);
  useEffect(() => {
    midiModeRef.current = midiMode;
    if (midiMode !== 'root') { midiRootNoteRef.current = null; midiHeldRootsRef.current.clear(); }
  }, [midiMode]);
  useEffect(() => { midiClockSyncRef.current = midiClockSync; }, [midiClockSync]);
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
    const mixerChannels = Object.fromEntries(mixerChannelMeta.map(({ id }) => [id, createMixerChannelNodes(context)])) as Record<MixerChannelId, MixerChannelNodes>;
    const master = context.createGain();
    const eqLow = context.createBiquadFilter();
    const eqMid = context.createBiquadFilter();
    const eqHigh = context.createBiquadFilter();
    const masterDrive = context.createWaveShaper();
    const compressor = context.createDynamicsCompressor();
    const limiter = context.createDynamicsCompressor();
    const analyser = context.createAnalyser();
    const ritualProcessor = context.createScriptProcessor(4096, 2, 2);
    const droneMaster = context.createGain();
    const droneBus = context.createGain();
    const synthBus = context.createGain();
    const synthBassFilter = context.createBiquadFilter();
    const synthBassDuckGain = context.createGain();
    const synthPresenceFilter = context.createBiquadFilter();
    const synthMixBus = context.createGain();
    const synthDuckGain = context.createGain();
    const synthLowCut = context.createBiquadFilter();
    const synthHighCut = context.createBiquadFilter();
    const synthCompressor = context.createDynamicsCompressor();
    const synthLimiter = context.createDynamicsCompressor();
    const drumBus = context.createGain();
    const drumDrive = context.createWaveShaper();
    const drumCompressor = context.createDynamicsCompressor();
    const drumLimiter = context.createDynamicsCompressor();
    const technoGain = context.createGain();
    const melodyGain = context.createGain();
    const melodyDuckGain = context.createGain();
    const melodyGateGain = context.createGain();
    const rumbleSend = context.createGain();
    const rumbleReverb = createDroneReverb(context, 2.7);
    const rumbleFilter = context.createBiquadFilter();
    const rumbleGain = context.createGain();
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
    const sampleFormantFilters = [context.createBiquadFilter(), context.createBiquadFilter(), context.createBiquadFilter()];
    const sampleTubeDrive = context.createWaveShaper();
    const sampleTubeTone = context.createBiquadFilter();
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
    // Master Glue: trim excess weight, add a near-imperceptible shared colour,
    // then use a slow, low-ratio compressor so transients can still lead the
    // groove. The limiter is only a final safety net.
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 200;
    eqLow.gain.value = defaultDroneSettings.eqLowGain;
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 0.9;
    eqMid.gain.value = defaultDroneSettings.eqMidGain;
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 4000;
    eqHigh.gain.value = defaultDroneSettings.eqHighGain;
    masterDrive.curve = createDriveCurve(defaultDroneSettings.masterSaturation);
    masterDrive.oversample = '2x';
    compressor.threshold.value = defaultDroneSettings.compThreshold;
    compressor.knee.value = 24;
    compressor.ratio.value = defaultDroneSettings.compRatio;
    compressor.attack.value = defaultDroneSettings.compAttack;
    compressor.release.value = defaultDroneSettings.compRelease;
    limiter.threshold.value = defaultDroneSettings.limiterCeiling;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;
    // A rolling, post-master buffer turns the recent performance into a new
    // granular source on demand. It stays out of the export signal path.
    ritualProcessor.onaudioprocess = (event) => {
      const left = event.inputBuffer.getChannelData(0);
      const right = event.inputBuffer.numberOfChannels > 1 ? event.inputBuffer.getChannelData(1) : left;
      ritualLeftRef.current.push(new Float32Array(left));
      ritualRightRef.current.push(new Float32Array(right));
      const maxChunks = Math.ceil(context.sampleRate * 30 / event.inputBuffer.length);
      if (ritualLeftRef.current.length > maxChunks) ritualLeftRef.current.shift();
      if (ritualRightRef.current.length > maxChunks) ritualRightRef.current.shift();
      event.outputBuffer.getChannelData(0).set(left);
      event.outputBuffer.getChannelData(1).set(right);
    };
    droneDry.gain.value = 1 - defaultDroneSettings.reverbAmount * 0.5;
    droneMaster.gain.value = defaultDroneSettings.masterVolume;
    synthBassFilter.type = 'lowpass';
    synthBassFilter.frequency.value = defaultDroneSettings.kickBassSplit;
    synthBassFilter.Q.value = 0.7;
    synthBassDuckGain.gain.value = 1;
    synthPresenceFilter.type = 'highpass';
    synthPresenceFilter.frequency.value = defaultDroneSettings.kickBassSplit;
    synthPresenceFilter.Q.value = 0.7;
    synthDuckGain.gain.value = 1;
    synthLowCut.type = 'highpass';
    synthLowCut.frequency.value = defaultDroneSettings.synthLowCut;
    synthLowCut.Q.value = 0.7;
    synthHighCut.type = 'lowpass';
    synthHighCut.frequency.value = defaultDroneSettings.synthHighCut;
    synthHighCut.Q.value = 0.7;
    synthCompressor.threshold.value = defaultDroneSettings.synthCompThreshold;
    synthCompressor.knee.value = 18;
    synthCompressor.ratio.value = defaultDroneSettings.synthCompRatio;
    synthCompressor.attack.value = 0.02;
    synthCompressor.release.value = 0.28;
    synthLimiter.threshold.value = defaultDroneSettings.synthLimiterCeiling;
    synthLimiter.knee.value = 0;
    synthLimiter.ratio.value = 20;
    synthLimiter.attack.value = 0.001;
    synthLimiter.release.value = 0.1;
    drumDrive.curve = createDriveCurve(defaultDroneSettings.drumDriveAmount);
    drumDrive.oversample = '2x';
    drumCompressor.threshold.value = defaultDroneSettings.drumCompThreshold;
    drumCompressor.knee.value = 10;
    drumCompressor.ratio.value = defaultDroneSettings.drumCompRatio;
    drumCompressor.attack.value = 0.008;
    drumCompressor.release.value = 0.12;
    drumLimiter.threshold.value = defaultDroneSettings.drumLimiterCeiling;
    drumLimiter.knee.value = 0;
    drumLimiter.ratio.value = 20;
    drumLimiter.attack.value = 0.001;
    drumLimiter.release.value = 0.08;
    technoGain.gain.value = defaultTechnoSettings.volume / 100;
    melodyGain.gain.value = defaultMelodySettings.volume / 100;
    melodyDuckGain.gain.value = 1;
    melodyGateGain.gain.value = 1;
    rumbleSend.gain.value = 0.72;
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 185;
    rumbleFilter.Q.value = 0.8;
    rumbleGain.gain.value = 0;
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
    sampleFilter.frequency.value = 9000;
    sampleFilter.Q.value = 0.7;
    const baseFormants = [730, 1090, 2440];
    sampleFormantFilters.forEach((filter, index) => {
      filter.type = 'peaking';
      filter.frequency.value = baseFormants[index];
      filter.Q.value = 5;
      filter.gain.value = 0;
    });
    sampleTubeDrive.curve = createTubeCurve(0);
    sampleTubeDrive.oversample = '4x';
    sampleTubeTone.type = 'lowpass';
    sampleTubeTone.frequency.value = 16000;
    sampleTubeTone.Q.value = 0.5;
    sampleGain.gain.value = defaultSampleSettings.grainVolume * SAMPLE_GAIN_SCALE;
    sampleGain.connect(sampleFormantFilters[0]);
    sampleFormantFilters[0].connect(sampleFormantFilters[1]);
    sampleFormantFilters[1].connect(sampleFormantFilters[2]);
    sampleFormantFilters[2].connect(sampleTubeDrive);
    sampleTubeDrive.connect(sampleTubeTone);
    sampleTubeTone.connect(sampleFilter);
    sampleFilter.connect(mixerChannels.input.input);
    mixerChannels.input.output.connect(droneDry);
    mixerChannels.input.output.connect(droneReverbPreDelay);
    mixerChannels.input.output.connect(droneDelay);

    // Pulse: a single persistent sub oscillator gated by short envelope hits
    // scheduled on ratio-based steps — silent until a pattern is selected.
    pulseOsc.type = 'sine';
    pulseOsc.frequency.value = defaultDroneSettings.basePitch / 2;
    pulseFilter.type = 'lowpass';
    pulseFilter.frequency.value = 220;
    pulseGain.gain.value = 0;
    pulseOsc.connect(pulseFilter);
    pulseFilter.connect(pulseGain);
    pulseGain.connect(mixerChannels.pulse.input);
    mixerChannels.pulse.output.connect(droneDry);
    mixerChannels.pulse.output.connect(droneReverbPreDelay);
    mixerChannels.pulse.output.connect(droneDelay);
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
    droneNoiseGain.connect(mixerChannels.drone.input);
    mixerChannels.drone.output.connect(droneDry);
    mixerChannels.drone.output.connect(droneReverbPreDelay);
    mixerChannels.drone.output.connect(droneDelay);
    droneNoise.start();
    master.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(toneHigh);
    toneHigh.connect(toneLow);
    toneLow.connect(masterDrive);
    masterDrive.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(ritualProcessor);
    ritualProcessor.connect(analyser);
    analyser.connect(context.destination);
    // The generative synth, input, and their effect returns stay on a
    // separate bus. This lets a kick make space without ducking itself or
    // the whole master mix, while the high-pass clears inaudible sub-rumble.
    droneDry.connect(synthBus);
    technoGain.connect(mixerChannels.machine.input);
    mixerChannels.machine.output.connect(drumBus);
    mixerChannels.machine.output.connect(rumbleSend);
    mixerChannels.acid.output.connect(drumBus);
    mixerChannels.acid.output.connect(rumbleSend);
    mixerChannels.ritual.output.connect(drumBus);
    mixerChannels.ritual.output.connect(rumbleSend);
    melodyGain.connect(mixerChannels.melody.input);
    mixerChannels.melody.output.connect(melodyDuckGain);
    melodyDuckGain.connect(melodyGateGain);
    melodyGateGain.connect(droneBus);
    rumbleSend.connect(rumbleReverb);
    rumbleReverb.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(drumBus);
    droneReverbPreDelay.connect(droneReverb);
    droneReverb.connect(droneReverbWet);
    droneReverbWet.connect(synthBus);
    droneDelay.connect(droneDelayWet);
    droneDelayWet.connect(synthBus);
    droneDelayWet.connect(droneReverbPreDelay);
    // Split the synth at the kick's body frequency: only the bass band gets
    // a deep duck, while a lighter full-band dip keeps the transient clear.
    synthBus.connect(synthBassFilter);
    synthBassFilter.connect(synthBassDuckGain);
    synthBassDuckGain.connect(synthMixBus);
    synthBus.connect(synthPresenceFilter);
    synthPresenceFilter.connect(synthMixBus);
    synthMixBus.connect(synthDuckGain);
    synthDuckGain.connect(synthLowCut);
    synthLowCut.connect(synthHighCut);
    synthHighCut.connect(synthCompressor);
    synthCompressor.connect(synthLimiter);
    synthLimiter.connect(droneBus);
    drumBus.connect(drumDrive);
    drumDrive.connect(drumCompressor);
    drumCompressor.connect(drumLimiter);
    drumLimiter.connect(droneBus);
    droneBus.connect(droneDrive);
    droneDrive.connect(droneChorusDry);
    droneDrive.connect(droneChorusDelay);
    droneChorusDelay.connect(droneChorusWet);
    droneChorusDry.connect(droneMaster);
    droneChorusWet.connect(droneMaster);
    droneMaster.connect(mixerChannels.master.input);
    mixerChannels.master.output.connect(master);

    graphRef.current = {
      context, master, toneHigh, toneLow, masterDrive, compressor, analyser, eqLow, eqMid, eqHigh, limiter, droneMaster, droneBus, synthBus, synthBassFilter, synthBassDuckGain, synthPresenceFilter, synthMixBus, synthDuckGain, synthLowCut, synthHighCut, synthCompressor, synthLimiter, droneDrive, droneChorusDry, droneChorusDelay, droneChorusWet, droneChorusLfo, droneChorusDepth, drumBus, drumDrive, drumCompressor, drumLimiter, technoGain, melodyGain, melodyDuckGain, melodyGateGain, rumbleSend, rumbleReverb, rumbleFilter, rumbleGain,
      droneDry, droneReverb, droneReverbPreDelay, droneReverbWet, droneDelay, droneDelayFilter, droneDelayFeedback, droneDelayWet, droneNoise, droneNoiseFilter, droneNoiseGain,
      droneVoices: new Map(),
      sampleGain, sampleFilter, sampleFormantFilters, sampleTubeDrive, sampleTubeTone, sampleBuffer: null, sampleOriginalBuffer: null, loopSource: null, granularTimer: null,
      recordProcessor: null, ritualProcessor,
      pulseOsc, pulseGain, pulseFilter, pulseTimer: null, pulseStep: 0,
      wanderLfo, wanderReverbGain, wanderToneGain, wanderChorusGain, mixerChannels,
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
    filter.connect(voiceGain); voiceGain.connect(panner); panner.connect(graph.mixerChannels.drone.input);
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
    const heldRoot = midiRootNoteRef.current;
    // A held root only redirects the generator when Harmonic Gravity asks it
    // to; at zero, the autonomous system remains completely self-directed.
    const gravity = heldRoot === null ? 0 : harmonicGravity / 100;
    const baseMidi = heldRoot !== null && gravity > 0 ? heldRoot : Math.round(12 * Math.log2(current.basePitch / 16.351));
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
    if (heldRoot !== null && nextRandom() < gravity) {
      const rootRelations = [-24, -19, -17, -12, -9, -8, -7, -5, -4, -3, 0, 3, 4, 5, 7, 8, 9, 12, 17, 19, 24];
      const target = heldRoot + rootRelations[Math.floor(nextRandom() * rootRelations.length)];
      totalSemitones = candidates.reduce((best, candidate) => (Math.abs(candidate - target) < Math.abs(best - target) ? candidate : best), candidates[0]);
    } else if (activeVoices.length > 0 && nextRandom() < 0.42) {
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
    await createVoice(freqForSemitone(totalSemitones), nameForSemitone(totalSemitones), totalSemitones);
    if (runningRef.current && !pausedRef.current) {
      const primeMultiplier = 0.7 + (dronePrimes[Math.floor(nextRandom() * 6)] / dronePrimes[6]) * 0.6;
      generationTimerRef.current = window.setTimeout(() => generateNoteRef.current(), current.genSpeed * primeMultiplier * 1000);
    }
  }, [createVoice, harmonicGravity, nextRandom]);

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

  const releaseFreeze = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || frozenVoicesRef.current.size === 0) { setFreezeActive(false); return; }
    const now = graph.context.currentTime;
    frozenVoicesRef.current.forEach((voice) => {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0.0001, now, 1.2);
      window.setTimeout(() => {
        voice.oscillators.forEach((osc) => { try { osc.stop(); } catch {} });
        try { voice.subOsc.stop(); } catch {}
        try { voice.filter.disconnect(); } catch {}
        try { voice.gain.disconnect(); } catch {}
        try { voice.panner.disconnect(); } catch {}
      }, 5200);
    });
    frozenVoicesRef.current.clear();
    setFreezeActive(false);
  }, []);

  const dissolveGeneratedWorld = useCallback((seconds = 4) => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.context.currentTime;
    const voices = Array.from(graph.droneVoices.entries());
    voices.forEach(([id, voice]) => {
      voice.voiceGain.gain.cancelScheduledValues(now);
      // A long exponential fade makes the outgoing world feel like it is
      // receding into the same room rather than being abruptly stopped.
      voice.voiceGain.gain.setTargetAtTime(0.0001, now, seconds / 4.7);
      if (voice.randomInterval) window.clearInterval(voice.randomInterval);
      window.setTimeout(() => {
        voice.oscillators.forEach(({ osc }) => { try { osc.stop(); } catch {} });
        try { voice.subOsc.stop(); } catch {}
        try { voice.airOsc.stop(); } catch {}
        try { voice.filterLfo.stop(); } catch {}
        try { voice.pitchLfo.stop(); } catch {}
        try { voice.volLfo.stop(); } catch {}
        try { voice.panLfo.stop(); } catch {}
      }, (seconds + 0.35) * 1000);
      graph.droneVoices.delete(id);
    });
    setVoiceCount(0);
    setNotes([]);
  }, []);

  const newWorld = useCallback(() => {
    seedRef.current = Math.floor(Math.random() * 0xffffffff);
    if (generationTimerRef.current) window.clearTimeout(generationTimerRef.current);
    generationTimerRef.current = null;
    dissolveGeneratedWorld();
    releaseFreeze();
    const graph = graphRef.current;
    if (graph) {
      if (graph.pulseTimer) window.clearTimeout(graph.pulseTimer);
      graph.pulseTimer = null;
      graph.pulseStep = Math.floor(nextRandom() * 8);
    }
    if (runningRef.current && !pausedRef.current) {
      window.setTimeout(() => generateNoteRef.current(), 140);
      window.setTimeout(() => generateNoteRef.current(), 1650);
    }
  }, [dissolveGeneratedWorld, nextRandom, releaseFreeze]);

  const captureFreeze = useCallback(async () => {
    const graph = await ensureAudio();
    const sourceVoices = Array.from(graph.droneVoices.values());
    if (!sourceVoices.length) return;
    releaseFreeze();
    const current = settingsRef.current;
    const now = graph.context.currentTime;
    // Rebuild a calm, phase-independent copy of the current harmony. It is
    // intentionally a new layer, so the original evolving voices retain their
    // natural lifetimes and the generator can keep moving around the capture.
    const uniqueSemitones = Array.from(new Set(sourceVoices.map((voice) => voice.semitone))).slice(0, 6);
    uniqueSemitones.forEach((semitone, index) => {
      const frequency = freqForSemitone(semitone);
      const filter = graph.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1500 + index * 180;
      filter.Q.value = 0.7;
      const panner = graph.context.createStereoPanner();
      panner.pan.value = uniqueSemitones.length > 1 ? (index / (uniqueSemitones.length - 1) - 0.5) * 0.42 : 0;
      const gain = graph.context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.setTargetAtTime(0.11 / Math.sqrt(uniqueSemitones.length), now, 0.48);
      const oscillators: OscillatorNode[] = [];
      for (const detune of [-current.detuneCents * 0.45, current.detuneCents * 0.45]) {
        const osc = graph.context.createOscillator();
        const oscGain = graph.context.createGain();
        osc.type = current.waveform;
        osc.frequency.value = frequency;
        osc.detune.value = detune;
        oscGain.gain.value = 0.45;
        osc.connect(oscGain); oscGain.connect(filter); osc.start();
        oscillators.push(osc);
      }
      const subOsc = graph.context.createOscillator();
      const subGain = graph.context.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.value = frequency / 2;
      subGain.gain.value = 0.22;
      subOsc.connect(subGain); subGain.connect(filter); subOsc.start();
      filter.connect(gain); gain.connect(panner);
      panner.connect(graph.mixerChannels.drone.input);
      frozenVoicesRef.current.set(frozenVoiceIdRef.current += 1, { oscillators, subOsc, gain, filter, panner });
    });
    setFreezeActive(true);
  }, [ensureAudio, releaseFreeze]);

  const currentScene = useCallback((): PerformanceScene => ({
    settings: { ...settings }, macros: { ...macros }, harmonicGravity,
    pulsePattern, pulseSpeed, pulseDepth, wanderOn, wanderSpeed, wanderDepth,
    patchCables: { ...patchCables }, sampleSettings: { ...sampleSettings }, sampleMode, sampleThroughFx,
  }), [harmonicGravity, macros, patchCables, pulseDepth, pulsePattern, pulseSpeed, sampleMode, sampleSettings, sampleThroughFx, settings, wanderDepth, wanderOn, wanderSpeed]);

  const stopMorph = useCallback(() => {
    morphVersionRef.current += 1;
    if (morphTimerRef.current) window.clearTimeout(morphTimerRef.current);
    morphTimerRef.current = null;
    setMorphTarget(null);
    setMorphProgress(0);
  }, []);

  const applyScene = useCallback((scene: PerformanceScene) => {
    setSettings(scene.settings); setMacros(scene.macros); setHarmonicGravity(scene.harmonicGravity);
    setPulsePattern(scene.pulsePattern); setPulseSpeed(scene.pulseSpeed); setPulseDepth(scene.pulseDepth);
    setWanderOn(scene.wanderOn); setWanderSpeed(scene.wanderSpeed); setWanderDepth(scene.wanderDepth);
    setPatchCables(scene.patchCables); setSampleSettings(scene.sampleSettings); setSampleMode(scene.sampleMode); setSampleThroughFx(scene.sampleThroughFx);
  }, []);

  const captureScene = useCallback((slot: 'a' | 'b') => {
    stopMorph();
    setScenes((previous) => ({ ...previous, [slot]: currentScene() }));
  }, [currentScene, stopMorph]);

  const morphToScene = useCallback((slot: 'a' | 'b') => {
    const target = scenes[slot];
    if (!target) return;
    stopMorph();
    const source = currentScene();
    const version = morphVersionRef.current + 1;
    morphVersionRef.current = version;
    const startedAt = performance.now();
    setMorphTarget(slot);
    const tick = () => {
      if (version !== morphVersionRef.current) return;
      const amount = clamp((performance.now() - startedAt) / (morphSeconds * 1000), 0, 1);
      const interpolatedSettings = Object.fromEntries(Object.entries(source.settings).map(([key, value]) => {
        if (typeof value !== 'number') return [key, amount < 1 ? value : target.settings[key as keyof DroneSettings]];
        const next = lerp(value, target.settings[key as keyof DroneSettings] as number, amount);
        // Pitch crosses discrete semitone shelves while the surrounding
        // timbre flows, creating the slow voice-leading of a tectonic shift.
        return [key, key === 'basePitch' || key === 'oscCount' || key === 'maxVoices' ? Math.round(next) : next];
      })) as DroneSettings;
      setSettings(interpolatedSettings);
      setMacros({ bloom: lerp(source.macros.bloom, target.macros.bloom, amount), weight: lerp(source.macros.weight, target.macros.weight, amount), motion: lerp(source.macros.motion, target.macros.motion, amount), distance: lerp(source.macros.distance, target.macros.distance, amount) });
      setHarmonicGravity(lerp(source.harmonicGravity, target.harmonicGravity, amount));
      setPulseSpeed(lerp(source.pulseSpeed, target.pulseSpeed, amount)); setPulseDepth(lerp(source.pulseDepth, target.pulseDepth, amount));
      setWanderSpeed(lerp(source.wanderSpeed, target.wanderSpeed, amount)); setWanderDepth(lerp(source.wanderDepth, target.wanderDepth, amount));
      setSampleSettings({ grainRate: lerp(source.sampleSettings.grainRate, target.sampleSettings.grainRate, amount), grainPitch: lerp(source.sampleSettings.grainPitch, target.sampleSettings.grainPitch, amount), grainVolume: lerp(source.sampleSettings.grainVolume, target.sampleSettings.grainVolume, amount), grainSize: lerp(source.sampleSettings.grainSize, target.sampleSettings.grainSize, amount), grainDrift: lerp(source.sampleSettings.grainDrift, target.sampleSettings.grainDrift, amount), grainDensity: lerp(source.sampleSettings.grainDensity, target.sampleSettings.grainDensity, amount) });
      setMorphProgress(amount);
      if (amount < 1) { morphTimerRef.current = window.setTimeout(tick, 80); return; }
      setPulsePattern(target.pulsePattern); setWanderOn(target.wanderOn); setPatchCables(target.patchCables); setSampleMode(target.sampleMode); setSampleThroughFx(target.sampleThroughFx);
      setMorphTarget(null); setMorphProgress(0); morphTimerRef.current = null;
    };
    tick();
  }, [currentScene, morphSeconds, scenes, stopMorph]);

  const updateSetting = <K extends keyof DroneSettings>(key: K, value: DroneSettings[K]) => {
    setSettings((previous) => ({ ...previous, [key]: value }));
  };
  const applyMasterGlue = () => {
    setSettings((previous) => ({
      ...previous,
      eqLowGain: -1,
      eqMidGain: 0,
      eqHighGain: 1,
      masterSaturation: 0.025,
      compThreshold: -12,
      compRatio: 2,
      compAttack: 0.03,
      compRelease: 0.25,
      limiterCeiling: -1,
    }));
  };
  const updateSampleSetting = <K extends keyof SampleSettings>(key: K, value: SampleSettings[K]) => {
    setSampleSettings((previous) => ({ ...previous, [key]: value }));
  };
  const updateVocalSetting = <K extends keyof VocalSettings>(key: K, value: VocalSettings[K]) => {
    setVocalSettings((previous) => ({ ...previous, [key]: value }));
  };

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.context.currentTime;
    // Performance macros are a separate, reversible layer over the detailed
    // patch controls. The original controls never move underneath the player.
    const bloom = macros.bloom / 100;
    const weight = macros.weight / 100;
    const motion = macros.motion / 100;
    const distance = macros.distance / 100;
    const reverbAmount = clamp(settings.reverbAmount + bloom * 0.26 + distance * 0.22, 0, 1);
    const delayAmount = clamp(settings.delayAmount + bloom * 0.18 + distance * 0.12, 0, 1);
    const delayFeedback = clamp(settings.delayFeedback + distance * 0.12, 0, 0.88);
    const chorusAmount = clamp(settings.chorusAmount + bloom * 0.16, 0, 1);
    const driveAmount = clamp(settings.driveAmount + weight * 0.055, 0, 0.22);
    const filterRate = settings.filterRate * (1 + motion * 1.8);
    const filterDepth = clamp(settings.filterDepth + motion * 0.24, 0, 1);
    const pitchDrift = clamp(settings.pitchDrift + motion * 0.16, 0, 1);
    const panDepth = clamp(settings.panDepth + motion * 0.28, 0, 1);
    graph.droneMaster.gain.setTargetAtTime(settings.masterVolume, now, 0.08);
    graph.synthBassFilter.frequency.setTargetAtTime(settings.kickBassSplit, now, 0.08);
    graph.synthPresenceFilter.frequency.setTargetAtTime(settings.kickBassSplit, now, 0.08);
    graph.synthLowCut.frequency.setTargetAtTime(settings.synthLowCut, now, 0.08);
    graph.synthHighCut.frequency.setTargetAtTime(settings.synthHighCut, now, 0.08);
    if (!settings.kickSpace) {
      graph.synthDuckGain.gain.setTargetAtTime(1, now, 0.04);
      graph.synthBassDuckGain.gain.setTargetAtTime(1, now, 0.04);
    }
    graph.synthCompressor.threshold.setTargetAtTime(settings.synthCompThreshold, now, 0.1);
    graph.synthCompressor.ratio.setTargetAtTime(settings.synthCompRatio, now, 0.1);
    graph.synthLimiter.threshold.setTargetAtTime(settings.synthLimiterCeiling, now, 0.1);
    graph.drumCompressor.threshold.setTargetAtTime(settings.drumCompThreshold, now, 0.1);
    graph.drumCompressor.ratio.setTargetAtTime(settings.drumCompRatio, now, 0.1);
    graph.drumLimiter.threshold.setTargetAtTime(settings.drumLimiterCeiling, now, 0.1);
    graph.drumDrive.curve = createDriveCurve(settings.drumDriveAmount);
    graph.eqLow.gain.setTargetAtTime(settings.eqLowGain + weight * 4.5, now, 0.1);
    graph.eqMid.gain.setTargetAtTime(settings.eqMidGain, now, 0.1);
    graph.eqHigh.gain.setTargetAtTime(settings.eqHighGain, now, 0.1);
    graph.masterDrive.curve = createDriveCurve(settings.masterSaturation);
    graph.compressor.threshold.setTargetAtTime(settings.compThreshold, now, 0.1);
    graph.compressor.ratio.setTargetAtTime(settings.compRatio, now, 0.1);
    graph.compressor.attack.setTargetAtTime(settings.compAttack, now, 0.1);
    graph.compressor.release.setTargetAtTime(settings.compRelease, now, 0.1);
    graph.limiter.threshold.setTargetAtTime(settings.limiterCeiling, now, 0.1);
    const spaceToneCut = patchCables.spaceToTone ? reverbAmount * 1700 + delayAmount * 800 + distance * 850 : 0;
    const modToSpaceAmount = patchCables.modToSpace ? filterDepth * 0.12 : 0;
    const toneToModRate = patchCables.toneToMod ? 0.65 + (settings.basePitch / 110) * 0.7 : 1;
    graph.toneLow.frequency.setTargetAtTime(13500 - spaceToneCut, now, 0.3);
    graph.droneReverbWet.gain.setTargetAtTime(reverbAmount, now, 0.12);
    graph.droneDry.gain.setTargetAtTime(1 - reverbAmount * 0.5 - distance * 0.12, now, 0.12);
    graph.droneDelayWet.gain.setTargetAtTime(Math.min(1, delayAmount + modToSpaceAmount * 0.3), now, 0.18);
    // Longer time constant prevents zipper-like pitch jumps when the delay
    // control is moved while echoes are already ringing out.
    graph.droneDelay.delayTime.setTargetAtTime(Math.min(3, settings.delayTime + modToSpaceAmount), now, 0.35);
    graph.droneDelayFeedback.gain.setTargetAtTime(delayFeedback, now, 0.12);
    graph.droneDrive.curve = createDriveCurve(driveAmount);
    graph.droneChorusDry.gain.setTargetAtTime(1 - chorusAmount * 0.35, now, 0.12);
    graph.droneChorusWet.gain.setTargetAtTime(chorusAmount, now, 0.12);
    graph.droneChorusDepth.gain.setTargetAtTime(chorusAmount * 0.004, now, 0.12);
    graph.droneChorusLfo.frequency.setTargetAtTime(0.12 + filterRate * 2, now, 0.2);
    graph.droneNoiseGain.gain.setTargetAtTime(running ? settings.noiseAmount * 0.12 : 0, now, 0.24);
    graph.droneNoiseFilter.type = settings.noiseColor === 'white' ? 'allpass' : 'lowpass';
    graph.droneNoiseFilter.frequency.setTargetAtTime(settings.noiseColor === 'brown' ? 720 : settings.noiseColor === 'pink' ? 3800 : 12000, now, 0.18);
    graph.pulseOsc.frequency.setTargetAtTime(settings.basePitch / 2, now, 0.3);
    graph.droneVoices.forEach((voice) => {
      const sine = settings.modulationShape === 'sine';
      voice.filterLfo.frequency.setTargetAtTime(filterRate * toneToModRate, now, 0.2);
      voice.filterLfoGain.gain.setTargetAtTime(sine ? filterDepth * 3000 : 0, now, 0.2);
      voice.pitchLfo.frequency.setTargetAtTime(filterRate * 0.3 * toneToModRate, now, 0.2);
      voice.pitchLfoGain.gain.setTargetAtTime(sine ? pitchDrift * 50 : 0, now, 0.2);
      voice.volLfo.frequency.setTargetAtTime(filterRate * 0.5 * toneToModRate, now, 0.2);
      voice.volLfoGain.gain.setTargetAtTime(sine ? settings.volLfoDepth * 0.3 : 0, now, 0.2);
      voice.panLfo.frequency.setTargetAtTime(filterRate * 0.37 * toneToModRate, now, 0.2);
      voice.panLfoGain.gain.setTargetAtTime(sine ? panDepth : 0, now, 0.2);
      voice.subGain.gain.setTargetAtTime((0.6 / Math.sqrt(settings.oscCount)) * (1 + weight * 0.5), now, 0.2);
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
  }, [running, settings, patchCables, macros, nextRandom]);

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
    // Granular mode scans through the source continuously; the position
    // navigator sets the next place it scans from rather than pinning grains
    // to one moment of the recording.
    const centerPos = bufferDuration * granularPositionRef.current;
    const driftRange = bufferDuration * 0.4 * drift;
    let startPos = centerPos + (Math.random() - 0.5) * 2 * driftRange;
    startPos = Math.max(0, Math.min(startPos, Math.max(0.01, bufferDuration - grainDur / rate - 0.01)));
    const source = graph.context.createBufferSource();
    source.buffer = graph.sampleBuffer;
    source.playbackRate.value = rate;
    source.detune.value = current.grainPitch * 100 + (Math.random() - 0.5) * 20;
    const grainGain = graph.context.createGain();
    const peakLevel = 0.55 + Math.random() * 0.25;
    const attackTime = grainDur * 0.3;
    const releaseTime = grainDur * 0.3;
    grainGain.gain.setValueAtTime(0, startTime);
    grainGain.gain.linearRampToValueAtTime(peakLevel, startTime + attackTime);
    grainGain.gain.setValueAtTime(peakLevel, startTime + grainDur - releaseTime);
    grainGain.gain.linearRampToValueAtTime(0, startTime + grainDur);
    const grainFilter = graph.context.createBiquadFilter();
    grainFilter.type = 'lowpass';
    grainFilter.frequency.value = 2200 + Math.random() * 4000;
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
    if (!graph || !graph.sampleBuffer || !runningRef.current || !sampleActiveRef.current) return;
    if (pausedRef.current) { graph.granularTimer = window.setTimeout(() => scheduleNextGrainRef.current(), 500); return; }
    const current = sampleSettingsRef.current;
    const now = graph.context.currentTime;
    for (let index = 0; index < current.grainDensity; index += 1) {
      scheduleGrain(now + (index / current.grainDensity) * (current.grainSize * 0.5));
    }
    // Advance proportionally to grain length, wrapping around the complete
    // file so longer vocals do not get trapped around their opening second.
    const scanStep = Math.max(0.015, Math.min(0.12, (current.grainSize / Math.max(current.grainRate, 0.1)) / graph.sampleBuffer.duration * 0.28));
    const nextPosition = (granularPositionRef.current + scanStep) % 1;
    granularPositionRef.current = nextPosition;
    samplePositionRef.current = nextPosition;
    setSamplePosition(nextPosition);
    const interval = (current.grainSize / current.grainRate) * 500;
    graph.granularTimer = window.setTimeout(() => scheduleNextGrainRef.current(), Math.max(interval, 200));
  }, [scheduleGrain]);

  useEffect(() => { scheduleNextGrainRef.current = scheduleNextGrain; }, [scheduleNextGrain]);

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
    if (!graph || !graph.sampleBuffer || !sampleActiveRef.current) return;
    stopLoop();
    const current = sampleSettingsRef.current;
    const source = graph.context.createBufferSource();
    source.buffer = graph.sampleBuffer;
    const loopStart = Math.min(graph.sampleBuffer.duration - 0.01, graph.sampleBuffer.duration * samplePositionRef.current);
    source.loop = true;
    source.loopStart = Math.max(0, loopStart);
    source.loopEnd = graph.sampleBuffer.duration;
    source.playbackRate.value = current.grainRate;
    source.detune.value = current.grainPitch * 100;
    source.connect(graph.sampleGain);
    source.start(0, Math.max(0, loopStart));
    graph.loopSource = source;
    setSampleStatus('Loop');
  }, [stopLoop]);

  const captureRitual = useCallback(async () => {
    const graph = await ensureAudio();
    const totalLength = ritualLeftRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
    const captureLength = Math.min(totalLength, Math.floor(graph.context.sampleRate * 12));
    if (captureLength < graph.context.sampleRate) {
      setRitualStatus('Keep playing — Ritual needs one second of sound');
      return;
    }
    const buffer = graph.context.createBuffer(2, captureLength, graph.context.sampleRate);
    const startAt = totalLength - captureLength;
    let offset = 0;
    let written = 0;
    ritualLeftRef.current.forEach((chunk, index) => {
      const end = offset + chunk.length;
      const from = Math.max(0, startAt - offset);
      const to = Math.min(chunk.length, startAt + captureLength - offset);
      if (to > from) {
        buffer.getChannelData(0).set(chunk.subarray(from, to), written);
        buffer.getChannelData(1).set(ritualRightRef.current[index]?.subarray(from, to) ?? chunk.subarray(from, to), written);
        written += to - from;
      }
      offset = end;
    });
    graph.sampleBuffer = buffer;
    graph.sampleOriginalBuffer = buffer;
    samplePositionRef.current = 0;
    granularPositionRef.current = 0;
    sampleActiveRef.current = true;
    setSamplePosition(0); setSampleActive(true); setSampleLoaded(true);
    setSampleName('Ritual capture — last 12 seconds');
    setSampleMeta(`${Math.round(graph.context.sampleRate)} Hz • stereo • self-captured performance`);
    setRitualStatus('Ritual captured — granular memory is alive');
    startGranular();
  }, [ensureAudio, startGranular]);

  const stopSampleEngine = useCallback(() => {
    stopGranular();
    stopLoop();
  }, [stopGranular, stopLoop]);

  const handleSampleFile = useCallback(async (file: File) => {
    setSampleError(null);
    samplePositionRef.current = 0;
    granularPositionRef.current = 0;
    sampleActiveRef.current = true;
    setSamplePosition(0);
    setSampleActive(true);
    try {
      const graph = await ensureAudio();
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await graph.context.decodeAudioData(arrayBuffer);
      graph.sampleBuffer = decoded;
      graph.sampleOriginalBuffer = decoded;
      setSampleDuration(decoded.duration);
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
    if (graph) { graph.sampleBuffer = null; graph.sampleOriginalBuffer = null; }
    vocalRenderVersionRef.current += 1;
    setVocalRenderStatus('Ready');
    setSampleLoaded(false);
    setSampleName('');
    setSampleMeta('');
    setSampleDuration(0);
    setSampleStatus('None');
    setSampleError(null);
    samplePositionRef.current = 0;
    granularPositionRef.current = 0;
    sampleActiveRef.current = false;
    setSamplePosition(0);
    setSampleActive(false);
  }, [stopSampleEngine]);

  const chooseSampleMode = useCallback((mode: SampleMode) => {
    setSampleMode(mode);
    if (sampleLoaded && sampleActive) {
      if (mode === 'granular') { stopLoop(); startGranular(); } else { stopGranular(); startLoop(); }
    }
  }, [sampleActive, sampleLoaded, startGranular, startLoop, stopGranular, stopLoop]);

  const moveSamplePosition = useCallback((amount: number) => {
    if (!sampleLoaded) return;
    const next = Math.max(0, Math.min(1, samplePositionRef.current + amount));
    samplePositionRef.current = next;
    granularPositionRef.current = next;
    setSamplePosition(next);
    // A loop can seek only by being re-created. For granular playback this
    // also schedules a fresh cluster immediately at the newly chosen spot.
    if (sampleActive) { if (sampleMode === 'loop') startLoop(); else startGranular(); }
  }, [sampleActive, sampleLoaded, sampleMode, startGranular, startLoop]);

  const toggleSampleActive = useCallback(() => {
    if (!sampleLoaded) return;
    const next = !sampleActiveRef.current;
    sampleActiveRef.current = next;
    setSampleActive(next);
    if (next) {
      if (sampleMode === 'granular') startGranular(); else startLoop();
    } else {
      stopSampleEngine();
      setSampleStatus('Off');
    }
  }, [sampleLoaded, sampleMode, startGranular, startLoop, stopSampleEngine]);

  const toggleSampleThroughFx = useCallback(() => {
    setSampleThroughFx((previous) => {
      const next = !previous;
      const graph = graphRef.current;
      if (graph) {
        const inputOutput = graph.mixerChannels.input.output;
        try { inputOutput.disconnect(); } catch {}
        if (next) {
          inputOutput.connect(graph.droneDry);
          inputOutput.connect(graph.droneReverbPreDelay);
          inputOutput.connect(graph.droneDelay);
        } else {
          inputOutput.connect(graph.mixerChannels.master.input);
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.context.currentTime;
    graph.sampleGain.gain.setTargetAtTime(sampleSettings.grainVolume * SAMPLE_GAIN_SCALE, now, 0.05);
    if (graph.loopSource) {
      graph.loopSource.playbackRate.setTargetAtTime(sampleSettings.grainRate, now, 0.1);
      graph.loopSource.detune.setTargetAtTime(sampleSettings.grainPitch * 100, now, 0.1);
    }
  }, [sampleSettings]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.context.currentTime;
    const ratio = Math.pow(2, vocalSettings.formant / 12);
    const emphasis = Math.abs(vocalSettings.formant) / 12 * 8;
    const baseFormants = [730, 1090, 2440];
    graph.sampleFormantFilters.forEach((filter, index) => {
      filter.frequency.setTargetAtTime(Math.min(12000, baseFormants[index] * ratio), now, 0.12);
      filter.gain.setTargetAtTime(emphasis, now, 0.12);
    });
    graph.sampleTubeDrive.curve = createTubeCurve(vocalSettings.tube / 100);
    graph.sampleTubeTone.frequency.setTargetAtTime(16000 - vocalSettings.tube * 80, now, 0.12);
  }, [vocalSettings]);

  const renderVocalPitch = useCallback(async () => {
    const graph = graphRef.current;
    const original = graph?.sampleOriginalBuffer;
    if (!graph || !original) return;
    const version = ++vocalRenderVersionRef.current;
    const semitones = vocalSettings.pitch;
    if (semitones === 0) {
      if (graph.sampleBuffer !== original) {
        graph.sampleBuffer = original;
        setSampleDuration(original.duration);
        if (sampleActiveRef.current) { if (sampleMode === 'granular') startGranular(); else startLoop(); }
      }
      setVocalRenderStatus('Ready');
      return;
    }
    setVocalRenderStatus('Rendering vocal pitch…');
    // Yield once so the status lands before the CPU-heavy, whole-buffer DSP.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      const { formant } = await import('@audio/shift');
      const input = Array.from({ length: original.numberOfChannels }, (_, channel) => original.getChannelData(channel).slice());
      const shifted = formant(input, { semitones, sampleRate: original.sampleRate, frameSize: 2048 }) as Float32Array[];
      if (version !== vocalRenderVersionRef.current) return;
      const processed = graph.context.createBuffer(shifted.length, shifted[0].length, original.sampleRate);
      shifted.forEach((channel, index) => processed.copyToChannel(channel, index));
      graph.sampleBuffer = processed;
      setSampleDuration(processed.duration);
      if (sampleActiveRef.current) { if (sampleMode === 'granular') startGranular(); else startLoop(); }
      setVocalRenderStatus('Ready');
    } catch {
      if (version === vocalRenderVersionRef.current) setVocalRenderStatus('Pitch render failed — original sample remains active');
    }
  }, [sampleMode, startGranular, startLoop, vocalSettings.pitch]);

  useEffect(() => {
    if (!sampleLoaded) return;
    const timer = window.setTimeout(() => { void renderVocalPitch(); }, 180);
    return () => window.clearTimeout(timer);
  }, [sampleLoaded, renderVocalPitch]);

  // ── Audio Input: mic recording — capture a short sound/vocal take and
  // decode it into the same sampleBuffer a dropped file would use ─────

  const loadRecordedBlob = useCallback(async (blob: Blob) => {
    setMicState('processing');
    samplePositionRef.current = 0;
    granularPositionRef.current = 0;
    sampleActiveRef.current = true;
    setSamplePosition(0);
    setSampleActive(true);
    try {
      const graph = await ensureAudio();
      const arrayBuffer = await blob.arrayBuffer();
      const decoded = await graph.context.decodeAudioData(arrayBuffer);
      graph.sampleBuffer = decoded;
      graph.sampleOriginalBuffer = decoded;
      setSampleDuration(decoded.duration);
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

      // Dynamically imported so the encoder never has to load until someone
      // actually exports a recording. @breezystack/lamejs is a maintained,
      // ESM-native fork of lamejs — the original `lamejs` package throws
      // "MPEGMode is not defined" when bundled by Vite/Rollup.
      const { Mp3Encoder } = await import('@breezystack/lamejs');
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

      const totalBytes = mp3Data.reduce((sum, chunk) => sum + chunk.length, 0);
      const mp3Bytes = new Uint8Array(totalBytes);
      let byteOffset = 0;
      for (const chunk of mp3Data) { mp3Bytes.set(chunk, byteOffset); byteOffset += chunk.length; }
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const filename = `hi-drone-${timestamp}.mp3`;
      const sizeMb = (totalBytes / 1024 / 1024).toFixed(1);

      // The Tauri desktop webview (WKWebView on macOS) doesn't support the
      // browser <a download> + blob: URL pattern — clicks silently no-op,
      // so exports there go through Tauri's native save dialog + fs write
      // instead. The web build keeps the plain browser download.
      if (isTauri()) {
        const path = await saveFileDialog({ defaultPath: filename, filters: [{ name: 'MP3 Audio', extensions: ['mp3'] }] });
        if (path) {
          await writeFile(path, mp3Bytes);
          setRecordStatus(`Saved ${sizeMb} MB`);
        } else {
          setRecordStatus('Export cancelled');
        }
      } else {
        const blob = new Blob([mp3Bytes], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setRecordStatus(`Exported ${sizeMb} MB`);
      }
      setRecordTime('00:00');
    } catch (error) {
      const reason = error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error';
      setRecordStatus(`Export failed: ${reason}`);
    }
  }, []);

  const stopRecording = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || !graph.recordProcessor) return;
    if (recordTickRef.current) { window.clearInterval(recordTickRef.current); recordTickRef.current = null; }
    const processor = graph.recordProcessor;
    try { graph.limiter.disconnect(); } catch {}
    try { processor.disconnect(); } catch {}
    graph.limiter.connect(graph.ritualProcessor);
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
    // Tapped after the mastering chain (EQ/compressor/limiter), not at
    // master — so live adjustments to any control, mastering included,
    // are captured exactly as heard, not the pre-mastering signal.
    graph.limiter.disconnect();
    graph.limiter.connect(processor);
    processor.connect(graph.analyser);
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

  // ── Minimal Machine: a fixed kick with slowly mutating detail ───

  // A constrained random walk is the melodic "science" here: every new note
  // is a nearby degree of the selected scale, while a stable portion of the
  // previous phrase remains in place. The result evolves by voice-leading,
  // rather than spraying unrelated notes into the mix.
  const buildComposerPhrase = useCallback((current: MelodySettings, preserveMotif: boolean) => {
    const scaleLength = droneScales[settingsRef.current.scale].intervals.length;
    const input = { seed: Math.floor(nextRandom() * 0xffffffff), scaleLength, settings: current };
    const composition = preserveMotif && melodyCompositionRef.current
      ? mutateComposition(melodyCompositionRef.current, input)
      : composeMelody(input);
    melodyCompositionRef.current = composition;
    melodyActiveBarRef.current = 0;
    setMelodyComposition(composition);
    setMelodyActiveBar(0);
    setMelodyEvolution((count) => count + 1);
  }, [nextRandom]);

  const evolveMelodyPhrase = useCallback((preserveMotif = true) => {
    const current = melodySettingsRef.current;
    const scale = droneScales[settingsRef.current.scale].intervals;
    if (current.composerEnabled) {
      buildComposerPhrase(current, preserveMotif);
      return;
    }
    const phrase: Array<number | null> = Array(16).fill(null);
    const noteCount = clamp(Math.round(2 + (current.density / 100) * 6), 2, 8);
    const positions = Array.from(euclideanSteps(noteCount, 16, Math.floor(nextRandom() * 4))).sort((a, b) => a - b);
    let degree = 0;
    positions.forEach((step, index) => {
      const previous = melodyPhraseRef.current[step];
      if (preserveMotif && previous !== null && nextRandom() < 0.58) {
        phrase[step] = previous;
        degree = previous;
        return;
      }
      if (index === 0) degree = nextRandom() < 0.72 ? 0 : [2, 4][Math.floor(nextRandom() * 2)];
      else {
        const moves = [-2, -1, -1, 0, 0, 1, 1, 2];
        degree = clamp(degree + moves[Math.floor(nextRandom() * moves.length)], 0, scale.length + 4);
      }
      phrase[step] = degree;
    });
    melodyPhraseRef.current = phrase;
    setMelodyEvolution((count) => count + 1);
  }, [buildComposerPhrase, nextRandom]);

  const updateComposerSetting = useCallback(<K extends keyof ComposerSettings>(key: K, value: ComposerSettings[K]) => {
    const next = { ...melodySettingsRef.current, [key]: value };
    melodySettingsRef.current = next;
    setMelodySettings(next);
  }, []);

  const toggleMelodyComposer = useCallback(() => {
    const current = melodySettingsRef.current;
    const next = { ...current, composerEnabled: !current.composerEnabled };
    melodySettingsRef.current = next;
    setMelodySettings(next);
  }, []);

  useEffect(() => {
    if (!melodySettings.composerEnabled) return;
    buildComposerPhrase(melodySettingsRef.current, false);
  }, [buildComposerPhrase, melodySettings.composerEnabled, melodySettings.complexity, melodySettings.contour, melodySettings.mode, melodySettings.noteLength, melodySettings.phraseBars, melodySettings.progression, melodySettings.range, melodySettings.repetition, melodySettings.variation, settings.scale]);

  const playScaleLockedMelody = useCallback((graph: Graph, degree: number, lateMs = 0, composedNote?: MelodyNote) => {
    const current = melodySettingsRef.current;
    const scale = droneScales[settingsRef.current.scale].intervals;
    const scaleDegree = ((degree % scale.length) + scale.length) % scale.length;
    const octave = Math.floor(degree / scale.length);
    const frequency = freqForSemitone(current.root + scale[scaleDegree] + octave * 12);
    const now = graph.context.currentTime + lateMs * 0.001;
    const legacyDuration = Math.min(0.62, 60 / technoSettingsRef.current.bpm * 1.08);
    const sixteenth = 60 / technoSettingsRef.current.bpm / 4;
    const duration = composedNote ? Math.min(1.8, sixteenth * composedNote.gate) : legacyDuration;
    const filter = graph.context.createBiquadFilter();
    const gain = graph.context.createGain();
    const body = graph.context.createOscillator();
    const air = graph.context.createOscillator();
    filter.type = 'lowpass';
    const answer = composedNote?.role === 'answer';
    filter.frequency.value = 620 + current.brightness * 32 + (composedNote?.accent ? 720 : 0);
    filter.Q.value = answer ? 1.8 : 0.65;
    body.type = answer ? 'sine' : current.mode === 'arpeggio' && current.composerEnabled ? 'sawtooth' : 'triangle'; body.frequency.value = frequency;
    air.type = 'sine'; air.frequency.value = frequency * (answer ? 3 : 2);
    const airGain = graph.context.createGain();
    airGain.gain.value = 0.09;
    gain.gain.setValueAtTime(0.0001, now);
    const peak = 0.28 * (composedNote?.velocity ?? 1) * (composedNote?.accent ? 1.12 : 1);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.035, peak), now + (answer ? 0.018 : 0.035));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    body.connect(filter); air.connect(airGain); airGain.connect(filter); filter.connect(gain); gain.connect(graph.melodyGain);
    body.start(now); air.start(now); body.stop(now + duration + 0.03); air.stop(now + duration + 0.03);
  }, []);

  const triggerMelodyDuck = useCallback((graph: Graph) => {
    const current = melodySettingsRef.current;
    if (!current.duck) return;
    const now = graph.context.currentTime;
    const floor = Math.max(0.05, 1 - current.duckDepth / 100 * 0.9);
    const releaseSeconds = current.duckRelease / 1000;
    graph.melodyDuckGain.gain.cancelScheduledValues(now);
    graph.melodyDuckGain.gain.setValueAtTime(floor, now);
    graph.melodyDuckGain.gain.exponentialRampToValueAtTime(1, now + releaseSeconds);
  }, []);

  const triggerSynthDuck = useCallback((graph: Graph) => {
    const current = settingsRef.current;
    if (!current.kickSpace) return;
    const now = graph.context.currentTime;
    // The low band makes the largest hole for the kick's weight. A subtle
    // full-band duck then reveals the attack without hollowing out the pad.
    const duck = (gain: AudioParam, depth: number, releaseMs: number, amount: number) => {
      const floor = Math.max(0.06, 1 - depth / 100 * amount);
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(Math.max(0.0001, gain.value), now);
      gain.exponentialRampToValueAtTime(floor, now + 0.008);
      gain.exponentialRampToValueAtTime(1, now + 0.008 + releaseMs / 1000);
    };
    duck(graph.synthBassDuckGain.gain, current.kickBassDuckDepth, current.kickBassDuckRelease, 0.92);
    duck(graph.synthDuckGain.gain, current.kickDuckDepth, current.kickDuckRelease, 0.86);
  }, []);

  const triggerAfterimage = useCallback((graph: Graph) => {
    const current = afterimageRef.current;
    if (!current.enabled) return;
    const dna = rumbleDnaRef.current;
    const now = graph.context.currentTime + 0.045;
    const scale = droneScales[settingsRef.current.scale].intervals;
    const mutationRange = Math.max(1, Math.round(current.mutation / 100 * 5));
    afterimageStepRef.current += 1;
    const degree = (afterimageStepRef.current * mutationRange + Math.floor(nextRandom() * (mutationRange + 1))) % scale.length;
    const profile = dna === 'cavern' ? { type: 'triangle' as OscillatorType, cutoff: 170, resonance: 1.5, length: 1.25, level: 0.13 }
      : dna === 'metal' ? { type: 'sine' as OscillatorType, cutoff: 680, resonance: 7, length: 0.46, level: 0.08 }
        : dna === 'dust' ? { type: 'sawtooth' as OscillatorType, cutoff: 360, resonance: 2.8, length: 0.72, level: 0.06 }
          : { type: 'sine' as OscillatorType, cutoff: 125, resonance: 0.8, length: 0.88, level: 0.16 };
    const duration = profile.length * (0.45 + current.erosion / 100 * 1.15);
    const oscillator = graph.context.createOscillator();
    const filter = graph.context.createBiquadFilter();
    const gain = graph.context.createGain();
    oscillator.type = profile.type;
    oscillator.frequency.setValueAtTime(freqForSemitone(settingsRef.current.basePitch - 12 + scale[degree]), now);
    oscillator.detune.value = (nextRandom() - 0.5) * current.mutation * 0.45;
    filter.type = 'lowpass';
    filter.frequency.value = profile.cutoff + current.mutation * 4;
    filter.Q.value = profile.resonance;
    const peak = profile.level * (0.28 + current.memory / 100 * 0.72);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(filter); filter.connect(gain); gain.connect(graph.mixerChannels.ritual.input);
    oscillator.start(now); oscillator.stop(now + duration + 0.03);
    oscillator.onended = () => { try { oscillator.disconnect(); filter.disconnect(); gain.disconnect(); } catch {} };
  }, [nextRandom]);

  const applyMelodyTranceGate = useCallback((graph: Graph, step: number) => {
    const current = melodySettingsRef.current;
    const now = graph.context.currentTime;
    if (!current.tranceGate) {
      graph.melodyGateGain.gain.setTargetAtTime(1, now, 0.015);
      return;
    }
    const active = current.gatePattern === 'quarter' ? step % 4 === 0
      : current.gatePattern === 'eighth' ? step % 2 === 0
        : current.gatePattern === 'sixteenth' ? true
          : [0, 3, 6, 10, 12].includes(step);
    const floor = Math.max(0.03, 1 - current.gateDepth / 100 * 0.97);
    graph.melodyGateGain.gain.cancelScheduledValues(now);
    graph.melodyGateGain.gain.setValueAtTime(active ? 1 : floor, now);
    if (active) graph.melodyGateGain.gain.exponentialRampToValueAtTime(floor, now + Math.min(0.08, 60 / technoSettingsRef.current.bpm / 5));
  }, []);

  const evolveTechnoPattern = useCallback(() => {
    const current = technoSettingsRef.current;
    const brokenKicks = [[0, 3, 7, 10, 12, 15], [0, 4, 7, 9, 12, 14], [0, 3, 6, 10, 12, 15]];
    const kicks = current.kickMode === 'four'
      ? euclideanSteps(4)
      : new Set(brokenKicks[Math.floor(nextRandom() * brokenKicks.length)]);
    const hats = euclideanSteps(current.hatPulses, 16, Math.floor(nextRandom() * 4));
    const snares = euclideanSteps(current.snarePulses, 16, 12);
    const ghostSnares = new Set<number>();
    [5, 6, 10, 11, 14].forEach((step) => {
      if (nextRandom() < current.snareDensity / 240) ghostSnares.add(step);
    });
    const toms = new Set<number>();
    if (nextRandom() < current.tomActivity / 100) {
      const rotation = nextRandom() < 0.5 ? 12 : 13;
      euclideanSteps(current.tomPulses, 4, rotation % 4).forEach((step) => toms.add(step + 12));
    }
    technoPatternRef.current = { kicks, hats, snares, ghostSnares, toms, hatChance: 0.48 + (current.hatDensity / 100) * 0.46 };
    setTechnoEvolution((count) => count + 1);
  }, [nextRandom]);

  const playTechnoKick = useCallback((graph: Graph) => {
    const now = graph.context.currentTime;
    const osc = graph.context.createOscillator();
    const gain = graph.context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(47, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.82, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.29);
    osc.connect(gain); gain.connect(graph.technoGain);
    osc.start(now); osc.stop(now + 0.32);
    triggerMelodyDuck(graph);
    triggerSynthDuck(graph);
    triggerAfterimage(graph);
  }, [triggerAfterimage, triggerMelodyDuck, triggerSynthDuck]);

  const playTechnoNoise = useCallback((graph: Graph, kind: 'hat' | 'snare', humanize = 0, lateMs = 0) => {
    const now = graph.context.currentTime + lateMs * 0.001 + (nextRandom() - 0.5) * humanize * 0.001;
    const duration = kind === 'hat' ? 0.07 : 0.16;
    const source = graph.context.createBufferSource();
    const buffer = graph.context.createBuffer(1, Math.ceil(graph.context.sampleRate * duration), graph.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    source.buffer = buffer;
    const filter = graph.context.createBiquadFilter();
    const gain = graph.context.createGain();
    filter.type = kind === 'hat' ? 'highpass' : 'bandpass';
    filter.frequency.value = kind === 'hat' ? 7200 : 1700;
    filter.Q.value = kind === 'hat' ? 0.9 : 0.7;
    const peak = kind === 'hat' ? 0.10 + nextRandom() * 0.09 : 0.20 + nextRandom() * 0.12;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter); filter.connect(gain); gain.connect(graph.technoGain);
    source.start(now); source.stop(now + duration + 0.01);
  }, [nextRandom]);

  const playTechnoTom = useCallback((graph: Graph, step: number, humanize = 0, lateMs = 0) => {
    const now = graph.context.currentTime + lateMs * 0.001 + (nextRandom() - 0.5) * humanize * 0.001;
    const osc = graph.context.createOscillator();
    const gain = graph.context.createGain();
    const frequencies = [176, 146, 122, 104];
    const frequency = frequencies[(step + Math.floor(nextRandom() * frequencies.length)) % frequencies.length];
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency * 1.6, now);
    osc.frequency.exponentialRampToValueAtTime(frequency, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.17, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    osc.connect(gain); gain.connect(graph.technoGain);
    osc.start(now); osc.stop(now + 0.38);
  }, [nextRandom]);

  // An independent, scale-locked acid voice: it lives beside the existing
  // constrained melody rather than replacing it, and only answers active
  // steps in the dedicated acid lane.
  const playAcidStep = useCallback((graph: Graph, step: number, lateMs = 0) => {
    const acid = acidSettingsRef.current;
    if (!acid.enabled || !acid.steps[step]) return;
    const now = graph.context.currentTime + lateMs * 0.001;
    const scale = droneScales[settingsRef.current.scale].intervals;
    const phrase = [0, 2, 1, 4, 3, 1, 5, 2, 0, 3, 6, 2, 4, 1, 5, 3];
    const degree = phrase[step] % scale.length;
    const frequency = freqForSemitone(melodySettingsRef.current.root + scale[degree] + acid.octave * 12);
    const accent = acid.accents[step];
    const duration = Math.min(0.34, 60 / technoSettingsRef.current.bpm * 0.72);
    const oscillator = graph.context.createOscillator();
    const filter = graph.context.createBiquadFilter();
    const drive = graph.context.createWaveShaper();
    const gain = graph.context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(acidLastFrequencyRef.current ?? frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency, now + Math.min(0.075, duration * 0.45));
    acidLastFrequencyRef.current = frequency;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(190 + acid.cutoff * 68 + (accent ? 1050 : 0), now);
    filter.frequency.exponentialRampToValueAtTime(130 + acid.cutoff * 24, now + duration);
    filter.Q.value = 1 + acid.resonance * 0.22;
    drive.curve = createDriveCurve(acid.drive / 100 * 0.24);
    drive.oversample = '2x';
    const peak = 0.09 + acid.accent / 100 * 0.09 + (accent ? 0.075 : 0);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(filter); filter.connect(drive); drive.connect(gain); gain.connect(graph.mixerChannels.acid.input);
    oscillator.start(now); oscillator.stop(now + duration + 0.025);
    oscillator.onended = () => { try { oscillator.disconnect(); filter.disconnect(); drive.disconnect(); gain.disconnect(); } catch {} };
  }, []);

  const scheduleTechnoStep = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || !technoPlayingRef.current || !runningRef.current || pausedRef.current) return;
    const step = technoStepRef.current % 16;
    if (step === 0) {
      const bar = technoBarRef.current;
      if (bar > 0 && bar % technoSettingsRef.current.evolveBars === 0) evolveTechnoPattern();
      if (melodySettingsRef.current.enabled && bar % melodySettingsRef.current.evolveBars === 0) evolveMelodyPhrase(bar > 0);
      const composition = melodyCompositionRef.current;
      if (melodySettingsRef.current.composerEnabled && composition?.bars.length) {
        const activeBar = bar % composition.bars.length;
        melodyActiveBarRef.current = activeBar;
        setMelodyActiveBar(activeBar);
      }
      technoBarRef.current += 1;
    }
    const pattern = technoPatternRef.current;
    const live = liveGridRef.current;
    const punch = liveGridArmedRef.current;
    const humanize = technoSettingsRef.current.humanize;
    const swingOffset = step % 2 === 1 ? (60 / technoSettingsRef.current.bpm / 4) * (technoSettingsRef.current.swing / 100) * 650 : 0;
    if (pattern.kicks.has(step) || (punch && live.kicks[step])) playTechnoKick(graph);
    if (pattern.snares.has(step) || (punch && live.snares[step])) playTechnoNoise(graph, 'snare', humanize, swingOffset);
    if (pattern.ghostSnares.has(step) && nextRandom() < 0.68) playTechnoNoise(graph, 'snare', humanize, swingOffset);
    if ((pattern.hats.has(step) && nextRandom() < pattern.hatChance) || (punch && live.hats[step])) playTechnoNoise(graph, 'hat', humanize, swingOffset);
    if (pattern.toms.has(step) || (punch && live.toms[step])) playTechnoTom(graph, step, humanize, swingOffset);
    applyMelodyTranceGate(graph, step);
    if (melodySettingsRef.current.enabled && melodySettingsRef.current.composerEnabled) {
      const composedNote = melodyCompositionRef.current?.bars[melodyActiveBarRef.current]?.steps[step] ?? null;
      if (composedNote) playScaleLockedMelody(graph, composedNote.degree, swingOffset, composedNote);
    } else {
      const melodyDegree = melodyPhraseRef.current[step];
      if (melodySettingsRef.current.enabled && melodyDegree !== null) playScaleLockedMelody(graph, melodyDegree, swingOffset);
    }
    playAcidStep(graph, step, swingOffset);
    technoStepRef.current += 1;
    technoTimerRef.current = window.setTimeout(() => scheduleTechnoStepRef.current(), (60 / technoSettingsRef.current.bpm / 4) * 1000);
  }, [applyMelodyTranceGate, evolveMelodyPhrase, evolveTechnoPattern, nextRandom, playAcidStep, playScaleLockedMelody, playTechnoKick, playTechnoNoise, playTechnoTom]);

  useEffect(() => { scheduleTechnoStepRef.current = scheduleTechnoStep; }, [scheduleTechnoStep]);
  useEffect(() => {
    const graph = graphRef.current;
    if (graph) graph.technoGain.gain.setTargetAtTime(technoSettings.volume / 100, graph.context.currentTime, 0.06);
  }, [technoSettings.volume]);
  useEffect(() => {
    const graph = graphRef.current;
    if (graph) graph.melodyGain.gain.setTargetAtTime(melodySettings.enabled ? melodySettings.volume / 100 : 0.0001, graph.context.currentTime, 0.12);
  }, [melodySettings.enabled, melodySettings.volume]);
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || melodySettings.duck) return;
    graph.melodyDuckGain.gain.setTargetAtTime(1, graph.context.currentTime, 0.04);
  }, [melodySettings.duck]);
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || melodySettings.tranceGate) return;
    graph.melodyGateGain.gain.setTargetAtTime(1, graph.context.currentTime, 0.04);
  }, [melodySettings.tranceGate]);
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.rumbleGain.gain.setTargetAtTime(technoPreset === 'rumble' ? 0.58 : 0.0001, graph.context.currentTime, 0.18);
  }, [technoPreset]);
  useEffect(() => () => { if (technoTimerRef.current) window.clearTimeout(technoTimerRef.current); }, []);

  const toggleTechnoMachine = useCallback(() => {
    if (technoPlayingRef.current) {
      if (technoTimerRef.current) window.clearTimeout(technoTimerRef.current);
      technoTimerRef.current = null;
      technoPlayingRef.current = false;
      setTechnoPlaying(false);
      return;
    }
    technoStepRef.current = 0;
    technoBarRef.current = 0;
    evolveTechnoPattern();
    evolveMelodyPhrase(false);
    setTechnoPlaying(true);
    technoPlayingRef.current = true;
    void ensureAudio().then(() => scheduleTechnoStepRef.current());
  }, [ensureAudio, evolveMelodyPhrase, evolveTechnoPattern]);

  const applyTechnoPreset = useCallback((preset: TechnoPresetName) => {
    const presets: Record<typeof preset, Partial<TechnoSettings>> = {
      classic: { bpm: 132, hatPulses: 8, snarePulses: 1, tomPulses: 1, hatDensity: 64, snareDensity: 18, tomActivity: 20, evolveBars: 8, humanize: 7, swing: 0, kickMode: 'four' },
      detroit: { bpm: 128, hatPulses: 9, snarePulses: 2, tomPulses: 1, hatDensity: 72, snareDensity: 45, tomActivity: 25, evolveBars: 6, humanize: 11, swing: 28, kickMode: 'four' },
      hardgroove: { bpm: 136, hatPulses: 12, snarePulses: 1, tomPulses: 3, hatDensity: 84, snareDensity: 24, tomActivity: 72, evolveBars: 4, humanize: 9, swing: 8, kickMode: 'four' },
      rumble: { bpm: 132, hatPulses: 5, snarePulses: 1, tomPulses: 1, hatDensity: 52, snareDensity: 12, tomActivity: 14, evolveBars: 12, humanize: 4, swing: 0, kickMode: 'four' },
      broken: { bpm: 136, hatPulses: 10, snarePulses: 3, tomPulses: 2, hatDensity: 76, snareDensity: 34, tomActivity: 42, evolveBars: 4, humanize: 12, swing: 16, kickMode: 'broken' },
    };
    const next = { ...technoSettingsRef.current, ...presets[preset] };
    technoSettingsRef.current = next;
    setTechnoSettings(next);
    setTechnoPreset(preset);
    evolveTechnoPattern();
  }, [evolveTechnoPattern]);

  const mixTechnoMachine = useCallback(() => {
    const next: TechnoSettings = {
      ...technoSettingsRef.current,
      bpm: 124 + Math.floor(nextRandom() * 16),
      hatPulses: 5 + Math.floor(nextRandom() * 10),
      snarePulses: 1 + Math.floor(nextRandom() * 3),
      tomPulses: Math.floor(nextRandom() * 5),
      hatDensity: 45 + Math.floor(nextRandom() * 51),
      snareDensity: Math.floor(nextRandom() * 56),
      tomActivity: Math.floor(nextRandom() * 66),
      evolveBars: 2 + Math.floor(nextRandom() * 11),
      humanize: 3 + Math.floor(nextRandom() * 16),
      swing: Math.floor(nextRandom() * 35),
      kickMode: nextRandom() < 0.22 ? 'broken' : 'four',
    };
    technoSettingsRef.current = next;
    setTechnoSettings(next);
    setTechnoPreset('mix');
    evolveTechnoPattern();
  }, [evolveTechnoPattern, nextRandom]);

  const toggleLiveGridCell = useCallback((lane: keyof LiveGrid, step: number) => {
    setLiveGrid((current) => ({ ...current, [lane]: current[lane].map((active, index) => index === step ? !active : active) }));
  }, []);

  const clearLiveGrid = useCallback(() => setLiveGrid(defaultLiveGrid()), []);

  const setDeckLevel = useCallback((deck: 'groove' | 'melodic' | 'atmosphere', value: number) => {
    setDeckLevels((current) => ({ ...current, [deck]: value }));
    if (deck === 'groove') setTechnoSettings((current) => ({ ...current, volume: value }));
    if (deck === 'melodic') setMelodySettings((current) => ({ ...current, volume: value, enabled: value > 0 }));
    if (deck === 'atmosphere') setSettings((current) => ({ ...current, masterVolume: clamp(value / 100 * 0.75, 0.05, 0.75) }));
  }, []);

  const focusDeck = useCallback((deck: 'groove' | 'melodic' | 'atmosphere') => {
    setDeckFocus(deck);
    if (deck === 'groove') { setDeckLevel('groove', 78); setDeckLevel('melodic', 22); setDeckLevel('atmosphere', 48); setMacros((current) => ({ ...current, weight: 82, bloom: 24 })); }
    if (deck === 'melodic') { setDeckLevel('groove', 48); setDeckLevel('melodic', 62); setDeckLevel('atmosphere', 58); setMacros((current) => ({ ...current, weight: 36, bloom: 62, distance: 54 })); }
    if (deck === 'atmosphere') { setDeckLevel('groove', 34); setDeckLevel('melodic', 26); setDeckLevel('atmosphere', 68); setMacros((current) => ({ ...current, bloom: 78, weight: 28, distance: 76 })); }
  }, [setDeckLevel]);

  const updateMixerChannel = useCallback(<K extends keyof MixerChannelSetting>(channel: MixerChannelId, key: K, value: MixerChannelSetting[K]) => {
    setMixerSettings((current) => ({ ...current, [channel]: { ...current[channel], [key]: value } }));
  }, []);

  const resetMixer = useCallback(() => setMixerSettings(defaultMixerSettings()), []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.context.currentTime;
    mixerChannelMeta.forEach(({ id }) => {
      const setting = mixerSettings[id];
      const nodes = graph.mixerChannels[id];
      const level = setting.muted ? 0.0001 : Math.max(0.0001, Math.pow(setting.volume / 100, 1.45));
      nodes.output.gain.setTargetAtTime(level, now, 0.035);
      nodes.low.gain.setTargetAtTime(setting.low, now, 0.045);
      nodes.mid.gain.setTargetAtTime(setting.mid, now, 0.045);
      nodes.high.gain.setTargetAtTime(setting.high, now, 0.045);
    });
  }, [mixerSettings]);

  useEffect(() => {
    if (!paused && technoPlayingRef.current && !technoTimerRef.current) scheduleTechnoStepRef.current();
  }, [paused]);

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
    const secondsPerStep = midiClockSync && midiBpm ? 60 / midiBpm : pulseSpeed;
    graph.pulseTimer = window.setTimeout(() => schedulePulseRef.current(), step * secondsPerStep * 1000);
  }, [midiBpm, midiClockSync, pulsePattern, pulseDepth, pulseSpeed, triggerPulseHit]);

  useEffect(() => { schedulePulseRef.current = schedulePulse; }, [schedulePulse]);

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
  }, [pulsePattern, running, midiClockSync, midiBpm]);

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

  // ── Keyboard Play: soft, scale-locked notes triggered by hand ────

  const playKey = useCallback(async (key: string) => {
    const mapping = keyboardKeyMap[key];
    if (!mapping || keyVoicesRef.current.has(key)) return;
    const graph = await ensureAudio();
    const current = settingsRef.current;
    const scale = droneScales[current.scale].intervals;
    const baseMidi = Math.round(12 * Math.log2(current.basePitch / 16.351));
    const octaveJump = Math.floor(mapping.degreeIndex / scale.length);
    const semitone = scale[mapping.degreeIndex % scale.length] + octaveJump * 12;
    const frequency = freqForSemitone(baseMidi + semitone + mapping.octaveOffset + keyboardTranspose);
    const now = graph.context.currentTime;

    const filter = graph.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2800;
    filter.Q.value = 0.8;
    const panner = graph.context.createStereoPanner();
    panner.pan.value = (nextRandom() * 2 - 1) * 0.3;
    const gain = graph.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    // Bring the hand-played notes forward again: a quick, click-free attack
    // and a fuller level make each key feel immediate above the drone.
    gain.gain.exponentialRampToValueAtTime(0.34, now + 0.025);

    const oscillators: OscillatorNode[] = [];
    for (const detune of [-6, 6]) {
      const osc = graph.context.createOscillator();
      const oscGain = graph.context.createGain();
      osc.type = current.waveform;
      osc.frequency.value = frequency;
      osc.detune.value = detune;
      oscGain.gain.value = 0.72;
      osc.connect(oscGain); oscGain.connect(filter); osc.start();
      oscillators.push(osc);
    }
    if (keyboardShine > 0) {
      const shineOsc = graph.context.createOscillator();
      const shineGain = graph.context.createGain();
      shineOsc.type = 'sine';
      shineOsc.frequency.value = frequency * 2;
      shineGain.gain.value = keyboardShine / 100 * 0.18;
      shineOsc.connect(shineGain); shineGain.connect(filter); shineOsc.start();
      oscillators.push(shineOsc);
    }
    const subOsc = graph.context.createOscillator();
    const subGain = graph.context.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.value = frequency / 2;
    subGain.gain.value = 0.36;
    subOsc.connect(subGain); subGain.connect(filter); subOsc.start();

    filter.connect(gain); gain.connect(panner);
    panner.connect(graph.mixerChannels.drone.input);

    keyVoicesRef.current.set(key, { oscillators, subOsc, gain, filter, panner });
    setActiveKeys((previous) => ({ ...previous, [key]: true }));
  }, [ensureAudio, keyboardShine, keyboardTranspose, nextRandom]);

  const releaseKey = useCallback((key: string) => {
    const graph = graphRef.current;
    const voice = keyVoicesRef.current.get(key);
    keyVoicesRef.current.delete(key);
    setActiveKeys((previous) => { const next = { ...previous }; delete next[key]; return next; });
    if (!graph || !voice) return;
    const now = graph.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, 0.7);
    window.setTimeout(() => {
      voice.oscillators.forEach((osc) => { try { osc.stop(); } catch {} });
      try { voice.subOsc.stop(); } catch {}
      try { voice.filter.disconnect(); } catch {}
      try { voice.gain.disconnect(); } catch {}
      try { voice.panner.disconnect(); } catch {}
    }, 1500);
  }, []);

  // MIDI notes use the same Web Audio bus and long-tail treatment as keyboard
  // notes, but retain their own identities so note-off messages can release
  // exactly the voice that the DAW started (including per-channel notes).
  const playMidiNote = useCallback(async (voiceKey: string, note: number, velocity: number) => {
    if (midiVoicesRef.current.has(voiceKey)) return;
    const graph = await ensureAudio();
    const current = settingsRef.current;
    const now = graph.context.currentTime;
    const filter = graph.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2800;
    filter.Q.value = 0.8;
    const panner = graph.context.createStereoPanner();
    panner.pan.value = (nextRandom() * 2 - 1) * 0.3;
    const gain = graph.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1 + (velocity / 127) * 0.28, now + 0.025);
    const frequency = 440 * Math.pow(2, (note - 69) / 12);
    const oscillators: OscillatorNode[] = [];
    for (const detune of [-6, 6]) {
      const osc = graph.context.createOscillator();
      const oscGain = graph.context.createGain();
      osc.type = current.waveform;
      osc.frequency.value = frequency;
      osc.detune.value = detune;
      oscGain.gain.value = 0.72;
      osc.connect(oscGain); oscGain.connect(filter); osc.start();
      oscillators.push(osc);
    }
    if (keyboardShine > 0) {
      const shineOsc = graph.context.createOscillator();
      const shineGain = graph.context.createGain();
      shineOsc.type = 'sine';
      shineOsc.frequency.value = frequency * 2;
      shineGain.gain.value = keyboardShine / 100 * 0.18;
      shineOsc.connect(shineGain); shineGain.connect(filter); shineOsc.start();
      oscillators.push(shineOsc);
    }
    const subOsc = graph.context.createOscillator();
    const subGain = graph.context.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.value = frequency / 2;
    subGain.gain.value = 0.36;
    subOsc.connect(subGain); subGain.connect(filter); subOsc.start();
    filter.connect(gain); gain.connect(panner);
    panner.connect(graph.mixerChannels.drone.input);
    midiVoicesRef.current.set(voiceKey, { oscillators, subOsc, gain, filter, panner });
  }, [ensureAudio, keyboardShine, nextRandom]);

  const releaseMidiNote = useCallback((voiceKey: string) => {
    const graph = graphRef.current;
    const voice = midiVoicesRef.current.get(voiceKey);
    midiVoicesRef.current.delete(voiceKey);
    if (!graph || !voice) return;
    const now = graph.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, 0.7);
    window.setTimeout(() => {
      voice.oscillators.forEach((osc) => { try { osc.stop(); } catch {} });
      try { voice.subOsc.stop(); } catch {}
      try { voice.filter.disconnect(); } catch {}
      try { voice.gain.disconnect(); } catch {}
      try { voice.panner.disconnect(); } catch {}
    }, 1500);
  }, []);

  const refreshMidiPorts = useCallback(async () => {
    if (!isTauri()) {
      setMidiStatus('MIDI input is available in the installed Hi Drone desktop app');
      return;
    }
    try {
      const ports = await invoke<MidiInputPort[]>('list_midi_inputs');
      setMidiPorts(ports);
      setMidiPortIndex((current) => current ?? ports[0]?.index ?? null);
      setMidiStatus(ports.length ? `${ports.length} MIDI input${ports.length === 1 ? '' : 's'} found` : 'No MIDI inputs found');
    } catch (error) {
      setMidiStatus(`MIDI scan failed: ${String(error)}`);
    }
  }, []);

  const connectMidi = useCallback(async () => {
    if (midiPortIndex === null) { setMidiStatus('Choose a MIDI input first'); return; }
    try {
      setMidiStatus('Connecting…');
      await invoke('connect_midi_input', { inputIndex: midiPortIndex });
    } catch (error) {
      setMidiStatus(`MIDI connection failed: ${String(error)}`);
    }
  }, [midiPortIndex]);

  const disconnectMidi = useCallback(async () => {
    try { await invoke('disconnect_midi_input'); } catch { /* native bridge may already be gone during app shutdown */ }
    midiVoicesRef.current.forEach((_, key) => releaseMidiNote(key));
    setMidiBpm(null);
  }, [releaseMidiNote]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlistenMessage: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;
    void listen<MidiMessage>('midi-message', ({ payload }) => {
      if (payload.messageType === 'clock' && midiClockSyncRef.current) {
        const now = performance.now();
        const clock = midiClockRef.current;
        if (clock.ticks === 0) clock.startedAt = now;
        clock.ticks += 1;
        if (clock.ticks >= 24) {
          const bpm = 60_000 / (now - clock.startedAt);
          if (bpm >= 20 && bpm <= 400) setMidiBpm(Math.round(bpm * 10) / 10);
          clock.ticks = 0;
          clock.startedAt = now;
        }
        return;
      }
      if (payload.note === null) return;
      const voiceKey = `${payload.channel ?? 0}:${payload.note}`;
      if (payload.messageType === 'noteOn') {
        if (midiModeRef.current === 'trigger') void playMidiNote(voiceKey, payload.note, payload.velocity ?? 100);
        if (midiModeRef.current === 'root') {
          midiHeldRootsRef.current.delete(voiceKey);
          midiHeldRootsRef.current.set(voiceKey, payload.note);
          midiRootNoteRef.current = payload.note;
          setMidiRootNote(payload.note);
        }
      } else if (payload.messageType === 'noteOff') {
        if (midiModeRef.current === 'trigger') releaseMidiNote(voiceKey);
        if (midiModeRef.current === 'root') {
          midiHeldRootsRef.current.delete(voiceKey);
          midiRootNoteRef.current = Array.from(midiHeldRootsRef.current.values()).at(-1) ?? null;
          setMidiRootNote(midiRootNoteRef.current);
        }
      }
    }).then((unlisten) => { if (disposed) unlisten(); else unlistenMessage = unlisten; });
    void listen<MidiStatus>('midi-status', ({ payload }) => setMidiStatus(payload.message)).then((unlisten) => { if (disposed) unlisten(); else unlistenStatus = unlisten; });
    return () => { disposed = true; unlistenMessage?.(); unlistenStatus?.(); };
  }, [playMidiNote, releaseMidiNote]);

  useEffect(() => {
    if (!keyboardPlayOn) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (!keyboardKeyMap[key]) return;
      event.preventDefault();
      void playKey(key);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      releaseKey(event.key.toLowerCase());
    };
    const releaseAllKeys = () => {
      Array.from(keyVoicesRef.current.keys()).forEach(releaseKey);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) releaseAllKeys();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', releaseAllKeys);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseAllKeys);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseAllKeys();
    };
  }, [keyboardPlayOn, playKey, releaseKey]);

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

  // The mastering display makes the final part of the signal chain tangible:
  // the EQ curve is calculated from the actual Web Audio filters and the two
  // gain-reduction meters read directly from their compressor nodes.
  useEffect(() => {
    if (!started) return;
    const canvas = masteringCanvasRef.current;
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
      const pad = 18 * ratio;
      const eqWidth = canvasW * 0.58;
      const eqTop = 26 * ratio;
      const eqBottom = canvasH - 18 * ratio;
      const eqHeight = eqBottom - eqTop;
      const midY = eqTop + eqHeight / 2;
      context2d.clearRect(0, 0, canvasW, canvasH);
      context2d.fillStyle = 'rgba(8, 8, 13, 0.65)';
      context2d.fillRect(0, 0, canvasW, canvasH);

      context2d.font = `${10 * ratio}px SF Mono, monospace`;
      context2d.fillStyle = '#777789';
      context2d.fillText('EQ CURVE', pad, 15 * ratio);
      context2d.fillText('+12', 2 * ratio, eqTop + 4 * ratio);
      context2d.fillText('0', 8 * ratio, midY + 4 * ratio);
      context2d.fillText('−12', 2 * ratio, eqBottom);
      context2d.strokeStyle = 'rgba(200, 200, 208, 0.13)';
      context2d.lineWidth = ratio;
      for (const level of [-12, 0, 12]) {
        const y = midY - (level / 24) * eqHeight;
        context2d.beginPath(); context2d.moveTo(pad, y); context2d.lineTo(eqWidth - pad, y); context2d.stroke();
      }
      for (const position of [0.1, 0.32, 0.56, 0.8]) {
        const x = pad + (eqWidth - pad * 2) * position;
        context2d.beginPath(); context2d.moveTo(x, eqTop); context2d.lineTo(x, eqBottom); context2d.stroke();
      }
      const points = 120;
      const frequencies = new Float32Array(points);
      const magnitude = new Float32Array(points);
      const phase = new Float32Array(points);
      for (let index = 0; index < points; index += 1) frequencies[index] = 30 * Math.pow(18000 / 30, index / (points - 1));
      if (graph) {
        const low = new Float32Array(points); const mid = new Float32Array(points); const high = new Float32Array(points);
        graph.eqLow.getFrequencyResponse(frequencies, low, phase);
        graph.eqMid.getFrequencyResponse(frequencies, mid, phase);
        graph.eqHigh.getFrequencyResponse(frequencies, high, phase);
        for (let index = 0; index < points; index += 1) magnitude[index] = low[index] * mid[index] * high[index];
      } else {
        magnitude.fill(1);
      }
      context2d.beginPath();
      for (let index = 0; index < points; index += 1) {
        const db = Math.max(-24, Math.min(24, 20 * Math.log10(Math.max(magnitude[index], 0.0001))));
        const x = pad + (eqWidth - pad * 2) * (index / (points - 1));
        const y = midY - (db / 24) * eqHeight;
        if (index === 0) context2d.moveTo(x, y); else context2d.lineTo(x, y);
      }
      context2d.strokeStyle = '#8d7cff';
      context2d.lineWidth = 2 * ratio;
      context2d.shadowColor = 'rgba(108, 92, 231, 0.7)';
      context2d.shadowBlur = 8 * ratio;
      context2d.stroke();
      context2d.shadowBlur = 0;
      context2d.fillStyle = '#777789';
      context2d.fillText('30 Hz', pad, canvasH - 3 * ratio);
      context2d.fillText('1 kHz', eqWidth * 0.48, canvasH - 3 * ratio);
      context2d.fillText('18 kHz', eqWidth - 48 * ratio, canvasH - 3 * ratio);

      const meterLeft = eqWidth + 8 * ratio;
      const meterWidth = canvasW - meterLeft - pad;
      const drawReduction = (label: string, reduction: number, y: number, color: string) => {
        const reductionDb = Math.max(0, -reduction);
        const meterHeight = 13 * ratio;
        const barY = y + 9 * ratio;
        context2d.fillStyle = '#777789';
        context2d.fillText(label, meterLeft, y);
        context2d.fillStyle = '#c8c8d0';
        context2d.textAlign = 'right';
        context2d.fillText(`${reductionDb.toFixed(1)} dB GR`, canvasW - pad, y);
        context2d.textAlign = 'left';
        context2d.fillStyle = 'rgba(255,255,255,0.08)';
        context2d.fillRect(meterLeft, barY, meterWidth, meterHeight);
        const fill = Math.min(1, reductionDb / 24) * meterWidth;
        context2d.fillStyle = color;
        context2d.fillRect(meterLeft, barY, fill, meterHeight);
      };
      drawReduction('COMPRESSOR', graph?.compressor.reduction ?? 0, eqTop + 14 * ratio, '#00b894');
      drawReduction('LIMITER', graph?.limiter.reduction ?? 0, eqTop + 72 * ratio, '#e17055');
      const now = performance.now();
      if (now - masterMeterTickRef.current > 120) {
        masterMeterTickRef.current = now;
        const compressor = Number(Math.max(0, -(graph?.compressor.reduction ?? 0)).toFixed(1));
        const limiter = Number(Math.max(0, -(graph?.limiter.reduction ?? 0)).toFixed(1));
        setMasterMeter((current) => current.compressor === compressor && current.limiter === limiter ? current : { compressor, limiter });
      }
      context2d.font = `${9 * ratio}px SF Mono, monospace`;
      context2d.fillStyle = '#5a5a68';
      context2d.fillText('0', meterLeft, eqBottom);
      context2d.textAlign = 'right'; context2d.fillText('24 dB', canvasW - pad, eqBottom); context2d.textAlign = 'left';
      frame = window.requestAnimationFrame(draw);
    };
    draw();
    return () => window.cancelAnimationFrame(frame);
  }, [started, settings]);

  useEffect(() => {
    const canvas = sampleWaveformRef.current;
    const graph = graphRef.current;
    if (!canvas || !sampleLoaded || !graph?.sampleBuffer) return;
    const context2d = canvas.getContext('2d');
    if (!context2d) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const canvasW = canvas.width;
    const canvasH = canvas.height;
    const data = graph.sampleBuffer.getChannelData(0);
    const step = Math.max(1, Math.ceil(data.length / canvasW));
    context2d.clearRect(0, 0, canvasW, canvasH);
    context2d.fillStyle = 'rgba(108, 92, 231, 0.07)'; context2d.fillRect(0, 0, canvasW, canvasH);
    context2d.strokeStyle = 'rgba(200, 200, 208, 0.12)'; context2d.beginPath(); context2d.moveTo(0, canvasH / 2); context2d.lineTo(canvasW, canvasH / 2); context2d.stroke();
    context2d.strokeStyle = 'rgba(141, 124, 255, 0.78)'; context2d.lineWidth = ratio;
    context2d.beginPath();
    for (let x = 0; x < canvasW; x += 1) {
      const start = x * step;
      let min = 1; let max = -1;
      for (let index = start; index < Math.min(start + step, data.length); index += 1) { min = Math.min(min, data[index]); max = Math.max(max, data[index]); }
      context2d.moveTo(x, (1 + min) * canvasH / 2); context2d.lineTo(x, (1 + max) * canvasH / 2);
    }
    context2d.stroke();
    const markerX = Math.min(canvasW - ratio, Math.max(0, samplePosition * canvasW));
    context2d.fillStyle = '#e17055'; context2d.fillRect(markerX, 0, 2 * ratio, canvasH);
  }, [sampleLoaded, samplePosition, vocalRenderStatus]);

  const updateRitualIntensity = useCallback((value: number) => {
    const intensity = clamp(value, 0, 100);
    setRitualIntensity(intensity);
    setAfterimage({
      enabled: intensity > 3,
      memory: Math.round(clamp(18 + intensity * 0.84, 0, 100)),
      erosion: Math.round(clamp(16 + intensity * 0.74, 0, 100)),
      mutation: Math.round(clamp((intensity - 18) * 1.08, 0, 100)),
    });
    setSettings((current) => ({
      ...current,
      drumDriveAmount: 0.035 + intensity * 0.0013,
      kickDuckDepth: 14 + intensity * 0.24,
      kickBassDuckDepth: 55 + intensity * 0.38,
      kickBassDuckRelease: 180 + intensity * 1.55,
    }));
    setMacros((current) => ({
      ...current,
      bloom: Math.round(intensity * 0.58),
      motion: Math.round(intensity * 0.48),
      distance: Math.round(intensity * 0.35),
    }));
  }, []);

  const stopConductor = useCallback(() => {
    conductorVersionRef.current += 1;
    if (conductorTimerRef.current) window.clearTimeout(conductorTimerRef.current);
    conductorTimerRef.current = null;
    setConductorTarget(null);
    setConductorProgress(0);
  }, []);

  const applyArtistScene = useCallback((id: ArtistSceneId) => {
    const scene = artistScenes[id];
    stopConductor();
    setSettings((current) => ({ ...current, ...scene.settings }));
    setTechnoSettings((current) => {
      const next = { ...current, ...scene.techno };
      technoSettingsRef.current = next;
      return next;
    });
    setMelodySettings((current) => ({ ...current, ...scene.melody }));
    setMacros((current) => ({ ...current, ...scene.macros }));
    setAcidSettings((current) => ({ ...current, ...scene.acid }));
    setRumbleDna(scene.rumble);
    updateRitualIntensity(scene.ritual);
    setActiveArtistScene(id);
    setRitualStatus(`${scene.title} loaded — ${scene.artist} performance philosophy`);
  }, [stopConductor, updateRitualIntensity]);

  const conductArtistScene = useCallback((id: ArtistSceneId) => {
    const scene = artistScenes[id];
    stopConductor();
    const version = conductorVersionRef.current + 1;
    conductorVersionRef.current = version;
    const waitForBar = technoPlayingRef.current
      ? Math.max(0, (16 - (technoStepRef.current % 16)) * (60 / technoSettingsRef.current.bpm / 4) * 1000)
      : 0;
    setConductorTarget(id);
    setConductorProgress(0);
    setRitualStatus(`${scene.title} queued for the next bar · ${conductorBars} bars`);
    const begin = () => {
      if (version !== conductorVersionRef.current) return;
      const sourceMacros = { ...macros };
      const sourceTechno = { ...technoSettingsRef.current };
      const sourceMelody = { ...melodySettings };
      const sourceAcid = { ...acidSettingsRef.current };
      const startedAt = performance.now();
      const duration = Math.max(1, conductorBars * 4 * 60 / sourceTechno.bpm * 1000);
      const tick = () => {
        if (version !== conductorVersionRef.current) return;
        const amount = clamp((performance.now() - startedAt) / duration, 0, 1);
        setMacros({
          bloom: lerp(sourceMacros.bloom, scene.macros.bloom ?? sourceMacros.bloom, amount),
          weight: lerp(sourceMacros.weight, scene.macros.weight ?? sourceMacros.weight, amount),
          motion: lerp(sourceMacros.motion, scene.macros.motion ?? sourceMacros.motion, amount),
          distance: lerp(sourceMacros.distance, scene.macros.distance ?? sourceMacros.distance, amount),
        });
        setTechnoSettings((current) => {
          const next = {
            ...current,
            bpm: Math.round(lerp(sourceTechno.bpm, scene.techno.bpm ?? sourceTechno.bpm, amount)),
            hatDensity: lerp(sourceTechno.hatDensity, scene.techno.hatDensity ?? sourceTechno.hatDensity, amount),
            tomActivity: lerp(sourceTechno.tomActivity, scene.techno.tomActivity ?? sourceTechno.tomActivity, amount),
            volume: lerp(sourceTechno.volume, scene.techno.volume ?? sourceTechno.volume, amount),
          };
          technoSettingsRef.current = next;
          return next;
        });
        setMelodySettings((current) => ({
          ...current,
          density: lerp(sourceMelody.density, scene.melody.density ?? sourceMelody.density, amount),
          brightness: lerp(sourceMelody.brightness, scene.melody.brightness ?? sourceMelody.brightness, amount),
          volume: lerp(sourceMelody.volume, scene.melody.volume ?? sourceMelody.volume, amount),
        }));
        setAcidSettings((current) => ({
          ...current,
          cutoff: lerp(sourceAcid.cutoff, scene.acid.cutoff ?? sourceAcid.cutoff, amount),
          resonance: lerp(sourceAcid.resonance, scene.acid.resonance ?? sourceAcid.resonance, amount),
          drive: lerp(sourceAcid.drive, scene.acid.drive ?? sourceAcid.drive, amount),
          accent: lerp(sourceAcid.accent, scene.acid.accent ?? sourceAcid.accent, amount),
        }));
        setConductorProgress(amount);
        if (amount < 1) { conductorTimerRef.current = window.setTimeout(tick, 70); return; }
        setSettings((current) => ({ ...current, ...scene.settings }));
        setTechnoSettings((current) => {
          const next = { ...current, ...scene.techno };
          technoSettingsRef.current = next;
          return next;
        });
        setMelodySettings((current) => ({ ...current, ...scene.melody }));
        setAcidSettings((current) => ({ ...current, ...scene.acid }));
        setRumbleDna(scene.rumble);
        updateRitualIntensity(scene.ritual);
        setActiveArtistScene(id); setConductorTarget(null); setConductorProgress(0); conductorTimerRef.current = null;
        setRitualStatus(`${scene.title} arrived`);
      };
      tick();
    };
    conductorTimerRef.current = window.setTimeout(begin, waitForBar);
  }, [conductorBars, macros, melodySettings, stopConductor, updateRitualIntensity]);

  const updatePerformanceMacro = useCallback((name: keyof PerformanceMacros, value: number) => {
    setMacros((current) => {
      const next = { ...current, [name]: value };
      if (gestureRecording) {
        const frame = { at: performance.now() - gestureRecordStartRef.current, macros: next };
        gestureFramesRef.current.push(frame);
        setGestureFrames([...gestureFramesRef.current]);
      }
      return next;
    });
  }, [gestureRecording]);

  const stopGesturePlayback = useCallback(() => {
    if (gesturePlaybackTimerRef.current) window.clearTimeout(gesturePlaybackTimerRef.current);
    gesturePlaybackTimerRef.current = null;
    setGesturePlaying(false);
  }, []);

  const toggleGestureRecording = useCallback(() => {
    if (gestureRecording) { setGestureRecording(false); setRitualStatus(`${gestureFramesRef.current.length} gesture frames captured`); return; }
    stopGesturePlayback();
    gestureFramesRef.current = [];
    setGestureFrames([]);
    gestureRecordStartRef.current = performance.now();
    setGestureRecording(true);
    setRitualStatus('Gesture recording — move the performance macros');
  }, [gestureRecording, stopGesturePlayback]);

  const playGesture = useCallback(() => {
    const frames = gestureFramesRef.current;
    if (!frames.length) { setRitualStatus('Record a macro gesture first'); return; }
    stopGesturePlayback();
    setGesturePlaying(true);
    let index = 0;
    const play = () => {
      const frame = frames[index];
      if (!frame) { stopGesturePlayback(); return; }
      setMacros(frame.macros);
      index += 1;
      const delay = Math.max(16, (frames[index]?.at ?? frame.at) - frame.at);
      gesturePlaybackTimerRef.current = window.setTimeout(play, delay);
    };
    play();
  }, [stopGesturePlayback]);

  useEffect(() => () => {
    if (conductorTimerRef.current) window.clearTimeout(conductorTimerRef.current);
    if (gesturePlaybackTimerRef.current) window.clearTimeout(gesturePlaybackTimerRef.current);
  }, []);

  const mutateRitual = useCallback(() => {
    evolveTechnoPattern();
    evolveMelodyPhrase(true);
    setAfterimage((current) => ({ ...current, mutation: Math.round(clamp(current.mutation + (nextRandom() - 0.35) * 28, 0, 100)) }));
    setHarmonicGravity((current) => clamp(current + (nextRandom() - 0.5) * 18, 0, 100));
    setRitualStatus(`World mutated · ${rumbleDnaRef.current.toUpperCase()} DNA`);
  }, [evolveMelodyPhrase, evolveTechnoPattern, nextRandom]);

  const triggerRitualTectonic = useCallback(() => {
    const preferred = ritualNextSceneRef.current;
    const fallback = preferred === 'a' ? 'b' : 'a';
    const target = scenes[preferred] ? preferred : scenes[fallback] ? fallback : null;
    if (!target) {
      captureScene('a');
      ritualNextSceneRef.current = 'b';
      setRitualStatus('Tectonic anchor A stored — reshape the world, then store B');
      return;
    }
    morphToScene(target);
    ritualNextSceneRef.current = target === 'a' ? 'b' : 'a';
    setBlackoutMode(true);
    setRitualStatus(`Tectonic shift toward ${target.toUpperCase()}`);
  }, [captureScene, morphToScene, scenes]);

  const beginRitualGesture = useCallback(() => {
    ritualLongPressRef.current = false;
    if (ritualPressTimerRef.current) window.clearTimeout(ritualPressTimerRef.current);
    ritualPressTimerRef.current = window.setTimeout(() => {
      ritualLongPressRef.current = true;
      setBlackoutMode(true);
      void captureRitual();
    }, 620);
  }, [captureRitual]);

  const endRitualGesture = useCallback(() => {
    if (ritualPressTimerRef.current) window.clearTimeout(ritualPressTimerRef.current);
    ritualPressTimerRef.current = null;
    if (ritualLongPressRef.current) return;
    if (ritualTapTimerRef.current) {
      window.clearTimeout(ritualTapTimerRef.current);
      ritualTapTimerRef.current = null;
      triggerRitualTectonic();
      return;
    }
    ritualTapTimerRef.current = window.setTimeout(() => {
      ritualTapTimerRef.current = null;
      mutateRitual();
    }, 260);
  }, [mutateRitual, triggerRitualTectonic]);

  const cancelRitualGesture = useCallback(() => {
    if (ritualPressTimerRef.current) window.clearTimeout(ritualPressTimerRef.current);
    ritualPressTimerRef.current = null;
  }, []);

  useEffect(() => () => {
    if (ritualPressTimerRef.current) window.clearTimeout(ritualPressTimerRef.current);
    if (ritualTapTimerRef.current) window.clearTimeout(ritualTapTimerRef.current);
  }, []);

  const onDropZoneDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) void handleSampleFile(file);
  }, [handleSampleFile]);

  const status = paused ? 'Paused' : running ? 'Generating' : 'Standby';
  const gentleMasterGlue = settings.masterSaturation === 0.025 && settings.compThreshold === -12 && settings.compRatio === 2 && settings.compAttack === 0.03 && settings.compRelease === 0.25 && settings.limiterCeiling === -1;
  const performanceSources = [
    { label: 'Drone', color: 'drone', active: running && voiceCount > 0 },
    { label: 'Machine', color: 'machine', active: technoPlaying },
    { label: 'Melody', color: 'melody', active: melodySettings.enabled && technoPlaying },
    { label: 'Acid', color: 'acid', active: acidSettings.enabled },
    { label: 'Input', color: 'input', active: sampleActive || micState === 'recording' },
    { label: 'Pulse', color: 'pulse', active: running && pulsePattern !== 'off' },
    { label: 'Ritual', color: 'ritual', active: ritualIntensity > 0 },
  ];
  const mixerActivity: Record<MixerChannelId, boolean> = {
    drone: running && voiceCount > 0,
    machine: technoPlaying,
    melody: melodySettings.enabled && technoPlaying,
    acid: acidSettings.enabled,
    input: sampleActive || micState === 'recording',
    pulse: running && pulsePattern !== 'off',
    ritual: ritualIntensity > 0,
    master: started && running,
  };

  return (
    <div className={`container${blackoutMode ? ' blackout' : ''}`}>
      <header>
        <div className="header-actions">
          <button type="button" className="info-btn" aria-label="How to use Hi Drone" onClick={() => setShowGuide(true)}>i</button>
          <button type="button" className={`blackout-btn${blackoutMode ? ' active' : ''}`} onClick={() => setBlackoutMode((current) => !current)}>{blackoutMode ? 'Exit Blackout' : 'Blackout'}</button>
        </div>
        <img src="/logo.png" alt="" className="logo" />
        <h1>Hi Drone</h1>
        <p>SELF-GENERATING AMBIENT SOUNDSCAPES</p>
      </header>

      {showGuide && <div className="guide-backdrop" role="presentation" onClick={() => setShowGuide(false)}>
        <section className="guide-modal" role="dialog" aria-modal="true" aria-label="How to use Hi Drone" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="guide-close" aria-label="Close guide" onClick={() => setShowGuide(false)}>×</button>
          <h2>How to use Hi Drone</h2>
          <p>Press <strong>Begin</strong>, start Minimal Machine, then let the drone and kick find space around each other.</p>
          <ol>
            <li>Raise <strong>Ritual</strong> to blend ghost tails, drum drive, granular space, bass ducking, and mutation as one gesture.</li>
            <li>Choose a DNA material: Cavern, Metal, Dust, or Sub.</li>
            <li>Tap the Core to mutate, hold it to absorb the last 12 seconds, or double-tap it for a Tectonic Scene shift.</li>
            <li>Store anchors A and B inside Ritual Core to give Tectonic shifts two worlds to travel between.</li>
            <li>Blackout activates automatically for capture and scene shifts; exit it from the header.</li>
          </ol>
        </section>
      </div>}

      {started ? (
        <aside className={`floating-mixer${mixBoardOpen ? ' open' : ' folded'}`} aria-label="Floating mix board">
          {mixBoardOpen ? (
            <>
              <div className="mixer-head">
                <div><strong>Mix Board</strong><span>Independent source level and three-band EQ</span></div>
                <div className="btn-row"><button type="button" className="mixer-reset" onClick={resetMixer}>Reset</button><button type="button" className="mixer-fold" aria-label="Fold mix board" onClick={() => setMixBoardOpen(false)}>⌄</button></div>
              </div>
              <div className="mixer-channels">
                {mixerChannelMeta.map((channel) => {
                  const mix = mixerSettings[channel.id];
                  return (
                    <section className={`mixer-strip${mix.muted ? ' muted' : ''}${channel.id === 'master' ? ' master' : ''}${mixerActivity[channel.id] ? ' active' : ''}`} key={channel.id}>
                      <div className="mixer-strip-head"><i style={{ background: channel.color }} /><strong>{channel.label}</strong><button type="button" className={`mixer-mute${mix.muted ? ' active' : ''}`} aria-label={`${mix.muted ? 'Unmute' : 'Mute'} ${channel.label}`} onClick={() => updateMixerChannel(channel.id, 'muted', !mix.muted)}>M</button></div>
                      <label className="mixer-volume"><span>VOL</span><strong>{Math.round(mix.volume)}</strong><input aria-label={`${channel.label} volume`} type="range" min="0" max="100" step="1" value={mix.volume} onChange={(event) => updateMixerChannel(channel.id, 'volume', Number(event.target.value))} /></label>
                      <div className="mixer-eq">
                        {(['low', 'mid', 'high'] as const).map((band) => <label key={band}><span>{band}</span><input aria-label={`${channel.label} ${band} EQ`} type="range" min="-12" max="12" step="0.5" value={mix[band]} onChange={(event) => updateMixerChannel(channel.id, band, Number(event.target.value))} /><strong>{mix[band] > 0 ? '+' : ''}{mix[band]}</strong></label>)}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          ) : <button type="button" className="mixer-unfold" aria-expanded="false" onClick={() => setMixBoardOpen(true)}><span>≋</span> MIX</button>}
        </aside>
      ) : null}

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

                  <div className="vocal-alterer">
                    <div className="vocal-alterer-head">
                      <div><strong>Vocal Alterer</strong><span>AlterBoy-style voice shaping for this sample</span></div>
                      <span className={vocalRenderStatus === 'Ready' ? 'vocal-status' : 'vocal-status processing'}>{vocalRenderStatus}</span>
                    </div>
                    <div className="vocal-controls">
                      <div className="slider-group">
                        <div className="slider-label"><span>Pitch — formant preserved</span><span>{vocalSettings.pitch > 0 ? '+' : ''}{vocalSettings.pitch} st</span></div>
                        <input type="range" min="-12" max="12" step="1" value={vocalSettings.pitch} onChange={(event) => updateVocalSetting('pitch', Number(event.target.value))} />
                      </div>
                      <div className="slider-group">
                        <div className="slider-label"><span>Formant character</span><span>{vocalSettings.formant > 0 ? '+' : ''}{vocalSettings.formant} st</span></div>
                        <input type="range" min="-12" max="12" step="1" value={vocalSettings.formant} onChange={(event) => updateVocalSetting('formant', Number(event.target.value))} />
                      </div>
                      <div className="slider-group">
                        <div className="slider-label"><span>Tube warmth</span><span>{vocalSettings.tube}%</span></div>
                        <input type="range" min="0" max="100" step="1" value={vocalSettings.tube} onChange={(event) => updateVocalSetting('tube', Number(event.target.value))} />
                      </div>
                    </div>
                    <div className="sample-help"><strong>Pitch</strong> re-renders the source with the formant-preserving processor, so voice shifts stay natural. <strong>Formant</strong> is a live vocal-color control: down is larger/darker, up is smaller/brighter. <strong>Tube</strong> adds soft saturation and warmth before your FX chain.</div>
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

                  <div
                    className="sample-navigator"
                    tabIndex={0}
                    role="group"
                    aria-label="Sample position navigator"
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowLeft') { event.preventDefault(); moveSamplePosition(-0.05); }
                      if (event.key === 'ArrowRight') { event.preventDefault(); moveSamplePosition(0.05); }
                    }}
                  >
                    <div className="sample-navigator-head">
                      <span>Sample position</span>
                      <span>{formatDuration(samplePosition * sampleDuration)} / {formatDuration(sampleDuration)}</span>
                    </div>
                    <canvas ref={sampleWaveformRef} className="sample-waveform" aria-label="Waveform with selected playback position" />
                    <div className="sample-navigator-controls">
                      <button className="sample-arrow" type="button" onClick={() => moveSamplePosition(-0.05)} aria-label="Move sample position back 5 percent">←</button>
                      <input aria-label="Sample position" type="range" min="0" max="100" step="1" value={Math.round(samplePosition * 100)} onChange={(event) => {
                        const next = Number(event.target.value) / 100;
                        samplePositionRef.current = next;
                        granularPositionRef.current = next;
                        setSamplePosition(next);
                      }} onMouseUp={() => { if (sampleActive) { if (sampleMode === 'loop') startLoop(); else startGranular(); } }} onTouchEnd={() => { if (sampleActive) { if (sampleMode === 'loop') startLoop(); else startGranular(); } }} />
                      <button className="sample-arrow" type="button" onClick={() => moveSamplePosition(0.05)} aria-label="Move sample position forward 5 percent">→</button>
                    </div>
                    <div className="sample-help">Use the arrows (or focus this panel and press ← / →) to move 5% through the file. Loop mode restarts from this point; granular mode draws new grains around it.</div>
                  </div>

                  <div className="btn-row">
                    <button className={`btn${sampleActive ? ' active' : ''}`} type="button" onClick={toggleSampleActive}>{sampleActive ? 'Sample On' : 'Sample Off'}</button>
                    <button className={`btn${sampleMode === 'granular' ? ' active' : ''}`} type="button" onClick={() => chooseSampleMode('granular')}>Granular Mode</button>
                    <button className={`btn${sampleMode === 'loop' ? ' active' : ''}`} type="button" onClick={() => chooseSampleMode('loop')}>Simple Loop Mode</button>
                    <button className={`btn${sampleThroughFx ? ' active' : ''}`} type="button" onClick={toggleSampleThroughFx}>Through FX Chain</button>
                  </div>
                  <div className="sample-help">
                    <strong>Sample On/Off</strong>: mutes or resumes the uploaded sound without removing it.{' '}
                    <strong>Granular</strong>: scans continuously through the entire file while chopping it into overlapping grains.{' '}
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

            <div className="panel panel-full mastering-panel">
              <div className="performance-heading">
                <div><h3>Mastering</h3><span>Final tone, shared movement, and safe output.</span></div>
                <div className="master-glue-preset"><span>{gentleMasterGlue ? 'Gentle profile' : 'Custom profile'}</span><button type="button" className="btn active" onClick={applyMasterGlue}>Apply Master Glue</button></div>
              </div>
              <div className="mastering-visualizer">
                <canvas ref={masteringCanvasRef} aria-label="Live EQ curve, compressor reduction, and limiter reduction" />
              </div>
              <div className="mastering-grid">
                <div className="master-module tone-module">
                  <div className="slider-label" style={{ marginBottom: 8 }}><span>EQ — 3-band, on the master bus</span></div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Bass (200 Hz)</span><span>{settings.eqLowGain > 0 ? '+' : ''}{settings.eqLowGain.toFixed(0)} dB</span></div>
                    <input type="range" min="-12" max="12" step="1" value={settings.eqLowGain} onChange={(event) => updateSetting('eqLowGain', Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Mid (1 kHz)</span><span>{settings.eqMidGain > 0 ? '+' : ''}{settings.eqMidGain.toFixed(0)} dB</span></div>
                    <input type="range" min="-12" max="12" step="1" value={settings.eqMidGain} onChange={(event) => updateSetting('eqMidGain', Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Treble (4 kHz)</span><span>{settings.eqHighGain > 0 ? '+' : ''}{settings.eqHighGain.toFixed(0)} dB</span></div>
                    <input type="range" min="-12" max="12" step="1" value={settings.eqHighGain} onChange={(event) => updateSetting('eqHighGain', Number(event.target.value))} />
                  </div>
                </div>
                <div className="master-module glue-module">
                  <div className="slider-label" style={{ marginBottom: 8 }}><span>Master Glue — colour + breathing compression</span></div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Soft saturation</span><span>{Math.round(settings.masterSaturation * 100)}%</span></div>
                    <input className="safe-range safe-saturation" aria-label="Master soft saturation" type="range" min="0" max="10" step="0.5" value={settings.masterSaturation * 100} onChange={(event) => updateSetting('masterSaturation', Number(event.target.value) / 100)} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Threshold</span><span>{settings.compThreshold.toFixed(0)} dB</span></div>
                    <input className="safe-range safe-threshold" type="range" min="-40" max="0" step="1" value={settings.compThreshold} onChange={(event) => updateSetting('compThreshold', Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Ratio</span><span>{settings.compRatio.toFixed(0)}:1</span></div>
                    <input className="safe-range safe-ratio" type="range" min="1" max="20" step="1" value={settings.compRatio} onChange={(event) => updateSetting('compRatio', Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Attack</span><span>{Math.round(settings.compAttack * 1000)} ms</span></div>
                    <input className="safe-range safe-attack" aria-label="Master compressor attack" type="range" min="1" max="100" step="1" value={settings.compAttack * 1000} onChange={(event) => updateSetting('compAttack', Number(event.target.value) / 1000)} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Release</span><span>{Math.round(settings.compRelease * 1000)} ms</span></div>
                    <input className="safe-range safe-release" aria-label="Master compressor release" type="range" min="50" max="600" step="10" value={settings.compRelease * 1000} onChange={(event) => updateSetting('compRelease', Number(event.target.value) / 1000)} />
                  </div>
                </div>
                <div className="master-module limiter-module">
                  <div className="slider-label" style={{ marginBottom: 8 }}><span>Limiter — final safety ceiling</span></div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Ceiling</span><span>{settings.limiterCeiling.toFixed(1)} dB</span></div>
                    <input className="safe-range safe-limiter" type="range" min="-6" max="-0.1" step="0.1" value={settings.limiterCeiling} onChange={(event) => updateSetting('limiterCeiling', Number(event.target.value))} />
                  </div>
                </div>
                <div>
                  <div className="slider-label" style={{ marginBottom: 8 }}><span>Synth bus — compressor &amp; limiter</span></div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Compressor threshold</span><span>{settings.synthCompThreshold.toFixed(0)} dB</span></div>
                    <input aria-label="Synth compressor threshold" type="range" min="-40" max="0" step="1" value={settings.synthCompThreshold} onChange={(event) => updateSetting('synthCompThreshold', Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Compressor ratio</span><span>{settings.synthCompRatio.toFixed(0)}:1</span></div>
                    <input aria-label="Synth compressor ratio" type="range" min="1" max="20" step="1" value={settings.synthCompRatio} onChange={(event) => updateSetting('synthCompRatio', Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Limiter ceiling</span><span>{settings.synthLimiterCeiling.toFixed(1)} dB</span></div>
                    <input aria-label="Synth limiter ceiling" type="range" min="-8" max="-0.1" step="0.1" value={settings.synthLimiterCeiling} onChange={(event) => updateSetting('synthLimiterCeiling', Number(event.target.value))} />
                  </div>
                </div>
                <div>
                  <div className="slider-label" style={{ marginBottom: 8 }}><span>Drum bus — drive, compressor &amp; limiter</span></div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Drum drive</span><span>{Math.round(settings.drumDriveAmount * 100)}%</span></div>
                    <input aria-label="Drum distortion amount" type="range" min="0" max="30" step="1" value={settings.drumDriveAmount * 100} onChange={(event) => updateSetting('drumDriveAmount', Number(event.target.value) / 100)} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Compressor threshold</span><span>{settings.drumCompThreshold.toFixed(0)} dB</span></div>
                    <input aria-label="Drum compressor threshold" type="range" min="-40" max="0" step="1" value={settings.drumCompThreshold} onChange={(event) => updateSetting('drumCompThreshold', Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Compressor ratio</span><span>{settings.drumCompRatio.toFixed(0)}:1</span></div>
                    <input aria-label="Drum compressor ratio" type="range" min="1" max="20" step="1" value={settings.drumCompRatio} onChange={(event) => updateSetting('drumCompRatio', Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Limiter ceiling</span><span>{settings.drumLimiterCeiling.toFixed(1)} dB</span></div>
                    <input aria-label="Drum limiter ceiling" type="range" min="-8" max="-0.1" step="0.1" value={settings.drumLimiterCeiling} onChange={(event) => updateSetting('drumLimiterCeiling', Number(event.target.value))} />
                  </div>
                </div>
                <div>
                  <div className="slider-label" style={{ marginBottom: 8 }}><span>Kick Space — protects the kick from synth rumble</span></div>
                  <div className="btn-row" style={{ marginBottom: 12 }}>
                    <button type="button" className={`btn${settings.kickSpace ? ' active' : ''}`} onClick={() => updateSetting('kickSpace', !settings.kickSpace)}>{settings.kickSpace ? 'Auto Duck On' : 'Auto Duck Off'}</button>
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Full synth duck</span><span>{settings.kickDuckDepth}%</span></div>
                    <input aria-label="Kick-triggered synth duck depth" type="range" min="0" max="100" step="1" disabled={!settings.kickSpace} value={settings.kickDuckDepth} onChange={(event) => updateSetting('kickDuckDepth', Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Duck release</span><span>{settings.kickDuckRelease} ms</span></div>
                    <input aria-label="Kick-triggered synth duck release" type="range" min="80" max="600" step="10" disabled={!settings.kickSpace} value={settings.kickDuckRelease} onChange={(event) => updateSetting('kickDuckRelease', Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Bass duck ({settings.kickBassSplit} Hz↓)</span><span>{settings.kickBassDuckDepth}%</span></div>
                    <input aria-label="Kick-triggered synth bass duck depth" type="range" min="0" max="100" step="1" disabled={!settings.kickSpace} value={settings.kickBassDuckDepth} onChange={(event) => updateSetting('kickBassDuckDepth', Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Bass duck release</span><span>{settings.kickBassDuckRelease} ms</span></div>
                    <input aria-label="Kick-triggered synth bass duck release" type="range" min="80" max="600" step="10" disabled={!settings.kickSpace} value={settings.kickBassDuckRelease} onChange={(event) => updateSetting('kickBassDuckRelease', Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Bass duck split</span><span>{settings.kickBassSplit} Hz</span></div>
                    <input aria-label="Kick-triggered synth bass duck split frequency" type="range" min="100" max="300" step="5" disabled={!settings.kickSpace} value={settings.kickBassSplit} onChange={(event) => updateSetting('kickBassSplit', Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Sub cleanup</span><span>{settings.synthLowCut} Hz</span></div>
                    <input aria-label="Synth low-cut frequency" type="range" min="20" max="90" step="1" value={settings.synthLowCut} onChange={(event) => updateSetting('synthLowCut', Number(event.target.value))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Synth high-cut</span><span>{(settings.synthHighCut / 1000).toFixed(1)} kHz</span></div>
                    <input aria-label="Synth high-cut frequency" type="range" min="4000" max="16000" step="100" value={settings.synthHighCut} onChange={(event) => updateSetting('synthHighCut', Number(event.target.value))} />
                  </div>
                </div>
              </div>
              <div className="sample-help">
                Master Glue applies subtle saturation, a 2:1 compressor with a 30 ms attack, and a 250 ms release—the kick stays punchy while the mix breathes as one. Aim for around 1–2 dB of compressor reduction; the limiter should only catch occasional peaks. Every change lands in the export.
              </div>
            </div>

            <div className="panel panel-full">
              <h3>Semi-Modular Signal Flow</h3>
              <div className="patch-bay">
                <svg className="patch-wires" viewBox="0 0 900 120" preserveAspectRatio="none" aria-hidden="true">
                  <path className={patchCables.toneToMod ? 'patch-wire active' : 'patch-wire'} d="M145 48 C235 8, 360 8, 450 48" />
                  <path className={patchCables.modToSpace ? 'patch-wire active' : 'patch-wire'} d="M450 48 C540 8, 665 8, 755 48" />
                  <path className={patchCables.spaceToTone ? 'patch-wire warm active' : 'patch-wire warm'} d="M755 66 C625 118, 280 118, 145 66" />
                </svg>
                <div className="patch-nodes">
                  <div className="patch-node"><strong>Tone</strong><span>Pitch sets modulation pace</span></div>
                  <div className="patch-node"><strong>Modulation</strong><span>Depth blooms into delay</span></div>
                  <div className="patch-node"><strong>Space</strong><span>Room can darken the tone</span></div>
                </div>
                <div className="patch-cable-row">
                  <button className={`patch-cable${patchCables.toneToMod ? ' active' : ''}`} type="button" onClick={() => setPatchCables((current) => ({ ...current, toneToMod: !current.toneToMod }))}>Tone → Mod</button>
                  <button className={`patch-cable${patchCables.modToSpace ? ' active' : ''}`} type="button" onClick={() => setPatchCables((current) => ({ ...current, modToSpace: !current.modToSpace }))}>Mod → Space</button>
                  <button className={`patch-cable warm${patchCables.spaceToTone ? ' active' : ''}`} type="button" onClick={() => setPatchCables((current) => ({ ...current, spaceToTone: !current.spaceToTone }))}>Space → Tone</button>
                </div>
              </div>
              <div className="sample-help">Click a cable to patch or unpatch it. Active cables are real: pitch shapes LFO pace, modulation depth opens the delay, and Space → Tone gently darkens the source as the room grows.</div>
            </div>

            <div className="panel panel-full afterimage-panel">
              <div className="performance-heading">
                <div><h3>Ritual Core</h3><span>One gesture conducts afterimage, memory, mutation, drive, ducking, and scenes.</span></div>
                <span className="ritual-readout">{ritualIntensity}</span>
              </div>
              <label className="ritual-intensity">
                <span>Clean world</span>
                <input aria-label="Ritual intensity" type="range" min="0" max="100" step="1" value={ritualIntensity} onChange={(event) => updateRitualIntensity(Number(event.target.value))} />
                <span>Full ritual</span>
              </label>
              <div className="scale-row" style={{ marginBottom: 16 }}>
                {([{ value: 'cavern', label: 'Cavern' }, { value: 'metal', label: 'Metal' }, { value: 'dust', label: 'Dust' }, { value: 'sub', label: 'Sub' }] as const).map((dna) => (
                  <button key={dna.value} type="button" className={`scale-btn${rumbleDna === dna.value ? ' active' : ''}`} onClick={() => setRumbleDna(dna.value)}>{dna.label}</button>
                ))}
              </div>
              <div className="ritual-core-stage">
                <button
                  type="button"
                  className="ritual-core-button"
                  onPointerDown={beginRitualGesture}
                  onPointerUp={endRitualGesture}
                  onPointerCancel={cancelRitualGesture}
                  onPointerLeave={cancelRitualGesture}
                >
                  <strong>CORE</strong><span>tap · hold · double</span>
                </button>
                <div className="ritual-core-state">
                  <strong>{rumbleDna.toUpperCase()} DNA</strong>
                  <span>Memory {afterimage.memory} · Erosion {afterimage.erosion} · Mutation {afterimage.mutation}</span>
                  <small>{ritualStatus}</small>
                </div>
              </div>
              <div className="scene-strip ritual-anchors">
                {(['a', 'b'] as const).map((slot) => (
                  <div className={`scene-slot${scenes[slot] ? ' stored' : ''}`} key={slot}>
                    <span>Anchor {slot.toUpperCase()}</span>
                    <button type="button" className="btn" onClick={() => captureScene(slot)}>{scenes[slot] ? 'Overwrite' : 'Store'}</button>
                    {scenes[slot] && <button type="button" className="btn" disabled={morphTarget !== null} onClick={() => applyScene(scenes[slot]!)}>Recall</button>}
                  </div>
                ))}
                <label className="morph-time"><span>Tectonic time</span><strong>{morphSeconds}s</strong><input aria-label="Tectonic morph time" type="range" min="10" max="120" step="5" value={morphSeconds} onChange={(event) => setMorphSeconds(Number(event.target.value))} /></label>
                {morphTarget && <button type="button" className="btn btn-warm" onClick={stopMorph}>Cancel shift · {Math.round(morphProgress * 100)}%</button>}
              </div>
              <div className="sample-help">Ritual intensity controls the relationships underneath. Tap CORE to mutate, hold to absorb the recent mix, or double-tap for the next Tectonic anchor.</div>
            </div>

            <div className="panel panel-full performance-panel">
              <div className="performance-heading">
                <div><h3>Tectonic Performance</h3><span>Guide the world without rewriting the patch.</span></div>
                <button type="button" className={`btn freeze-btn${freezeActive ? ' active' : ''}`} disabled={!freezeActive && voiceCount === 0} onClick={() => { if (freezeActive) releaseFreeze(); else void captureFreeze(); }}>
                  {freezeActive ? 'Release Freeze' : 'Capture Freeze'}
                </button>
              </div>
              <div className="live-signal" aria-label="Live signal path">
                <div className="signal-stage signal-sources">
                  <span className="signal-kicker">Sources</span>
                  <div className="source-lights">
                    {performanceSources.map((source) => <span className={`source-light ${source.color}${source.active ? ' active' : ''}`} key={source.label}><i />{source.label}</span>)}
                  </div>
                </div>
                <span className="signal-arrow" aria-hidden="true">→</span>
                <div className="signal-stage signal-performance">
                  <span className="signal-kicker">Performance</span>
                  <strong>{freezeActive ? 'Frozen world' : gesturePlaying ? 'Gesture playing' : 'Macros live'}</strong>
                </div>
                <span className="signal-arrow" aria-hidden="true">→</span>
                <div className="signal-stage signal-glue active">
                  <span className="signal-kicker">Master Glue</span>
                  <strong>{gentleMasterGlue ? 'Gentle' : 'Custom'}</strong>
                  <small><b>{masterMeter.compressor.toFixed(1)}</b> dB comp · <b>{masterMeter.limiter.toFixed(1)}</b> dB limit</small>
                </div>
                <span className="signal-arrow" aria-hidden="true">→</span>
                <div className="signal-stage signal-output">
                  <span className="signal-kicker">Output</span>
                  <strong>{isRecording ? 'Recording' : status}</strong>
                </div>
              </div>
              <div className="macro-grid">
                {(Object.entries(macros) as Array<[keyof PerformanceMacros, number]>).map(([name, value]) => (
                  <label className={`macro-control${value >= 70 ? ' hot' : ''}`} style={{ '--macro-level': `${value * 3.6}deg` } as CSSProperties} key={name}>
                    <span>{name}</span>
                    <div className="macro-dial" aria-hidden="true"><strong>{Math.round(value)}</strong><small>%</small></div>
                    <input aria-label={`${name} macro`} type="range" min="0" max="100" step="1" value={value} onChange={(event) => updatePerformanceMacro(name, Number(event.target.value))} />
                  </label>
                ))}
                <label className={`macro-control gravity-control${harmonicGravity >= 70 ? ' hot' : ''}`} style={{ '--macro-level': `${harmonicGravity * 3.6}deg` } as CSSProperties}>
                  <span>Harmonic gravity</span>
                  <div className="macro-dial" aria-hidden="true"><strong>{Math.round(harmonicGravity)}</strong><small>%</small></div>
                  <input aria-label="Harmonic gravity" type="range" min="0" max="100" step="1" value={harmonicGravity} onChange={(event) => setHarmonicGravity(Number(event.target.value))} />
                  <small>{midiMode !== 'root' || midiRootNote === null ? 'Hold a MIDI root to engage' : `Following ${nameForSemitone(midiRootNote)}`}</small>
                </label>
              </div>
              <div className="sample-help">These macros remain available for detailed live steering. Ritual Core conducts them automatically when its main intensity changes.</div>
            </div>

            <div className="panel panel-full artist-panel">
              <div className="performance-heading">
                <div><h3>Performance Palette</h3><span>Five artist-inspired ways of conducting the instrument. Load is immediate; conduct arrives on the next bar.</span></div>
                <label className="conductor-length"><span>Conductor</span><select aria-label="Conductor length" value={conductorBars} onChange={(event) => setConductorBars(Number(event.target.value))}><option value={8}>8 bars</option><option value={16}>16 bars</option><option value={32}>32 bars</option></select></label>
              </div>
              <div className="artist-scene-grid">
                {Object.values(artistScenes).map((scene) => (
                  <article className={`artist-scene${activeArtistScene === scene.id ? ' active' : ''}${conductorTarget === scene.id ? ' conducting' : ''}`} key={scene.id}>
                    <span className="artist-name">{scene.artist}</span>
                    <strong>{scene.title}</strong>
                    <p>{scene.description}</p>
                    <div className="artist-actions"><button type="button" className="btn" onClick={() => applyArtistScene(scene.id)}>Load</button><button type="button" className="btn btn-warm" onClick={() => conductArtistScene(scene.id)}>Conduct</button></div>
                  </article>
                ))}
              </div>
              {conductorTarget && <div className="conductor-status"><span>{artistScenes[conductorTarget].title} {conductorProgress ? `· ${Math.round(conductorProgress * 100)}%` : '· queued'}</span><button type="button" className="btn" onClick={stopConductor}>Cancel conductor</button></div>}
            </div>

            <div className="panel panel-full performance-panel">
              <div className="performance-heading"><div><h3>Three-Deck Performance</h3><span>Ride the groove, melodic, and atmospheric buses like a long-form mix.</span></div><div className="btn-row">{(['groove', 'melodic', 'atmosphere'] as const).map((deck) => <button key={deck} type="button" className={`btn${deckFocus === deck ? ' active' : ''}`} onClick={() => focusDeck(deck)}>{deck}</button>)}</div></div>
              <div className="deck-grid">
                {([{ id: 'groove', label: 'Deck A · Groove' }, { id: 'melodic', label: 'Deck B · Melody' }, { id: 'atmosphere', label: 'Deck C · Atmosphere' }] as const).map((deck) => (
                  <label className="deck-strip" key={deck.id}><span>{deck.label}</span><strong>{deckLevels[deck.id]}</strong><input aria-label={`${deck.label} level`} type="range" min="0" max="100" value={deckLevels[deck.id]} onChange={(event) => setDeckLevel(deck.id, Number(event.target.value))} /></label>
                ))}
              </div>
            </div>

            <div className="panel panel-full acid-panel">
              <div className="performance-heading"><div><h3>Acid Pressure Lane</h3><span>Scale-locked resonance voice. It adds a lane; it never takes the existing melody away.</span></div><button type="button" className={`btn freeze-btn${acidSettings.enabled ? ' active' : ''}`} onClick={() => setAcidSettings((current) => ({ ...current, enabled: !current.enabled }))}>{acidSettings.enabled ? 'Acid On' : 'Acid Off'}</button></div>
              <div className="step-lane"><span>Notes</span><div>{acidSettings.steps.map((active, step) => <button type="button" aria-label={`Acid note step ${step + 1}`} className={`step-button${active ? ' active' : ''}`} key={step} onClick={() => setAcidSettings((current) => ({ ...current, steps: current.steps.map((value, index) => index === step ? !value : value) }))}>{step + 1}</button>)}</div></div>
              <div className="step-lane accent-lane"><span>Accent</span><div>{acidSettings.accents.map((active, step) => <button type="button" aria-label={`Acid accent step ${step + 1}`} className={`step-button${active ? ' accent' : ''}`} key={step} onClick={() => setAcidSettings((current) => ({ ...current, accents: current.accents.map((value, index) => index === step ? !value : value) }))}>{active ? '▲' : '·'}</button>)}</div></div>
              <div className="acid-controls">
                {([{ key: 'cutoff', label: 'Cutoff' }, { key: 'resonance', label: 'Resonance' }, { key: 'drive', label: 'Drive' }, { key: 'accent', label: 'Accent' }] as const).map((control) => <label className="slider-group" key={control.key}><div className="slider-label"><span>{control.label}</span><span>{Math.round(acidSettings[control.key])}%</span></div><input aria-label={`Acid ${control.label}`} type="range" min="0" max="100" value={acidSettings[control.key]} onChange={(event) => setAcidSettings((current) => ({ ...current, [control.key]: Number(event.target.value) }))} /></label>)}
                <label className="slider-group"><div className="slider-label"><span>Octave</span><span>+{acidSettings.octave}</span></div><input aria-label="Acid octave" type="range" min="0" max="2" step="1" value={acidSettings.octave} onChange={(event) => setAcidSettings((current) => ({ ...current, octave: Number(event.target.value) }))} /></label>
              </div>
            </div>

            <div className="panel panel-full wizard-panel">
              <div className="performance-heading"><div><h3>Wizard Grid &amp; Gesture Recorder</h3><span>Punch extra machine hits into the running pattern, then capture macro movement as an arrangement.</span></div><div className="btn-row"><button type="button" className={`btn${liveGridArmed ? ' active' : ''}`} onClick={() => setLiveGridArmed((current) => !current)}>{liveGridArmed ? 'Grid Armed' : 'Arm Grid'}</button><button type="button" className="btn" onClick={clearLiveGrid}>Clear grid</button></div></div>
              <div className="live-grid">
                {(Object.entries(liveGrid) as Array<[keyof LiveGrid, boolean[]]>).map(([lane, steps]) => <div className="live-grid-row" key={lane}><span>{lane}</span>{steps.map((active, step) => <button type="button" aria-label={`${lane} step ${step + 1}`} className={`grid-cell${active ? ' active' : ''}`} key={step} onClick={() => toggleLiveGridCell(lane, step)}>{step % 4 === 0 ? step + 1 : ''}</button>)}</div>)}
              </div>
              <div className="gesture-row"><div><strong>Gesture recorder</strong><span>{gestureRecording ? 'Recording macro moves' : gesturePlaying ? 'Playing captured gesture' : `${gestureFrames.length} frames in memory`}</span></div><div className="btn-row"><button type="button" className={`btn${gestureRecording ? ' active' : ''}`} onClick={toggleGestureRecording}>{gestureRecording ? 'Stop recording' : 'Record gesture'}</button><button type="button" className={`btn${gesturePlaying ? ' active' : ''}`} disabled={!gestureFrames.length} onClick={gesturePlaying ? stopGesturePlayback : playGesture}>{gesturePlaying ? 'Stop gesture' : 'Play gesture'}</button></div></div>
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
                <button className="btn btn-warm" type="button" onClick={newWorld}>New World</button>
                <button className="btn btn-warm" type="button" onClick={releaseAll}>Stop All</button>
              </div>
              <div className="sample-help">New World fades the current generative layer into the room, releases a captured Freeze, and starts a newly seeded set of relationships without changing your patch.</div>
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
                    <div className="slider-label"><span>Pulse speed</span><span>{midiClockSync && midiBpm ? `${(60 / midiBpm).toFixed(2)} s/beat · ${midiBpm} BPM` : `${pulseSpeed.toFixed(1)} s/step`}</span></div>
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

            <div className="panel panel-full performance-panel">
              <div className="performance-heading">
                <div>
                  <h3>Minimal Machine</h3>
                  <span>{technoPreset === 'rumble' ? 'Kick-derived low rumble engaged' : technoPreset === 'broken' ? 'Variable kick pattern engaged' : 'Fixed four-to-the-floor kick · per-voice patterns evolve'}</span>
                </div>
                <div className="btn-row">
                  <button type="button" className="btn" onClick={mixTechnoMachine}>Mix</button>
                  <button type="button" className={`btn freeze-btn${technoPlaying ? ' active' : ''}`} onClick={toggleTechnoMachine}>{technoPlaying ? 'Stop Machine' : 'Start Machine'}</button>
                </div>
              </div>
              <div className="scale-row" style={{ marginBottom: 16 }}>
                <button type="button" className={`scale-btn${technoPreset === 'classic' ? ' active' : ''}`} onClick={() => applyTechnoPreset('classic')}>Classic</button>
                <button type="button" className={`scale-btn${technoPreset === 'detroit' ? ' active' : ''}`} onClick={() => applyTechnoPreset('detroit')}>Detroit</button>
                <button type="button" className={`scale-btn${technoPreset === 'hardgroove' ? ' active' : ''}`} onClick={() => applyTechnoPreset('hardgroove')}>Hardgroove</button>
                <button type="button" className={`scale-btn${technoPreset === 'rumble' ? ' active' : ''}`} onClick={() => applyTechnoPreset('rumble')}>Rumble</button>
                <button type="button" className={`scale-btn${technoPreset === 'broken' ? ' active' : ''}`} onClick={() => applyTechnoPreset('broken')}>Broken</button>
              </div>
              <div className="pulse-wander-grid">
                <div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Tempo</span><span>{technoSettings.bpm} BPM</span></div>
                    <input aria-label="Minimal machine tempo" type="range" min="118" max="142" step="1" value={technoSettings.bpm} onChange={(event) => setTechnoSettings((current) => ({ ...current, bpm: Number(event.target.value) }))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Euclidean hats</span><span>{technoSettings.hatPulses}/16</span></div>
                    <input aria-label="Euclidean hi-hat pulses" type="range" min="0" max="16" step="1" value={technoSettings.hatPulses} onChange={(event) => setTechnoSettings((current) => ({ ...current, hatPulses: Number(event.target.value) }))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Euclidean snares</span><span>{technoSettings.snarePulses}/16</span></div>
                    <input aria-label="Euclidean snare pulses" type="range" min="0" max="4" step="1" value={technoSettings.snarePulses} onChange={(event) => setTechnoSettings((current) => ({ ...current, snarePulses: Number(event.target.value) }))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Hat chance</span><span>{technoSettings.hatDensity}%</span></div>
                    <input aria-label="Hi-hat chance" type="range" min="20" max="100" step="1" value={technoSettings.hatDensity} onChange={(event) => setTechnoSettings((current) => ({ ...current, hatDensity: Number(event.target.value) }))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Snare ghosts</span><span>{technoSettings.snareDensity}%</span></div>
                    <input aria-label="Snare ghost density" type="range" min="0" max="100" step="1" value={technoSettings.snareDensity} onChange={(event) => setTechnoSettings((current) => ({ ...current, snareDensity: Number(event.target.value) }))} />
                  </div>
                </div>
                <div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Euclidean tom fill</span><span>{technoSettings.tomPulses}/4</span></div>
                    <input aria-label="Euclidean tom pulses" type="range" min="0" max="4" step="1" value={technoSettings.tomPulses} onChange={(event) => setTechnoSettings((current) => ({ ...current, tomPulses: Number(event.target.value) }))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Evolve interval</span><span>{technoSettings.evolveBars} bars</span></div>
                    <input aria-label="Pattern evolution interval" type="range" min="2" max="16" step="1" value={technoSettings.evolveBars} onChange={(event) => setTechnoSettings((current) => ({ ...current, evolveBars: Number(event.target.value) }))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Humanize</span><span>±{technoSettings.humanize} ms</span></div>
                    <input aria-label="Machine humanize" type="range" min="0" max="24" step="1" value={technoSettings.humanize} onChange={(event) => setTechnoSettings((current) => ({ ...current, humanize: Number(event.target.value) }))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Tom fill chance</span><span>{technoSettings.tomActivity}%</span></div>
                    <input aria-label="Tom fill activity" type="range" min="0" max="100" step="1" value={technoSettings.tomActivity} onChange={(event) => setTechnoSettings((current) => ({ ...current, tomActivity: Number(event.target.value) }))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Swing</span><span>{technoSettings.swing}%</span></div>
                    <input aria-label="Machine swing" type="range" min="0" max="50" step="1" value={technoSettings.swing} onChange={(event) => setTechnoSettings((current) => ({ ...current, swing: Number(event.target.value) }))} />
                  </div>
                </div>
              </div>
              <div className="slider-group" style={{ marginTop: 12 }}>
                <div className="slider-label"><span>Machine level</span><span>{technoSettings.volume}%</span></div>
                <input aria-label="Minimal machine level" type="range" min="0" max="100" step="1" value={technoSettings.volume} onChange={(event) => setTechnoSettings((current) => ({ ...current, volume: Number(event.target.value) }))} />
              </div>
              <div className="sample-help">Evolution {technoEvolution}: per-voice Euclidean patterns refresh every {technoSettings.evolveBars} bars. Mix randomizes the full groove while the kick remains locked.</div>
            </div>

            <div className="panel panel-full performance-panel">
              <div className="performance-heading">
                <div>
                  <h3>Constrained Melody</h3>
                  <span>{melodySettings.composerEnabled ? `${melodySettings.phraseBars}-bar ${melodySettings.mode} composer · motif, answer, variation, resolution` : 'Scale-locked random walk · preserves a motif while changing its voice-leading'}</span>
                </div>
                <div className="btn-row">
                  <button type="button" className={`btn${melodySettings.composerEnabled ? ' active' : ''}`} onClick={toggleMelodyComposer}>{melodySettings.composerEnabled ? 'Composer On' : 'Composer Off'}</button>
                  <button type="button" className={`btn freeze-btn${melodySettings.enabled ? ' active' : ''}`} onClick={() => setMelodySettings((current) => ({ ...current, enabled: !current.enabled }))}>{melodySettings.enabled ? 'Melody On' : 'Melody Off'}</button>
                </div>
              </div>
              <div className="scale-row" style={{ marginBottom: 16 }}>
                {([{ label: 'D', value: 50 }, { label: 'E', value: 52 }, { label: 'F', value: 53 }, { label: 'A', value: 57 }] as const).map((key) => (
                  <button key={key.label} type="button" className={`scale-btn${melodySettings.root === key.value ? ' active' : ''}`} onClick={() => setMelodySettings((current) => ({ ...current, root: key.value }))}>{key.label} root</button>
                ))}
                <span className="notes-empty">Scale: {droneScales[settings.scale].label}</span>
              </div>
              <div className="btn-row" style={{ marginBottom: 16 }}>
                <button type="button" className={`btn${melodySettings.duck ? ' active' : ''}`} onClick={() => setMelodySettings((current) => ({ ...current, duck: !current.duck }))}>{melodySettings.duck ? 'Duck On' : 'Duck Off'}</button>
                <button type="button" className={`btn${melodySettings.tranceGate ? ' active' : ''}`} onClick={() => setMelodySettings((current) => ({ ...current, tranceGate: !current.tranceGate }))}>{melodySettings.tranceGate ? 'Trance Gate On' : 'Trance Gate Off'}</button>
              </div>
              {melodySettings.composerEnabled ? (
                <div className="composer-panel">
                  <div className="composer-section">
                    <span className="composer-label">Composer mode</span>
                    <div className="scale-row">
                      {([{ value: 'hypnotic', label: 'Hypnotic' }, { value: 'emotional', label: 'Emotional' }, { value: 'arpeggio', label: 'Arpeggio' }, { value: 'callResponse', label: 'Call / Response' }] as Array<{ value: MelodyMode; label: string }>).map((mode) => <button key={mode.value} type="button" className={`scale-btn${melodySettings.mode === mode.value ? ' active' : ''}`} onClick={() => updateComposerSetting('mode', mode.value)}>{mode.label}</button>)}
                    </div>
                  </div>
                  <div className="phrase-map" aria-label={`${melodySettings.phraseBars}-bar melodic phrase map`}>
                    {melodyComposition?.bars.map((bar, barIndex) => (
                      <div className={`phrase-bar${melodyActiveBar === barIndex && technoPlaying ? ' active' : ''}`} key={`${melodyComposition.seed}-${barIndex}`}>
                        <div className="phrase-bar-head"><span>{barIndex + 1}</span><strong>{bar.chordLabel}</strong></div>
                        <div className="phrase-notes">{bar.steps.map((note, step) => <i key={step} className={note ? `phrase-note ${note.role}${note.accent ? ' accent' : ''}` : 'phrase-rest'} style={note ? { bottom: `${Math.min(88, 8 + note.degree * 9)}%`, opacity: note.velocity } : undefined} />)}</div>
                        <small>{bar.stage}</small>
                      </div>
                    )) ?? <span className="notes-empty">Composer is preparing the first phrase…</span>}
                  </div>
                  <div className="composer-options">
                    <div className="composer-section"><span className="composer-label">Phrase length</span><div className="scale-row">{([4, 8, 16] as const).map((bars) => <button key={bars} type="button" className={`scale-btn${melodySettings.phraseBars === bars ? ' active' : ''}`} onClick={() => updateComposerSetting('phraseBars', bars)}>{bars} bars</button>)}</div></div>
                    <div className="composer-section"><span className="composer-label">Contour</span><div className="scale-row">{([{ value: 'rise', label: 'Rise' }, { value: 'fall', label: 'Fall' }, { value: 'arch', label: 'Arch' }, { value: 'wave', label: 'Wave' }] as Array<{ value: MelodyContour; label: string }>).map((contour) => <button key={contour.value} type="button" className={`scale-btn${melodySettings.contour === contour.value ? ' active' : ''}`} onClick={() => updateComposerSetting('contour', contour.value)}>{contour.label}</button>)}</div></div>
                    <div className="composer-section composer-wide"><span className="composer-label">Harmony</span><div className="scale-row">{([{ value: 'static', label: 'Static' }, { value: 'deep', label: 'Deep' }, { value: 'classic', label: 'Classic' }, { value: 'rising', label: 'Rising' }] as Array<{ value: MelodyProgression; label: string }>).map((progression) => <button key={progression.value} type="button" className={`scale-btn${melodySettings.progression === progression.value ? ' active' : ''}`} onClick={() => updateComposerSetting('progression', progression.value)}>{progression.label}</button>)}</div></div>
                  </div>
                  <div className="composer-sliders">
                    {([{ key: 'complexity', label: 'Complexity', value: melodySettings.complexity }, { key: 'repetition', label: 'Repetition', value: melodySettings.repetition }, { key: 'variation', label: 'Variation', value: melodySettings.variation }, { key: 'noteLength', label: 'Note length', value: melodySettings.noteLength }] as const).map((control) => <label className="slider-group" key={control.key}><div className="slider-label"><span>{control.label}</span><span>{control.value}%</span></div><input aria-label={`Composer ${control.label}`} type="range" min="0" max="100" step="1" value={control.value} onChange={(event) => updateComposerSetting(control.key, Number(event.target.value))} /></label>)}
                    <label className="slider-group"><div className="slider-label"><span>Melodic range</span><span>{melodySettings.range} oct</span></div><input aria-label="Composer melodic range" type="range" min="1" max="3" step="1" value={melodySettings.range} onChange={(event) => updateComposerSetting('range', Number(event.target.value))} /></label>
                  </div>
                  <div className="sample-help">The phrase remains scale-safe. Composer repeats its central motif, answers it, introduces controlled change, then resolves home before evolving.</div>
                </div>
              ) : null}
              <div className="pulse-wander-grid">
                <div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Phrase density</span><span>{melodySettings.density}%</span></div>
                    <input aria-label="Melody phrase density" type="range" min="15" max="90" step="1" value={melodySettings.density} onChange={(event) => setMelodySettings((current) => ({ ...current, density: Number(event.target.value) }))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Motif evolution</span><span>{melodySettings.evolveBars} bars</span></div>
                    <input aria-label="Melody evolution interval" type="range" min="2" max="16" step="1" value={melodySettings.evolveBars} onChange={(event) => setMelodySettings((current) => ({ ...current, evolveBars: Number(event.target.value) }))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Duck depth</span><span>{melodySettings.duckDepth}%</span></div>
                    <input aria-label="Melody duck depth" type="range" min="0" max="100" step="1" disabled={!melodySettings.duck} value={melodySettings.duckDepth} onChange={(event) => setMelodySettings((current) => ({ ...current, duckDepth: Number(event.target.value) }))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Duck release</span><span>{melodySettings.duckRelease} ms</span></div>
                    <input aria-label="Melody duck release" type="range" min="80" max="600" step="10" disabled={!melodySettings.duck} value={melodySettings.duckRelease} onChange={(event) => setMelodySettings((current) => ({ ...current, duckRelease: Number(event.target.value) }))} />
                  </div>
                </div>
                <div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Softness / brightness</span><span>{melodySettings.brightness}%</span></div>
                    <input aria-label="Melody brightness" type="range" min="0" max="100" step="1" value={melodySettings.brightness} onChange={(event) => setMelodySettings((current) => ({ ...current, brightness: Number(event.target.value) }))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Melody level</span><span>{melodySettings.volume}%</span></div>
                    <input aria-label="Melody level" type="range" min="0" max="100" step="1" value={melodySettings.volume} onChange={(event) => setMelodySettings((current) => ({ ...current, volume: Number(event.target.value) }))} />
                  </div>
                  <div className="slider-group">
                    <div className="slider-label"><span>Trance gate depth</span><span>{melodySettings.gateDepth}%</span></div>
                    <input aria-label="Melody trance gate depth" type="range" min="0" max="100" step="1" disabled={!melodySettings.tranceGate} value={melodySettings.gateDepth} onChange={(event) => setMelodySettings((current) => ({ ...current, gateDepth: Number(event.target.value) }))} />
                  </div>
                  <div className="scale-row" style={{ marginTop: 12 }}>
                    {([{ label: '¼', value: 'quarter' }, { label: '⅛', value: 'eighth' }, { label: '⅟₁₆', value: 'sixteenth' }, { label: 'Pulse', value: 'pulse' }] as const).map((pattern) => (
                      <button key={pattern.value} type="button" disabled={!melodySettings.tranceGate} className={`scale-btn${melodySettings.gatePattern === pattern.value ? ' active' : ''}`} onClick={() => setMelodySettings((current) => ({ ...current, gatePattern: pattern.value }))}>{pattern.label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="btn-row" style={{ marginTop: 16 }}>
                <button type="button" className="btn" onClick={() => evolveMelodyPhrase(true)}>{melodySettings.composerEnabled ? 'Evolve Composition' : 'Evolve Motif'}</button>
              </div>
              <div className="sample-help">Melody evolution {melodyEvolution}: notes only come from the selected root and current scale. {melodySettings.composerEnabled ? 'Composer changes selected notes while keeping the phrase identity and final cadence.' : 'Legacy mode preserves the original one-bar constrained random walk.'} Duck follows the kick; Trance Gate rhythmically opens the melodic synth at the selected division.</div>
            </div>

            <div className="panel panel-full">
              <h3>Keyboard Play</h3>
              <div className="btn-row" style={{ marginBottom: 12 }}>
                <button type="button" className={`btn${keyboardPlayOn ? ' active' : ''}`} onClick={() => setKeyboardPlayOn((previous) => !previous)}>{keyboardPlayOn ? 'Keyboard On' : 'Keyboard Off'}</button>
              </div>
              <div className="keyboard-controls">
                <div className="slider-group">
                  <div className="slider-label"><span>Musical transpose</span><span>{keyboardTranspose > 0 ? '+' : ''}{keyboardTranspose} st</span></div>
                  <input type="range" min="-12" max="12" step="1" value={keyboardTranspose} onChange={(event) => setKeyboardTranspose(Number(event.target.value))} />
                </div>
                <div className="slider-group">
                  <div className="slider-label"><span>Octave shine</span><span>{keyboardShine}%</span></div>
                  <input type="range" min="0" max="100" step="1" value={keyboardShine} onChange={(event) => setKeyboardShine(Number(event.target.value))} />
                </div>
              </div>
              <div className="sample-help">
                Play soft, in-scale notes by hand — they stay locked to the current scale and blend into the same room as everything else. Transpose moves every key together in semitones; Octave shine adds a gentle musical overtone. <strong>A S D F G H J K L</strong> for the lower octave, <strong>W E R T Y U I O P</strong> for the octave above. Keys also work as buttons below.
              </div>
              <div className="keyboard-rows">
                <div className="keyboard-row keyboard-row-upper">
                  {keyboardRowUpper.map((key) => (
                    <span
                      key={key}
                      className={`key-badge${activeKeys[key] ? ' active' : ''}`}
                      onMouseDown={() => void playKey(key)}
                      onMouseUp={() => releaseKey(key)}
                      onMouseLeave={() => releaseKey(key)}
                      onTouchStart={(event) => { event.preventDefault(); void playKey(key); }}
                      onTouchEnd={(event) => { event.preventDefault(); releaseKey(key); }}
                    >
                      {key.toUpperCase()}
                    </span>
                  ))}
                </div>
                <div className="keyboard-row">
                  {keyboardRowLower.map((key) => (
                    <span
                      key={key}
                      className={`key-badge${activeKeys[key] ? ' active' : ''}`}
                      onMouseDown={() => void playKey(key)}
                      onMouseUp={() => releaseKey(key)}
                      onMouseLeave={() => releaseKey(key)}
                      onTouchStart={(event) => { event.preventDefault(); void playKey(key); }}
                      onTouchEnd={(event) => { event.preventDefault(); releaseKey(key); }}
                    >
                      {key.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel panel-full">
              <h3>MIDI Input</h3>
              <div className="midi-controls">
                <div className="btn-row">
                  <button type="button" className="btn" onClick={() => { void refreshMidiPorts(); }}>Refresh Inputs</button>
                  <select aria-label="MIDI input port" value={midiPortIndex ?? ''} onChange={(event) => setMidiPortIndex(event.target.value === '' ? null : Number(event.target.value))}>
                    <option value="">Choose MIDI input…</option>
                    {midiPorts.map((port) => <option key={port.index} value={port.index}>{port.name}</option>)}
                  </select>
                  <button type="button" className="btn active" disabled={midiPortIndex === null} onClick={() => { void connectMidi(); }}>Connect</button>
                  <button type="button" className="btn" onClick={() => { void disconnectMidi(); }}>Disconnect</button>
                </div>
                <div className="midi-status">{midiStatus}</div>
                <div className="slider-label" style={{ marginTop: 16, marginBottom: 8 }}><span>Notes</span></div>
                <div className="scale-row">
                  <button type="button" className={`scale-btn${midiMode === 'off' ? ' active' : ''}`} onClick={() => setMidiMode('off')}>Ignore notes</button>
                  <button type="button" className={`scale-btn${midiMode === 'trigger' ? ' active' : ''}`} onClick={() => setMidiMode('trigger')}>Trigger voices</button>
                  <button type="button" className={`scale-btn${midiMode === 'root' ? ' active' : ''}`} onClick={() => setMidiMode('root')}>Set drone root</button>
                </div>
                <div className="btn-row" style={{ marginTop: 16 }}>
                  <button type="button" className={`btn${midiClockSync ? ' active' : ''}`} onClick={() => { setMidiClockSync((current) => !current); midiClockRef.current = { ticks: 0, startedAt: 0 }; setMidiBpm(null); }}>
                    {midiClockSync ? `Clock Sync On${midiBpm ? ` · ${midiBpm} BPM` : ''}` : 'Clock Sync Off'}
                  </button>
                </div>
              </div>
              <div className="sample-help">
                Hi Drone remains self-generating with no MIDI connected. Trigger voices follows note-on/note-off and velocity; Set drone root makes a held MIDI note the root of new generated voices. Clock Sync makes the Pulse follow MIDI clock (24 PPQN) from Ableton, Logic, or another DAW.
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
