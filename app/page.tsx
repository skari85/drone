'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Surface = 'sound' | 'sequence' | 'licks' | 'behaviour' | 'patch';
type CellMode = 'pulse' | 'gate' | 'random' | 'delay' | 'repeater';
type EventKind = 'voice' | 'pulse' | 'sequence' | 'gesture' | 'patch' | 'scene';
type DroneScaleName = 'minor' | 'dorian' | 'phrygian' | 'pentaMinor' | 'pentaMajor' | 'wholeTone' | 'harmonicMinor' | 'lydian';
type ModulationShape = 'sine' | 'random';
type NoiseColor = 'brown' | 'pink' | 'white';
type ScaleName = 'minor' | 'dorian' | 'major' | 'pentatonic' | 'phrygian';

type Voice = { id: number; name: string; base: number; tone: string; role: string };
type Percussion = { id: number; name: string; role: string; tone: string };
type Cell = { id: number; name: string; mode: CellMode; target: number; kind: 'voice' | 'perc'; interval: number; probability: number; colour: string };
type Patch = { id: number; source: string; target: string; amount: number };
type Preset = { name: string; genre: string; detail: string; macros: Macros; cells: Cell[] };
type SequenceStep = { active: boolean; degree: number; octave: number; chance: number; accent: boolean };
type SequenceTrack = { id: number; name: string; voice: number; colour: string; length: number; pulses: number; rotate: number; octave: number; range: number; chance: number; gate: number; muted: boolean; steps: SequenceStep[] };
type SequenceWorld = { bpm: number; root: number; scale: ScaleName; swing: number; pulses: number[]; rotations: number[]; lengths: number[]; seed: number };
type StoredScene = { macros: Macros; cells: Cell[]; patches: Patch[]; drone?: DroneSettings; sequence?: { tracks: SequenceTrack[]; bpm: number; root: number; scale: ScaleName; swing: number } };
type PerfEvent = { at: number; label: string; kind: EventKind };
type JazzLick = { name: string; idea: string; colour: string; phrase: string };
type Organism = { phase: number; energy: number; breath: number; coherence: number; signal: string };
type VoiceNode = { carrier: OscillatorNode; shadow: OscillatorNode; mod: GainNode; gain: GainNode; filter: BiquadFilterNode; panner: StereoPannerNode };
type DroneVoiceNode = { noteName: string; oscillators: Array<{ osc: OscillatorNode; gain: GainNode }>; voiceGain: GainNode; filter: BiquadFilterNode; panner: StereoPannerNode; filterLfo: OscillatorNode; filterLfoGain: GainNode; pitchLfo: OscillatorNode; pitchLfoGain: GainNode; volLfo: OscillatorNode; volLfoGain: GainNode; panLfo: OscillatorNode; panLfoGain: GainNode; randomInterval: number | null };
type DroneSettings = { basePitch: number; detuneCents: number; oscCount: number; waveform: OscillatorType; modulationShape: ModulationShape; filterRate: number; filterDepth: number; pitchDrift: number; volLfoDepth: number; panDepth: number; noiseColor: NoiseColor; noiseAmount: number; reverbAmount: number; delayAmount: number; delayTime: number; delayFeedback: number; chorusAmount: number; driveAmount: number; masterVolume: number; scale: DroneScaleName; genSpeed: number; maxVoices: number };
type Graph = { context: AudioContext; master: GainNode; compressor: DynamicsCompressorNode; analyser: AnalyserNode; capture: MediaStreamAudioDestinationNode; voices: Map<number, VoiceNode>; droneMaster: GainNode; droneBus: GainNode; droneDrive: WaveShaperNode; droneChorusDry: GainNode; droneChorusDelay: DelayNode; droneChorusWet: GainNode; droneChorusLfo: OscillatorNode; droneChorusDepth: GainNode; droneDry: GainNode; droneReverb: ConvolverNode; droneReverbWet: GainNode; droneDelay: DelayNode; droneDelayFeedback: GainNode; droneDelayWet: GainNode; droneNoise: AudioBufferSourceNode; droneNoiseFilter: BiquadFilterNode; droneNoiseGain: GainNode; droneVoices: Map<number, DroneVoiceNode> };

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
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const createDriveCurve = (amount: number) => {
  const curve = new Float32Array(2048);
  const drive = 1 + amount * 36;
  for (let index = 0; index < curve.length; index += 1) {
    const x = (index * 2) / (curve.length - 1) - 1;
    curve[index] = amount <= 0.001 ? x : Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
};
const createDroneReverb = (context: AudioContext, duration = 3.5) => {
  const convolver = context.createConvolver();
  const length = Math.floor(context.sampleRate * duration);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      const decay = Math.pow(1 - progress, 2.5);
      const build = index < context.sampleRate * 0.005 ? index / (context.sampleRate * 0.005) : 1;
      data[index] = (Math.random() * 2 - 1) * decay * build * 0.5;
    }
  }
  convolver.buffer = impulse;
  return convolver;
};
const createNoiseBuffer = (context: AudioContext, duration = 2) => {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
};

const rootNames = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const scales: Record<ScaleName, { label: string; intervals: number[] }> = {
  minor: { label: 'Natural minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { label: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  major: { label: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  pentatonic: { label: 'Minor pentatonic', intervals: [0, 3, 5, 7, 10] },
  phrygian: { label: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
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
const defaultDroneSettings: DroneSettings = {
  basePitch: 55, detuneCents: 7, oscCount: 5, waveform: 'sine', modulationShape: 'sine', filterRate: 0.05, filterDepth: 0.6,
  pitchDrift: 0.15, volLfoDepth: 0.3, panDepth: 0.35, noiseColor: 'brown', noiseAmount: 0.12,
  reverbAmount: 0.7, delayAmount: 0.4, delayTime: 0.8, delayFeedback: 0.45, chorusAmount: 0.18, driveAmount: 0.04,
  masterVolume: 0.5, scale: 'minor', genSpeed: 8, maxVoices: 6,
};
const sequenceTrackTemplates = [
  { id: 0, name: 'Root Path', voice: 0, colour: 'moss', octave: 0, range: 4, chance: 100, gate: 72 },
  { id: 1, name: 'Glass Thread', voice: 1, colour: 'amber', octave: 1, range: 6, chance: 92, gate: 42 },
  { id: 2, name: 'Choir Tide', voice: 3, colour: 'ice', octave: 1, range: 4, chance: 84, gate: 88 },
  { id: 3, name: 'Moon Sparks', voice: 7, colour: 'blue', octave: 2, range: 7, chance: 78, gate: 28 },
];

const euclideanPattern = (length: number, pulses: number, rotate: number) => Array.from({ length: 16 }, (_, index) => {
  if (index >= length) return false;
  const shifted = (index - rotate + length * 2) % length;
  return ((shifted * Math.min(pulses, length)) % length) < Math.min(pulses, length);
});

const buildSequenceTracks = (world: SequenceWorld): SequenceTrack[] => sequenceTrackTemplates.map((template, trackIndex) => {
  const length = world.lengths[trackIndex];
  const pulses = Math.min(world.pulses[trackIndex], length);
  const rotate = world.rotations[trackIndex] % length;
  const pattern = euclideanPattern(length, pulses, rotate);
  return {
    ...template,
    length,
    pulses,
    rotate,
    muted: false,
    steps: pattern.map((active, stepIndex) => ({
      active,
      degree: (world.seed + trackIndex * 2 + stepIndex * (trackIndex + 1) + Math.floor(stepIndex / 4)) % template.range,
      octave: stepIndex === 12 && trackIndex > 0 ? 1 : 0,
      chance: 100,
      accent: active && stepIndex % 4 === 0,
    })),
  };
});

const initialSequenceWorld: SequenceWorld = { bpm: 104, root: 2, scale: 'dorian', swing: 54, pulses: [5, 7, 3, 6], rotations: [0, 2, 1, 3], lengths: [16, 15, 12, 16], seed: 1 };
const initialSequenceTracks = buildSequenceTracks(initialSequenceWorld);

const jazzLicks: JazzLick[] = [
  { name: 'Guide-tone glide', idea: 'Singable 3rds and 7ths', colour: 'moss', phrase: 'C · B · A · G  /  F♯ · A · C · B♭  /  B · A · G · F♯' },
  { name: 'Bebop enclosures', idea: 'Chromatic approaches', colour: 'amber', phrase: 'E · F · F♯ · G  /  C · C♯ · D · F♯  /  F♯ · G · G♯ · A' },
  { name: 'Arpeggio staircase', idea: 'Compact chord outlines', colour: 'ice', phrase: 'A · C · E · G  /  D · F♯ · A · C  /  G · B · D · F♯' },
  { name: 'Chromatic lift', idea: 'Half-step connective tissue', colour: 'violet', phrase: 'A · C · C♯ · E  /  E · F · F♯ · A  /  A · A♭ · G · F♯' },
  { name: 'Altered V, warm landing', idea: 'Outside colour into consonance', colour: 'orange', phrase: 'C · E · G · B  /  F♯ · A♭ · A · C  /  A · B · D · F♯' },
];

const presets: Preset[] = [
  {
    name: 'First Pulse',
    genre: 'ambient / dub',
    detail: 'a steady body to enter through',
    macros: { tension: 22, movement: 10, density: 64, space: 28, damage: 12 },
    cells: [
      { id: 0, name: 'Murmur', mode: 'pulse', target: 0, kind: 'voice', interval: 640, probability: 100, colour: 'moss' },
      { id: 1, name: 'Static', mode: 'gate', target: 6, kind: 'voice', interval: 1280, probability: 82, colour: 'amber' },
      { id: 2, name: 'Throb', mode: 'repeater', target: 0, kind: 'perc', interval: 480, probability: 100, colour: 'rose' },
      { id: 3, name: 'Wake', mode: 'pulse', target: 3, kind: 'voice', interval: 1920, probability: 58, colour: 'ice' },
      { id: 4, name: 'Crush', mode: 'delay', target: 2, kind: 'perc', interval: 960, probability: 44, colour: 'violet' },
      { id: 5, name: 'Drift', mode: 'random', target: 5, kind: 'voice', interval: 2560, probability: 24, colour: 'lime' },
      { id: 6, name: 'Ember', mode: 'pulse', target: 1, kind: 'perc', interval: 1280, probability: 68, colour: 'rust' },
      { id: 7, name: 'Orbit', mode: 'repeater', target: 7, kind: 'voice', interval: 1920, probability: 34, colour: 'blue' },
    ],
  },
  {
    name: 'Slow Bloom',
    genre: 'ambient / drone',
    detail: 'wide air, long tones, fewer surprises',
    macros: { tension: 28, movement: 6, density: 38, space: 76, damage: 8 },
    cells: [
      { id: 0, name: 'Murmur', mode: 'pulse', target: 0, kind: 'voice', interval: 1280, probability: 86, colour: 'moss' },
      { id: 1, name: 'Static', mode: 'gate', target: 3, kind: 'voice', interval: 2560, probability: 52, colour: 'amber' },
      { id: 2, name: 'Throb', mode: 'repeater', target: 0, kind: 'perc', interval: 960, probability: 60, colour: 'rose' },
      { id: 3, name: 'Wake', mode: 'delay', target: 7, kind: 'voice', interval: 3200, probability: 38, colour: 'ice' },
      { id: 4, name: 'Crush', mode: 'delay', target: 2, kind: 'perc', interval: 1920, probability: 28, colour: 'violet' },
      { id: 5, name: 'Drift', mode: 'pulse', target: 5, kind: 'voice', interval: 2240, probability: 44, colour: 'lime' },
      { id: 6, name: 'Ember', mode: 'pulse', target: 1, kind: 'perc', interval: 1600, probability: 24, colour: 'rust' },
      { id: 7, name: 'Orbit', mode: 'gate', target: 7, kind: 'voice', interval: 3520, probability: 32, colour: 'blue' },
    ],
  },
  {
    name: 'Pressure Loop',
    genre: 'industrial / rhythm',
    detail: 'a tighter machine with teeth around the edges',
    macros: { tension: 58, movement: 24, density: 78, space: 36, damage: 42 },
    cells: [
      { id: 0, name: 'Murmur', mode: 'pulse', target: 6, kind: 'voice', interval: 480, probability: 94, colour: 'moss' },
      { id: 1, name: 'Static', mode: 'repeater', target: 1, kind: 'voice', interval: 960, probability: 62, colour: 'amber' },
      { id: 2, name: 'Throb', mode: 'repeater', target: 1, kind: 'perc', interval: 480, probability: 100, colour: 'rose' },
      { id: 3, name: 'Wake', mode: 'gate', target: 4, kind: 'voice', interval: 1440, probability: 72, colour: 'ice' },
      { id: 4, name: 'Crush', mode: 'pulse', target: 3, kind: 'perc', interval: 960, probability: 76, colour: 'violet' },
      { id: 5, name: 'Drift', mode: 'random', target: 5, kind: 'voice', interval: 1920, probability: 42, colour: 'lime' },
      { id: 6, name: 'Ember', mode: 'pulse', target: 2, kind: 'perc', interval: 640, probability: 54, colour: 'rust' },
      { id: 7, name: 'Orbit', mode: 'repeater', target: 7, kind: 'voice', interval: 1280, probability: 46, colour: 'blue' },
    ],
  },
  {
    name: 'Concrete Echo',
    genre: 'dub techno / industrial',
    detail: 'elastic low-end with a cold rim',
    macros: { tension: 46, movement: 18, density: 66, space: 68, damage: 24 },
    cells: [
      { id: 0, name: 'Murmur', mode: 'pulse', target: 6, kind: 'voice', interval: 960, probability: 92, colour: 'moss' },
      { id: 1, name: 'Static', mode: 'repeater', target: 1, kind: 'voice', interval: 1920, probability: 48, colour: 'amber' },
      { id: 2, name: 'Throb', mode: 'repeater', target: 0, kind: 'perc', interval: 480, probability: 100, colour: 'rose' },
      { id: 3, name: 'Wake', mode: 'gate', target: 3, kind: 'voice', interval: 2560, probability: 38, colour: 'ice' },
      { id: 4, name: 'Crush', mode: 'delay', target: 2, kind: 'perc', interval: 960, probability: 54, colour: 'violet' },
      { id: 5, name: 'Drift', mode: 'random', target: 4, kind: 'voice', interval: 3840, probability: 22, colour: 'lime' },
      { id: 6, name: 'Ember', mode: 'pulse', target: 1, kind: 'perc', interval: 1920, probability: 70, colour: 'rust' },
      { id: 7, name: 'Orbit', mode: 'repeater', target: 7, kind: 'voice', interval: 2880, probability: 30, colour: 'blue' },
    ],
  },
  {
    name: 'Salt Circle',
    genre: 'ritual / percussion',
    detail: 'a hand-played loop hiding inside the fog',
    macros: { tension: 34, movement: 14, density: 74, space: 44, damage: 32 },
    cells: [
      { id: 0, name: 'Murmur', mode: 'pulse', target: 0, kind: 'voice', interval: 960, probability: 66, colour: 'moss' },
      { id: 1, name: 'Static', mode: 'gate', target: 3, kind: 'voice', interval: 1920, probability: 42, colour: 'amber' },
      { id: 2, name: 'Throb', mode: 'repeater', target: 0, kind: 'perc', interval: 480, probability: 100, colour: 'rose' },
      { id: 3, name: 'Wake', mode: 'pulse', target: 6, kind: 'voice', interval: 1920, probability: 56, colour: 'ice' },
      { id: 4, name: 'Crush', mode: 'pulse', target: 3, kind: 'perc', interval: 1280, probability: 68, colour: 'violet' },
      { id: 5, name: 'Drift', mode: 'random', target: 2, kind: 'voice', interval: 2560, probability: 28, colour: 'lime' },
      { id: 6, name: 'Ember', mode: 'repeater', target: 1, kind: 'perc', interval: 960, probability: 82, colour: 'rust' },
      { id: 7, name: 'Orbit', mode: 'delay', target: 7, kind: 'voice', interval: 3200, probability: 30, colour: 'blue' },
    ],
  },
  {
    name: 'Blue Hour',
    genre: 'cinematic / post-rock',
    detail: 'slow harmonic light with a distant impact',
    macros: { tension: 18, movement: 8, density: 34, space: 88, damage: 5 },
    cells: [
      { id: 0, name: 'Murmur', mode: 'pulse', target: 0, kind: 'voice', interval: 1600, probability: 80, colour: 'moss' },
      { id: 1, name: 'Static', mode: 'gate', target: 3, kind: 'voice', interval: 3200, probability: 48, colour: 'amber' },
      { id: 2, name: 'Throb', mode: 'repeater', target: 0, kind: 'perc', interval: 1920, probability: 36, colour: 'rose' },
      { id: 3, name: 'Wake', mode: 'delay', target: 7, kind: 'voice', interval: 4480, probability: 30, colour: 'ice' },
      { id: 4, name: 'Crush', mode: 'delay', target: 2, kind: 'perc', interval: 2560, probability: 22, colour: 'violet' },
      { id: 5, name: 'Drift', mode: 'pulse', target: 5, kind: 'voice', interval: 2880, probability: 44, colour: 'lime' },
      { id: 6, name: 'Ember', mode: 'pulse', target: 1, kind: 'perc', interval: 2240, probability: 20, colour: 'rust' },
      { id: 7, name: 'Orbit', mode: 'gate', target: 6, kind: 'voice', interval: 3840, probability: 30, colour: 'blue' },
    ],
  },
];

const presetSequenceWorlds: Record<string, SequenceWorld> = {
  'First Pulse': { bpm: 96, root: 0, scale: 'dorian', swing: 56, pulses: [4, 5, 3, 6], rotations: [0, 2, 0, 3], lengths: [16, 16, 12, 16], seed: 0 },
  'Slow Bloom': { bpm: 72, root: 5, scale: 'pentatonic', swing: 50, pulses: [3, 4, 2, 3], rotations: [0, 3, 1, 5], lengths: [16, 15, 12, 16], seed: 2 },
  'Pressure Loop': { bpm: 126, root: 1, scale: 'phrygian', swing: 52, pulses: [7, 9, 5, 11], rotations: [0, 1, 3, 5], lengths: [16, 16, 12, 15], seed: 1 },
  'Concrete Echo': { bpm: 118, root: 3, scale: 'minor', swing: 58, pulses: [4, 7, 3, 5], rotations: [0, 3, 1, 7], lengths: [16, 15, 12, 16], seed: 3 },
  'Salt Circle': { bpm: 108, root: 7, scale: 'dorian', swing: 61, pulses: [5, 8, 7, 9], rotations: [1, 3, 0, 4], lengths: [12, 16, 15, 16], seed: 4 },
  'Blue Hour': { bpm: 78, root: 9, scale: 'major', swing: 50, pulses: [3, 5, 2, 4], rotations: [0, 2, 1, 6], lengths: [16, 15, 12, 16], seed: 1 },
};

const formatSeconds = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const midiToFrequency = (midi: number) => 440 * (2 ** ((midi - 69) / 12));
const midiToLabel = (midi: number) => `${rootNames[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const sequenceStepMidi = (track: SequenceTrack, step: SequenceStep, root: number, scale: ScaleName) => {
  const intervals = scales[scale].intervals;
  const degree = Math.max(0, step.degree);
  return 36 + root + intervals[degree % intervals.length] + 12 * (track.octave + step.octave + Math.floor(degree / intervals.length));
};

function MacroKnob({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const rotation = -135 + value * 2.7;
  return <label className="macro-knob">
    <span>{label}</span>
    <span className="knob-body"><i aria-hidden="true" style={{ transform: `rotate(${rotation}deg)` }} /><input aria-label={label} type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} /></span>
    <output>{value}</output>
  </label>;
}

export default function Home() {
  const [surface, setSurface] = useState<Surface>('sound');
  const [setupOpen, setSetupOpen] = useState(false);
  const [openModules, setOpenModules] = useState<Record<Surface, boolean>>({ sound: true, sequence: false, licks: false, behaviour: false, patch: false });
  const [powered, setPowered] = useState(false);
  const [organismLinked, setOrganismLinked] = useState(true);
  const [organism, setOrganism] = useState<Organism>({ phase: 0, energy: 48, breath: 0.45, coherence: 0.72, signal: 'listening for a first gesture' });
  const [macros, setMacros] = useState<Macros>(defaultMacros);
  const [activeVoices, setActiveVoices] = useState<number[]>([]);
  const [latchedVoices, setLatchedVoices] = useState<number[]>([]);
  const [heldPercs, setHeldPercs] = useState<number[]>([]);
  const [cells, setCells] = useState<Cell[]>(initialCells);
  const [behaviourRunning, setBehaviourRunning] = useState(false);
  const [patches, setPatches] = useState<Patch[]>(initialPatches);
  const [patchSource, setPatchSource] = useState('Breath A');
  const [patchTarget, setPatchTarget] = useState('Filter');
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [sequenceTracks, setSequenceTracks] = useState<SequenceTrack[]>(initialSequenceTracks);
  const [sequencerPlaying, setSequencerPlaying] = useState(false);
  const [sequenceStep, setSequenceStep] = useState(-1);
  const [sequenceCycle, setSequenceCycle] = useState(1);
  const [bpm, setBpm] = useState(initialSequenceWorld.bpm);
  const [root, setRoot] = useState(initialSequenceWorld.root);
  const [scale, setScale] = useState<ScaleName>(initialSequenceWorld.scale);
  const [swing, setSwing] = useState(initialSequenceWorld.swing);
  const [selectedTrack, setSelectedTrack] = useState(0);
  const [selectedSequenceStep, setSelectedSequenceStep] = useState(0);
  const [evolveCount, setEvolveCount] = useState(0);
  const [scenes, setScenes] = useState<Record<string, StoredScene>>({});
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [events, setEvents] = useState<PerfEvent[]>([]);
  const [pulse, setPulse] = useState<number | null>(null);
  const [captureState, setCaptureState] = useState<'ready' | 'recording' | 'held'>('ready');
  const [captureSeconds, setCaptureSeconds] = useState(0);
  const [take, setTake] = useState<Blob | null>(null);
  const [meter, setMeter] = useState(0);
  const [notice, setNotice] = useState('Touch POWER, then play a surface.');
  const [droneSettings, setDroneSettings] = useState<DroneSettings>(defaultDroneSettings);
  const [droneRunning, setDroneRunning] = useState(false);
  const [dronePaused, setDronePaused] = useState(false);
  const [droneVoiceCount, setDroneVoiceCount] = useState(0);
  const [droneNotes, setDroneNotes] = useState<string[]>([]);
  const [droneSeed, setDroneSeed] = useState(0);

  const graphRef = useRef<Graph | null>(null);
  const cellsRef = useRef(cells);
  const macrosRef = useRef(macros);
  const sequenceTracksRef = useRef(sequenceTracks);
  const bpmRef = useRef(bpm);
  const rootRef = useRef(root);
  const scaleRef = useRef(scale);
  const swingRef = useRef(swing);
  const sequenceClockRef = useRef(0);
  const organismRef = useRef(organism);
  const organismLinkedRef = useRef(organismLinked);
  const patchesRef = useRef(patches);
  const organismClockRef = useRef(0);
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureStartedRef = useRef(0);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const droneSettingsRef = useRef(droneSettings);
  const droneRunningRef = useRef(droneRunning);
  const dronePausedRef = useRef(dronePaused);
  const droneGenerationTimerRef = useRef<number | null>(null);
  const droneSeedRef = useRef(Math.floor(Math.random() * 100000));
  const droneVoiceIdRef = useRef(0);
  const droneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const clockRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => { cellsRef.current = cells; }, [cells]);
  useEffect(() => { macrosRef.current = macros; }, [macros]);
  useEffect(() => { sequenceTracksRef.current = sequenceTracks; }, [sequenceTracks]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { rootRef.current = root; }, [root]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { swingRef.current = swing; }, [swing]);
  useEffect(() => { organismRef.current = organism; }, [organism]);
  useEffect(() => { organismLinkedRef.current = organismLinked; }, [organismLinked]);
  useEffect(() => { patchesRef.current = patches; }, [patches]);
  useEffect(() => { droneSettingsRef.current = droneSettings; }, [droneSettings]);
  useEffect(() => { droneRunningRef.current = droneRunning; }, [droneRunning]);
  useEffect(() => { dronePausedRef.current = dronePaused; }, [dronePaused]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try { setScenes(JSON.parse(localStorage.getItem('hi-drone-scenes') || '{}')); } catch { setScenes({}); }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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
    master.gain.value = 0.48;
    compressor.threshold.value = -16;
    compressor.knee.value = 22;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.18;
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
    droneDelay.connect(droneDelayFeedback);
    droneDelayFeedback.connect(droneDelay);
    droneChorusLfo.connect(droneChorusDepth);
    droneChorusDepth.connect(droneChorusDelay.delayTime);
    droneChorusLfo.start();
    droneNoise.connect(droneNoiseFilter);
    droneNoiseFilter.connect(droneNoiseGain);
    droneNoiseGain.connect(droneDry);
    droneNoiseGain.connect(droneReverb);
    droneNoiseGain.connect(droneDelay);
    droneNoise.start();
    master.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(context.destination);
    compressor.connect(capture);
    droneDry.connect(droneBus);
    droneReverb.connect(droneReverbWet);
    droneReverbWet.connect(droneBus);
    droneDelay.connect(droneDelayWet);
    droneDelayWet.connect(droneBus);
    droneDelayWet.connect(droneReverb);
    droneBus.connect(droneDrive);
    droneDrive.connect(droneChorusDry);
    droneDrive.connect(droneChorusDelay);
    droneChorusDelay.connect(droneChorusWet);
    droneChorusDry.connect(droneMaster);
    droneChorusWet.connect(droneMaster);
    droneMaster.connect(master);
    graphRef.current = { context, master, compressor, analyser, capture, voices: new Map(), droneMaster, droneBus, droneDrive, droneChorusDry, droneChorusDelay, droneChorusWet, droneChorusLfo, droneChorusDepth, droneDry, droneReverb, droneReverbWet, droneDelay, droneDelayFeedback, droneDelayWet, droneNoise, droneNoiseFilter, droneNoiseGain, droneVoices: new Map() };
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
    panner.pan.value = clamp((id - 3.5) / 6 + organismRef.current.breath * 0.12 - 0.06, -1, 1);
    shadow.connect(mod); mod.connect(carrier.frequency); carrier.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(graph.master);
    const now = graph.context.currentTime;
    gain.gain.setTargetAtTime((0.065 + macrosRef.current.density / 1900) * (0.82 + organismRef.current.energy / 420), now, 0.24);
    carrier.start(); shadow.start();
    graph.voices.set(id, { carrier, shadow, mod, gain, filter, panner });
    setActiveVoices((previous) => [...new Set([...previous, id])]);
    setOrganism((previous) => ({ ...previous, energy: clamp(previous.energy + 4, 0, 100), coherence: clamp(previous.coherence + 0.025, 0, 1), signal: `${voice.name} joined the body` }));
    setNotice(`${voice.name} is breathing`);
    addEvent(`${voice.name} / ${origin}`, 'voice');
  }, [addEvent, ensureAudio, latchedVoices, stopVoice]);

  const triggerPercussion = useCallback(async (id: number, origin: 'gesture' | 'cell' | 'held drone' = 'gesture') => {
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
    filter.frequency.value = (id === 0 ? 210 : id === 1 ? 110 : id === 2 ? 1900 : 3400) * (0.86 + organismRef.current.breath * 0.28);
    filter.Q.value = id === 3 ? 7 : 1.4;
    gain.gain.setValueAtTime(0.001, now); gain.gain.exponentialRampToValueAtTime((0.16 + macrosRef.current.damage / 800) * (0.82 + organismRef.current.energy / 430), now + 0.008); gain.gain.exponentialRampToValueAtTime(0.001, now + length);
    source.connect(filter); filter.connect(gain); gain.connect(graph.master); source.start(now); source.stop(now + length + 0.03);
    setOrganism((previous) => ({ ...previous, energy: clamp(previous.energy + 2.5, 0, 100), breath: clamp(previous.breath + 0.04, 0, 1), signal: `${item.name} fed the body` }));
    addEvent(`${item.name} / ${origin}`, 'pulse'); setNotice(`${item.name} struck the field`);
  }, [addEvent, ensureAudio]);

  const triggerSequenceNote = useCallback(async (track: SequenceTrack, midi: number, step: SequenceStep) => {
    const graph = await ensureAudio();
    const now = graph.context.currentTime;
    const frequency = midiToFrequency(midi);
    const carrier = graph.context.createOscillator();
    const shadow = graph.context.createOscillator();
    const filter = graph.context.createBiquadFilter();
    const gain = graph.context.createGain();
    const panner = graph.context.createStereoPanner();
    const voice = voices[track.voice];
    carrier.type = track.id === 0 ? 'triangle' : track.id === 1 ? 'sine' : track.id === 2 ? 'sawtooth' : 'square';
    shadow.type = track.id < 2 ? 'sine' : 'triangle';
    carrier.frequency.value = frequency;
    shadow.frequency.value = frequency * (track.id === 2 ? 1.502 : 1.003 + track.id * 0.0015);
    filter.type = track.id === 1 ? 'bandpass' : 'lowpass';
    filter.frequency.value = Math.min(7200, 540 + frequency * (2.1 + macrosRef.current.movement / 45));
    filter.Q.value = 0.9 + macrosRef.current.tension / 28;
    panner.pan.value = clamp([-0.28, 0.3, -0.08, 0.42][track.id] + organismRef.current.breath * 0.1 - 0.05, -1, 1);
    const stepLength = 60 / bpmRef.current / 4;
    const duration = Math.max(0.08, stepLength * (0.32 + track.gate / 42));
    const peak = ((step.accent ? 0.13 : 0.082) + macrosRef.current.density / 2400) * (0.82 + organismRef.current.energy / 460);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.018, peak * 0.45), now + Math.min(0.12, duration * 0.4));
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    carrier.connect(filter); shadow.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(graph.master);
    carrier.start(now); shadow.start(now); carrier.stop(now + duration + 0.04); shadow.stop(now + duration + 0.04);
    addEvent(`${voice.name} ${midiToLabel(midi)}`, 'sequence');
  }, [addEvent, ensureAudio]);

  const nextDroneRandom = useCallback(() => {
    droneSeedRef.current = (droneSeedRef.current * 1664525 + 1013904223) >>> 0;
    return droneSeedRef.current / 4294967296;
  }, []);

  const stopDroneVoice = useCallback((id: number) => {
    const graph = graphRef.current;
    const voice = graph?.droneVoices.get(id);
    if (!graph || !voice) return;
    const now = graph.context.currentTime;
    voice.voiceGain.gain.cancelScheduledValues(now);
    voice.voiceGain.gain.setTargetAtTime(0, now, 0.5);
    window.setTimeout(() => {
      voice.oscillators.forEach(({ osc }) => { try { osc.stop(); } catch {} });
      try { voice.filterLfo.stop(); } catch {}
      try { voice.pitchLfo.stop(); } catch {}
      try { voice.volLfo.stop(); } catch {}
      try { voice.panLfo.stop(); } catch {}
      if (voice.randomInterval) window.clearInterval(voice.randomInterval);
    }, 650);
    graph.droneVoices.delete(id);
    setDroneVoiceCount(graph.droneVoices.size);
    setDroneNotes(Array.from(graph.droneVoices.values()).map((item) => item.noteName));
  }, []);

  const stopAllDroneVoices = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    Array.from(graph.droneVoices.keys()).forEach(stopDroneVoice);
    if (droneGenerationTimerRef.current) window.clearTimeout(droneGenerationTimerRef.current);
    droneGenerationTimerRef.current = null;
  }, [stopDroneVoice]);

  const createDroneVoice = useCallback(async (frequency: number, noteName: string) => {
    const graph = await ensureAudio();
    const settings = droneSettingsRef.current;
    const now = graph.context.currentTime;
    const id = droneVoiceIdRef.current += 1;
    const voiceGain = graph.context.createGain();
    const filter = graph.context.createBiquadFilter();
    const panner = graph.context.createStereoPanner();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    filter.Q.value = 2;
    const oscillators: Array<{ osc: OscillatorNode; gain: GainNode }> = [];
    for (let index = 0; index < settings.oscCount; index += 1) {
      const osc = graph.context.createOscillator();
      const oscGain = graph.context.createGain();
      osc.type = settings.waveform;
      osc.frequency.value = frequency;
      osc.detune.value = settings.oscCount > 1 ? (index / (settings.oscCount - 1) - 0.5) * 2 * settings.detuneCents : 0;
      oscGain.gain.value = 0.8 + nextDroneRandom() * 0.4;
      osc.connect(oscGain); oscGain.connect(filter); osc.start();
      oscillators.push({ osc, gain: oscGain });
    }
    const filterLfo = graph.context.createOscillator();
    filterLfo.frequency.value = settings.filterRate * (dronePrimes[Math.floor(nextDroneRandom() * dronePrimes.length)] / 10);
    const filterLfoGain = graph.context.createGain();
    filterLfoGain.gain.value = settings.modulationShape === 'sine' ? settings.filterDepth * 3000 : 0;
    filterLfo.connect(filterLfoGain); filterLfoGain.connect(filter.frequency); filterLfo.start();
    const pitchLfo = graph.context.createOscillator();
    pitchLfo.frequency.value = settings.filterRate * 0.3 * (dronePrimes[Math.floor(nextDroneRandom() * dronePrimes.length)] / 10);
    const pitchLfoGain = graph.context.createGain();
    pitchLfoGain.gain.value = settings.modulationShape === 'sine' ? settings.pitchDrift * 50 : 0;
    pitchLfo.connect(pitchLfoGain); oscillators.forEach(({ osc }) => pitchLfoGain.connect(osc.detune)); pitchLfo.start();
    const volLfo = graph.context.createOscillator();
    volLfo.frequency.value = settings.filterRate * 0.5 * (dronePrimes[Math.floor(nextDroneRandom() * dronePrimes.length)] / 10);
    const volLfoGain = graph.context.createGain();
    volLfoGain.gain.value = settings.modulationShape === 'sine' ? settings.volLfoDepth * 0.3 : 0;
    volLfo.connect(volLfoGain); volLfoGain.connect(voiceGain.gain); volLfo.start();
    const panLfo = graph.context.createOscillator();
    panLfo.frequency.value = settings.filterRate * 0.37 * (dronePrimes[Math.floor(nextDroneRandom() * dronePrimes.length)] / 10);
    const panLfoGain = graph.context.createGain();
    panLfoGain.gain.value = settings.modulationShape === 'sine' ? settings.panDepth : 0;
    panLfo.connect(panLfoGain); panLfoGain.connect(panner.pan); panLfo.start();
    filter.connect(voiceGain); voiceGain.connect(panner); panner.connect(graph.droneDry); panner.connect(graph.droneReverb); panner.connect(graph.droneDelay);
    const attackTime = 3 + nextDroneRandom() * 5;
    const releaseTime = 6 + nextDroneRandom() * 8;
    const sustainLevel = 0.15 + nextDroneRandom() * 0.1;
    const noteDuration = 20 + nextDroneRandom() * 30;
    voiceGain.gain.setValueAtTime(0.001, now);
    voiceGain.gain.linearRampToValueAtTime(sustainLevel, now + attackTime);
    voiceGain.gain.setValueAtTime(sustainLevel, now + noteDuration);
    voiceGain.gain.linearRampToValueAtTime(0.001, now + noteDuration + releaseTime);
    let randomInterval: number | null = null;
    if (settings.modulationShape === 'random') {
      const intervalMs = Math.max(480, 1000 / Math.max(0.01, settings.filterRate * 4));
      randomInterval = window.setInterval(() => {
        const time = graph.context.currentTime;
        const glide = Math.max(0.18, intervalMs / 1000 * 0.78);
        filter.frequency.setTargetAtTime(240 + nextDroneRandom() * settings.filterDepth * 4200, time, glide);
        panner.pan.setTargetAtTime((nextDroneRandom() * 2 - 1) * settings.panDepth, time, glide);
        oscillators.forEach(({ osc }) => osc.detune.setTargetAtTime((nextDroneRandom() * 2 - 1) * settings.pitchDrift * 50, time, glide));
      }, intervalMs);
    }
    const voice = { noteName, oscillators, voiceGain, filter, panner, filterLfo, filterLfoGain, pitchLfo, pitchLfoGain, volLfo, volLfoGain, panLfo, panLfoGain, randomInterval };
    graph.droneVoices.set(id, voice);
    setDroneVoiceCount(graph.droneVoices.size);
    setDroneNotes(Array.from(graph.droneVoices.values()).map((item) => item.noteName));
    addEvent(`drone ${noteName}`, 'voice');
    window.setTimeout(() => stopDroneVoice(id), (noteDuration + releaseTime + 1) * 1000);
  }, [addEvent, ensureAudio, nextDroneRandom, stopDroneVoice]);

  const generateDroneNote = useCallback(async () => {
    const graph = graphRef.current;
    const settings = droneSettingsRef.current;
    if (!droneRunningRef.current || dronePausedRef.current) return;
    if (graph && graph.droneVoices.size >= settings.maxVoices) {
      const primeMultiplier = 0.7 + (dronePrimes[Math.floor(nextDroneRandom() * 6)] / dronePrimes[6]) * 0.6;
      droneGenerationTimerRef.current = window.setTimeout(generateDroneNote, settings.genSpeed * primeMultiplier * 1000);
      return;
    }
    const scale = droneScales[settings.scale].intervals;
    const random = nextDroneRandom();
    const scaleIndex = Math.floor(Math.pow(random, 1.8) * scale.length * 2);
    const octave = random < 0.4 ? 1 : random < 0.75 ? 2 : 3;
    const semitones = scale[scaleIndex % scale.length] + Math.floor(scaleIndex / scale.length) * 12;
    const frequency = settings.basePitch * Math.pow(2, (semitones + (octave - 1) * 12) / 12);
    const noteNames = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
    const totalSemitones = Math.round(12 * Math.log2(settings.basePitch / 16.351)) + semitones + (octave - 1) * 12;
    await createDroneVoice(frequency, `${noteNames[((totalSemitones % 12) + 12) % 12]}${Math.floor(totalSemitones / 12)}`);
    if (droneRunningRef.current && !dronePausedRef.current) {
      const primeMultiplier = 0.7 + (dronePrimes[Math.floor(nextDroneRandom() * 6)] / dronePrimes[6]) * 0.6;
      droneGenerationTimerRef.current = window.setTimeout(generateDroneNote, settings.genSpeed * primeMultiplier * 1000);
    }
  }, [createDroneVoice, nextDroneRandom]);

  const startDroneEngine = useCallback(async () => {
    await ensureAudio();
    setPowered(true);
    setDroneRunning(true);
    setDronePaused(false);
    droneRunningRef.current = true;
    dronePausedRef.current = false;
    setNotice('drone engine generating — incommensurable weather is moving');
    addEvent('drone engine started', 'gesture');
    window.setTimeout(generateDroneNote, 450);
    window.setTimeout(generateDroneNote, 2450);
  }, [addEvent, ensureAudio, generateDroneNote]);

  const toggleDronePause = useCallback(() => {
    setDronePaused((previous) => {
      const next = !previous;
      dronePausedRef.current = next;
      setNotice(next ? 'drone generator paused — voices are still evolving' : 'drone generator resumed');
      if (!next) window.setTimeout(generateDroneNote, 80);
      return next;
    });
  }, [generateDroneNote]);

  const newDroneSeed = useCallback(() => {
    const nextSeed = Math.floor(Math.random() * 100000);
    droneSeedRef.current = nextSeed;
    setDroneSeed(nextSeed);
    setNotice(`new drone seed ${nextSeed} — a different weather system is forming`);
    addEvent('drone seed changed', 'gesture');
    if (droneRunningRef.current && !dronePausedRef.current) window.setTimeout(generateDroneNote, 80);
  }, [addEvent, generateDroneNote]);

  const updateDroneSetting = <K extends keyof DroneSettings>(key: K, value: DroneSettings[K]) => {
    setDroneSettings((previous) => ({ ...previous, [key]: value }));
    if (key === 'basePitch') {
      const midi = Math.round(69 + 12 * Math.log2(Number(value) / 440));
      setRoot(((midi % 12) + 12) % 12);
    }
    if (key === 'filterDepth') setMacros((previous) => ({ ...previous, movement: Math.round(Number(value) * 100) }));
    if (key === 'volLfoDepth') setMacros((previous) => ({ ...previous, tension: Math.round(Number(value) * 100) }));
    if (key === 'reverbAmount') setMacros((previous) => ({ ...previous, space: Math.round(Number(value) * 100) }));
    if (key === 'driveAmount') setMacros((previous) => ({ ...previous, damage: Math.round(Number(value) * 100) }));
    if (key === 'maxVoices') setMacros((previous) => ({ ...previous, density: Math.round((Number(value) / 12) * 100) }));
    if (key === 'scale') {
      const linkedScale: Partial<Record<DroneScaleName, ScaleName>> = { minor: 'minor', dorian: 'dorian', phrygian: 'phrygian', pentaMinor: 'pentatonic' };
      const nextScale = linkedScale[value as DroneScaleName];
      if (nextScale) setScale(nextScale);
    }
  };

  const togglePower = useCallback(async () => {
    if (powered) { graphRef.current?.context.suspend(); setPowered(false); setSequencerPlaying(false); setDroneRunning(false); droneRunningRef.current = false; stopAllDroneVoices(); setNotice('engine asleep'); addEvent('engine asleep', 'gesture'); return; }
    await ensureAudio(); setPowered(true); setNotice('engine awake — touch a body'); addEvent('engine awake', 'gesture');
  }, [addEvent, ensureAudio, powered, stopAllDroneVoices]);

  const toggleSequencer = useCallback(async () => {
    if (sequencerPlaying) {
      setSequencerPlaying(false);
      setSequenceStep(-1);
      setNotice('melodic current paused');
      addEvent('sequencer paused', 'gesture');
      return;
    }
    await ensureAudio();
    sequenceClockRef.current = 0;
    setPowered(true);
    setSequencerPlaying(true);
    setNotice(`${rootNames[rootRef.current]} ${scales[scaleRef.current].label} current moving`);
    addEvent('sequencer started', 'gesture');
  }, [addEvent, ensureAudio, sequencerPlaying]);

  useEffect(() => {
    if (!powered || !sequencerPlaying) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const absoluteStep = sequenceClockRef.current;
      const stepIndex = absoluteStep % 16;
      const cycleIndex = Math.floor(absoluteStep / 16) % 4;
      const scaleIntervals = scales[scaleRef.current].intervals;
      setSequenceStep(stepIndex);
      setSequenceCycle(cycleIndex + 1);
      sequenceTracksRef.current.forEach((track) => {
        if (track.muted) return;
        const localIndex = stepIndex % track.length;
        const step = track.steps[localIndex];
        const livingChance = track.chance * step?.chance * (0.72 + organismRef.current.coherence * 0.38);
        if (!step?.active || Math.random() * 10000 > livingChance) return;
        const organicLift = organismRef.current.breath > 0.72 && track.id % 2 === 1 ? 1 : 0;
        const cycleMotion = cycleIndex === 1 && track.id % 2 === 1 ? 1 : cycleIndex === 2 ? (track.id + 1) % 3 : 0;
        const degree = Math.max(0, step.degree + cycleMotion + organicLift);
        const scaleOctave = Math.floor(degree / scaleIntervals.length);
        const interval = scaleIntervals[degree % scaleIntervals.length];
        const midi = 36 + rootRef.current + interval + 12 * (track.octave + step.octave + scaleOctave);
        triggerSequenceNote(track, midi, step);
      });
      if (stepIndex === 0) {
        setNotice(`phrase cycle ${cycleIndex + 1}/4 · ${rootNames[rootRef.current]} ${scales[scaleRef.current].label}`);
        setOrganism((previous) => ({ ...previous, coherence: clamp(previous.coherence + 0.04, 0, 1), signal: `cycle ${cycleIndex + 1} returned to the body` }));
      }
      sequenceClockRef.current += 1;
      const baseStep = 60000 / bpmRef.current / 4;
      const swingDepth = Math.max(0, (swingRef.current - 50) / 50) * 0.42;
      const nextDelay = baseStep * (stepIndex % 2 === 0 ? 1 + swingDepth : 1 - swingDepth);
      sequenceTimerRef.current = setTimeout(tick, nextDelay);
    };
    tick();
    return () => {
      cancelled = true;
      if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
    };
  }, [powered, sequencerPlaying, triggerSequenceNote]);

  useEffect(() => {
    if (!powered || !organismLinked) return;
    organismClockRef.current = 0;
    const interval = window.setInterval(() => {
      const tick = organismClockRef.current;
      const patchPressure = patchesRef.current.reduce((sum, patch) => sum + Math.abs(patch.amount), 0) / 300;
      const voiceCount = graphRef.current?.voices.size ?? 0;
      const breath = 0.5 + Math.sin(tick * 0.17 + patchPressure) * 0.32;
      const coherence = clamp(0.58 + Math.sin(tick * 0.07) * 0.14 + (sequencerPlaying ? 0.12 : 0) - (patchPressure * 0.02), 0.12, 0.96);
      const targetEnergy = clamp(28 + macrosRef.current.density * 0.42 + voiceCount * 4 + (behaviourRunning ? 9 : 0) + breath * 8, 0, 100);
      setOrganism((previous) => ({
        phase: tick,
        energy: previous.energy * 0.84 + targetEnergy * 0.16,
        breath,
        coherence,
        signal: sequencerPlaying ? 'sequence and voices exchanging breath' : behaviourRunning ? 'cells are feeding the field' : voiceCount ? `${voiceCount} voices sharing the body` : 'listening for a first gesture',
      }));
      const graph = graphRef.current;
      if (graph) {
        const now = graph.context.currentTime;
        graph.voices.forEach((node, id) => {
          const voice = voices[id];
          const movement = macrosRef.current.movement * 14 + Math.sin(tick * 0.11 + id) * (8 + patchPressure * 3);
          node.filter.frequency.setTargetAtTime(Math.max(90, voice.base * 3.4 + movement), now, 0.16);
          node.filter.Q.setTargetAtTime(0.8 + macrosRef.current.tension / 18 + coherence * 1.8, now, 0.2);
          node.mod.gain.setTargetAtTime(voice.base * (0.015 + macrosRef.current.damage / 1800) * (0.86 + breath * 0.22), now, 0.18);
          node.gain.gain.setTargetAtTime((0.065 + macrosRef.current.density / 1900) * (0.78 + targetEnergy / 450), now, 0.24);
          node.panner.pan.setTargetAtTime(clamp((id - 3.5) / 6 + (breath - 0.5) * 0.22, -1, 1), now, 0.3);
        });
      }
      organismClockRef.current += 1;
    }, 160);
    return () => window.clearInterval(interval);
  }, [behaviourRunning, organismLinked, powered, sequencerPlaying]);

  useEffect(() => {
    if (!powered || !behaviourRunning) return;
    clockRef.current = 0;
    const interval = setInterval(() => {
      clockRef.current += 80;
      cellsRef.current.forEach((cell) => {
        const intervalMs = Math.max(220, cell.interval * (1 - (macrosRef.current.movement / 100) * 0.28) * (0.88 + organismRef.current.breath * 0.24));
        if (clockRef.current % Math.round(intervalMs / 80) !== 0) return;
        const chance = Math.min(0.98, (cell.probability / 100) * (0.65 + (macrosRef.current.density / 100) * 0.55) * (0.78 + organismRef.current.energy / 280));
        if (Math.random() > chance) return;
        setPulse(cell.id); window.setTimeout(() => setPulse((current) => current === cell.id ? null : current), 240);
        setOrganism((previous) => ({ ...previous, energy: clamp(previous.energy + 1.5, 0, 100), coherence: clamp(previous.coherence - 0.01, 0, 1), signal: `${cell.name} passed a signal through the body` }));
        if (cell.kind === 'voice') { const target = cell.mode === 'random' ? Math.floor(Math.random() * voices.length) : cell.target; activateVoice(target, 'cell'); if (cell.mode === 'gate') window.setTimeout(() => stopVoice(target), 220 + macrosRef.current.space * 8); }
        else { const target = cell.mode === 'random' ? Math.floor(Math.random() * percussion.length) : cell.target; triggerPercussion(target, 'cell'); }
      });
    }, 80);
    return () => clearInterval(interval);
  }, [activateVoice, behaviourRunning, powered, stopVoice, triggerPercussion]);

  useEffect(() => {
    if (!powered || !heldPercs.length) return;
    const interval = window.setInterval(() => {
      heldPercs.forEach((id) => triggerPercussion(id, 'held drone'));
    }, Math.max(360, 900 - macrosRef.current.space * 4));
    return () => window.clearInterval(interval);
  }, [heldPercs, powered, triggerPercussion]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.context.currentTime;
    graph.droneMaster.gain.setTargetAtTime(droneSettings.masterVolume, now, 0.08);
    graph.droneReverbWet.gain.setTargetAtTime(droneSettings.reverbAmount, now, 0.12);
    graph.droneDry.gain.setTargetAtTime(1 - droneSettings.reverbAmount * 0.5, now, 0.12);
    graph.droneDelayWet.gain.setTargetAtTime(droneSettings.delayAmount, now, 0.12);
    graph.droneDelay.delayTime.setTargetAtTime(droneSettings.delayTime, now, 0.12);
    graph.droneDelayFeedback.gain.setTargetAtTime(droneSettings.delayFeedback, now, 0.12);
    graph.droneDrive.curve = createDriveCurve(droneSettings.driveAmount);
    graph.droneChorusDry.gain.setTargetAtTime(1 - droneSettings.chorusAmount * 0.35, now, 0.12);
    graph.droneChorusWet.gain.setTargetAtTime(droneSettings.chorusAmount, now, 0.12);
    graph.droneChorusDepth.gain.setTargetAtTime(droneSettings.chorusAmount * 0.004, now, 0.12);
    graph.droneChorusLfo.frequency.setTargetAtTime(0.12 + droneSettings.filterRate * 2, now, 0.2);
    graph.droneNoiseGain.gain.setTargetAtTime(droneRunning ? droneSettings.noiseAmount * 0.12 : 0, now, 0.24);
    graph.droneNoiseFilter.type = droneSettings.noiseColor === 'white' ? 'allpass' : 'lowpass';
    graph.droneNoiseFilter.frequency.setTargetAtTime(droneSettings.noiseColor === 'brown' ? 720 : droneSettings.noiseColor === 'pink' ? 3800 : 12000, now, 0.18);
    graph.droneVoices.forEach((voice) => {
      const sine = droneSettings.modulationShape === 'sine';
      voice.filterLfo.frequency.setTargetAtTime(droneSettings.filterRate, now, 0.2);
      voice.filterLfoGain.gain.setTargetAtTime(sine ? droneSettings.filterDepth * 3000 : 0, now, 0.2);
      voice.pitchLfo.frequency.setTargetAtTime(droneSettings.filterRate * 0.3, now, 0.2);
      voice.pitchLfoGain.gain.setTargetAtTime(sine ? droneSettings.pitchDrift * 50 : 0, now, 0.2);
      voice.volLfo.frequency.setTargetAtTime(droneSettings.filterRate * 0.5, now, 0.2);
      voice.volLfoGain.gain.setTargetAtTime(sine ? droneSettings.volLfoDepth * 0.3 : 0, now, 0.2);
      voice.panLfo.frequency.setTargetAtTime(droneSettings.filterRate * 0.37, now, 0.2);
      voice.panLfoGain.gain.setTargetAtTime(sine ? droneSettings.panDepth : 0, now, 0.2);
      if (voice.randomInterval) window.clearInterval(voice.randomInterval);
      voice.randomInterval = null;
      if (!sine) {
        const intervalMs = Math.max(480, 1000 / Math.max(0.01, droneSettings.filterRate * 4));
        voice.randomInterval = window.setInterval(() => {
          const settings = droneSettingsRef.current;
          const time = graph.context.currentTime;
          const glide = Math.max(0.18, intervalMs / 1000 * 0.78);
          voice.filter.frequency.setTargetAtTime(240 + nextDroneRandom() * settings.filterDepth * 4200, time, glide);
          voice.panner.pan.setTargetAtTime((nextDroneRandom() * 2 - 1) * settings.panDepth, time, glide);
          voice.oscillators.forEach(({ osc }) => osc.detune.setTargetAtTime((nextDroneRandom() * 2 - 1) * settings.pitchDrift * 50, time, glide));
        }, intervalMs);
      }
    });
  }, [droneRunning, droneSettings, nextDroneRandom]);

  useEffect(() => {
    const canvas = droneCanvasRef.current;
    const graph = graphRef.current;
    if (!canvas || !graph) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let frame = 0;
    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
        canvas.width = Math.floor(width * ratio); canvas.height = Math.floor(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const data = new Uint8Array(graph.analyser.frequencyBinCount);
      graph.analyser.getByteFrequencyData(data);
      const bars = Math.min(96, data.length);
      const gap = 2;
      const barWidth = Math.max(2, (width - gap * bars) / bars);
      for (let index = 0; index < bars; index += 1) {
        const value = data[index] / 255;
        const barHeight = Math.max(2, value * height * 0.78);
        const gradient = context.createLinearGradient(0, height - barHeight, 0, height);
        gradient.addColorStop(0, 'rgba(121, 169, 255, .95)');
        gradient.addColorStop(1, 'rgba(165, 147, 255, .08)');
        context.fillStyle = gradient;
        context.fillRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight);
      }
      frame = window.requestAnimationFrame(draw);
    };
    draw();
    return () => window.cancelAnimationFrame(frame);
  }, [droneRunning, openModules.sound, powered]);

  useEffect(() => {
    if (!graphRef.current) return;
    let frame = 0; const data = new Uint8Array(graphRef.current.analyser.fftSize);
    const draw = () => { const analyser = graphRef.current?.analyser; if (!analyser) return; analyser.getByteTimeDomainData(data); const peak = data.reduce((highest, value) => Math.max(highest, Math.abs(value - 128)), 0); setMeter(Math.min(100, Math.round((peak / 72) * 100))); frame = requestAnimationFrame(draw); };
    draw(); return () => cancelAnimationFrame(frame);
  }, [powered]);

  const saveScene = useCallback((slot: string) => {
    const next = { ...scenes, [slot]: { macros, cells, patches, drone: droneSettings, sequence: { tracks: sequenceTracks, bpm, root, scale, swing } } }; setScenes(next); setActiveScene(slot); localStorage.setItem('hi-drone-scenes', JSON.stringify(next)); addEvent(`scene ${slot} stored`, 'scene'); setNotice(`scene ${slot} held in local memory`);
  }, [addEvent, bpm, cells, droneSettings, macros, patches, root, scale, scenes, sequenceTracks, swing]);
  const loadScene = useCallback((slot: string) => {
    const scene = scenes[slot]; if (!scene) { saveScene(slot); return; }
    setMacros(scene.macros); setCells(scene.cells); setPatches(scene.patches);
    if (scene.drone) setDroneSettings(scene.drone);
    if (scene.sequence) { setSequenceTracks(scene.sequence.tracks); setBpm(scene.sequence.bpm); setRoot(scene.sequence.root); setScale(scene.sequence.scale); setSwing(scene.sequence.swing); }
    setActiveScene(slot); setActivePreset(null); addEvent(`scene ${slot} recalled`, 'scene'); setNotice(`scene ${slot} is breathing`);
  }, [addEvent, saveScene, scenes]);

  const connectPatch = useCallback(() => {
    setPatches((previous) => {
      if (previous.some((patch) => patch.source === patchSource && patch.target === patchTarget)) return previous;
      const nextId = previous.reduce((highest, patch) => Math.max(highest, patch.id), -1) + 1;
      return [...previous, { id: nextId, source: patchSource, target: patchTarget, amount: Math.round(24 + organismRef.current.breath * 32) }];
    });
    setOrganism((previous) => ({ ...previous, coherence: clamp(previous.coherence + 0.08, 0, 1), signal: `${patchSource} began feeding ${patchTarget}` }));
    addEvent(`patch ${patchSource} → ${patchTarget}`, 'patch');
    setNotice(`${patchSource} now feeds ${patchTarget}`);
  }, [addEvent, patchSource, patchTarget]);

  const applyPreset = useCallback((preset: Preset) => {
    const world = presetSequenceWorlds[preset.name];
    setMacros(preset.macros);
    setDroneSettings((previous) => ({
      ...previous,
      filterDepth: preset.macros.movement / 100,
      volLfoDepth: preset.macros.tension / 100,
      reverbAmount: preset.macros.space / 100,
      driveAmount: preset.macros.damage / 100,
      maxVoices: clamp(Math.round((preset.macros.density / 100) * 12), 1, 12),
      scale: world?.scale === 'major' ? 'pentaMajor' : world?.scale === 'pentatonic' ? 'pentaMinor' : (world?.scale ?? previous.scale) as DroneScaleName,
    }));
    setCells(preset.cells.map((cell) => ({ ...cell })));
    if (world) { setSequenceTracks(buildSequenceTracks(world)); setBpm(world.bpm); setRoot(world.root); setScale(world.scale); setSwing(world.swing); }
    setActivePreset(preset.name);
    setActiveScene(null);
    setSetupOpen(false);
    addEvent(`preset ${preset.name}`, 'scene');
    setNotice(`${preset.name}: ${preset.detail}`);
  }, [addEvent]);

  const foldJazzLickIntoDrone = useCallback((lick: JazzLick) => {
    const jazzWorld: SequenceWorld = { bpm: 112, root: 7, scale: 'major', swing: 54, pulses: [5, 7, 4, 5], rotations: [0, 1, 2, 3], lengths: [16, 16, 12, 16], seed: 5 };
    setMacros({ tension: 42, movement: 16, density: 48, space: 68, damage: 12 });
    setSequenceTracks(buildSequenceTracks(jazzWorld));
    setBpm(jazzWorld.bpm); setRoot(jazzWorld.root); setScale(jazzWorld.scale); setSwing(jazzWorld.swing);
    setActivePreset(null); setActiveScene(null); setSurface('sequence');
    setNotice(`${lick.name} folded into G major — let the drone hold the landing`);
    addEvent(`jazz lick / ${lick.name}`, 'sequence');
  }, [addEvent]);

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

  const updateMacro = (key: keyof Macros, value: number) => {
    setMacros((previous) => ({ ...previous, [key]: value }));
    if (key === 'movement') setDroneSettings((previous) => ({ ...previous, filterDepth: value / 100 }));
    if (key === 'tension') setDroneSettings((previous) => ({ ...previous, volLfoDepth: value / 100 }));
    if (key === 'space') setDroneSettings((previous) => ({ ...previous, reverbAmount: value / 100 }));
    if (key === 'damage') setDroneSettings((previous) => ({ ...previous, driveAmount: value / 100 }));
    if (key === 'density') setDroneSettings((previous) => ({ ...previous, maxVoices: clamp(Math.round((value / 100) * 12), 1, 12) }));
    addEvent(`${key} ${value}`, 'gesture');
  };
  const toggleLatch = (id: number) => { setLatchedVoices((previous) => previous.includes(id) ? previous.filter((voiceId) => voiceId !== id) : [...previous, id]); addEvent(`${voices[id].name} latch`, 'gesture'); };
  const toggleHold = (id: number) => { setHeldPercs((previous) => previous.includes(id) ? previous.filter((percId) => percId !== id) : [...previous, id]); addEvent(`${percussion[id].name} ${heldPercs.includes(id) ? 'released' : 'held as drone'}`, 'gesture'); };
  const updateTrackStructure = (id: number, key: 'length' | 'pulses' | 'rotate', value: number) => {
    setSequenceTracks((previous) => previous.map((track) => {
      if (track.id !== id) return track;
      const length = key === 'length' ? value : track.length;
      const pulses = Math.min(key === 'pulses' ? value : track.pulses, length);
      const rotate = (key === 'rotate' ? value : track.rotate) % length;
      const pattern = euclideanPattern(length, pulses, rotate);
      return { ...track, length, pulses, rotate, steps: track.steps.map((step, index) => ({ ...step, active: pattern[index] })) };
    }));
  };
  const updateTrackValue = (id: number, key: 'octave' | 'range' | 'chance' | 'gate', value: number) => {
    setSequenceTracks((previous) => previous.map((track) => track.id === id ? { ...track, [key]: value } : track));
  };
  const toggleTrackMute = (id: number) => setSequenceTracks((previous) => previous.map((track) => track.id === id ? { ...track, muted: !track.muted } : track));
  const toggleSequenceStep = (trackId: number, index: number) => {
    setSelectedTrack(trackId); setSelectedSequenceStep(index);
    setSequenceTracks((previous) => previous.map((track) => track.id === trackId ? { ...track, steps: track.steps.map((step, stepIndex) => stepIndex === index ? { ...step, active: !step.active } : step) } : track));
  };
  const updateSelectedStep = (changes: Partial<SequenceStep>) => {
    setSequenceTracks((previous) => previous.map((track) => track.id === selectedTrack ? { ...track, steps: track.steps.map((step, index) => index === selectedSequenceStep ? { ...step, ...changes } : step) } : track));
  };
  const reseedTrack = (id: number) => {
    const generation = evolveCount + 1;
    setEvolveCount(generation);
    setSequenceTracks((previous) => previous.map((track) => track.id === id ? { ...track, steps: track.steps.map((step, index) => ({ ...step, degree: (index * (id + 1) + generation + Math.floor(index / 4)) % track.range })) } : track));
    addEvent(`track ${id + 1} melody reseeded`, 'gesture');
  };
  const evolveSequence = () => {
    const generation = evolveCount + 1;
    setEvolveCount(generation);
    setSequenceTracks((previous) => previous.map((track) => {
      const rotate = (track.rotate + 1 + (track.id % 2)) % track.length;
      const pattern = euclideanPattern(track.length, track.pulses, rotate);
      return { ...track, rotate, steps: track.steps.map((step, index) => ({ ...step, active: pattern[index], degree: step.active && (index + generation + track.id) % 4 === 0 ? (step.degree + 1) % track.range : step.degree })) };
    }));
    setNotice(`variation ${generation} folded into the phrase`); addEvent(`sequence evolved ${generation}`, 'sequence');
  };
  const toggleBehaviourNetwork = useCallback(async () => {
    if (behaviourRunning) { setBehaviourRunning(false); setNotice('behaviour cells sleeping — sequence remains clear'); return; }
    await ensureAudio(); setPowered(true); setBehaviourRunning(true); setSequencerPlaying(true); sequenceClockRef.current = 0; setNotice('behaviour cells joined the sequence');
  }, [behaviourRunning, ensureAudio]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === ' ') { event.preventDefault(); togglePower(); }
      if (event.key.toLowerCase() === 'r') {
        if (captureState === 'recording') stopCapture();
        else startCapture();
      }
      if (event.key.toLowerCase() === 'p') toggleSequencer();
      if (/^[1-8]$/.test(event.key)) activateVoice(Number(event.key) - 1);
      if (event.key.toLowerCase() === 'q' || event.key === '[') setSurface('sound');
      if (event.key.toLowerCase() === 'w' || event.key === ']') setSurface('sequence');
      if (event.key.toLowerCase() === 'e') setSurface('behaviour');
      if (event.key.toLowerCase() === 't' || event.key === '\\') setSurface('patch');
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [activateVoice, captureState, startCapture, stopCapture, togglePower, toggleSequencer]);

  const timeline = useMemo(() => events.slice(-14), [events]);
  const slots = ['A', 'B', 'C', 'D'];
  const modes: CellMode[] = ['pulse', 'gate', 'random', 'delay', 'repeater'];
  const selectedTrackData = sequenceTracks[selectedTrack];
  const selectedStepData = selectedTrackData.steps[selectedSequenceStep];
  const selectedScale = scales[scale];
  const selectedDegree = Math.max(0, selectedStepData.degree);
  const selectedMidi = 36 + root + selectedScale.intervals[selectedDegree % selectedScale.intervals.length] + 12 * (selectedTrackData.octave + selectedStepData.octave + Math.floor(selectedDegree / selectedScale.intervals.length));

  return <main className="instrument-shell">
    <header className="topbar"><div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><div><h1>HI DRONE</h1><p>synth soul / organismic composition station</p></div></div><div className="cosmos-readout" aria-label="Space environment"><span><i aria-hidden="true" />ORBITAL FIELD</span><strong>LUNAR DRIFT / DEEP SPACE</strong></div><div className="top-actions"><div className={`organism-state ${organismLinked ? 'is-linked' : ''}`} title={organism.signal}><span aria-hidden="true" />{organismLinked ? 'synth soul' : 'manual mode'}<small>{Math.round(organism.energy * organism.coherence)}%</small></div><button className={`organism-toggle ${organismLinked ? 'is-on' : ''}`} type="button" onClick={() => { setOrganismLinked((previous) => !previous); setNotice(organismLinked ? 'organism link loosened — manual currents only' : 'organism link restored — everything can feed everything'); }}><span aria-hidden="true">⌁</span> LINK</button><button className="deck-toggle" type="button" onClick={() => { const shouldOpen = !Object.values(openModules).some(Boolean); setOpenModules({ sound: shouldOpen, sequence: shouldOpen, licks: shouldOpen, behaviour: shouldOpen, patch: shouldOpen }); }}>{Object.values(openModules).some(Boolean) ? 'FOLD DECK' : 'OPEN DECK'}</button><div className={`engine-state ${powered ? 'awake' : ''}`}><span aria-hidden="true" />{powered ? 'engine awake' : 'engine asleep'}</div><button className={`power-button ${powered ? 'is-on' : ''}`} type="button" onClick={togglePower}><span aria-hidden="true">◉</span> POWER</button></div></header>
    <button className="setup-toggle" type="button" aria-expanded={setupOpen} aria-controls="weather-controls" onClick={() => setSetupOpen((previous) => !previous)}><span>WEATHER CONTROLS</span><strong>{activePreset ?? `${rootNames[root]} ${scales[scale].label}`}</strong><i aria-hidden="true">{setupOpen ? 'CLOSE −' : 'OPEN +'}</i></button>
    <div className={`setup-stack ${setupOpen ? 'is-open' : ''}`} id="weather-controls">
      <section className="global-rack" aria-label="Global controls">{(Object.keys(macros) as Array<keyof Macros>).map((key) => <MacroKnob key={key} label={key} value={macros[key]} onChange={(value) => updateMacro(key, value)} />)}<div className="scene-bank" aria-label="Scenes"><span>SCENES</span><div>{slots.map((slot) => <button key={slot} type="button" className={activeScene === slot ? 'is-active' : ''} title={scenes[slot] ? `Recall scene ${slot}` : `Store scene ${slot}`} onClick={() => loadScene(slot)} onContextMenu={(event) => { event.preventDefault(); saveScene(slot); }}>{slot}</button>)}</div></div></section>
      <section className="preset-rack" aria-label="Starting presets"><div className="preset-intro"><span>STARTING WEATHER</span><strong>Choose a pulse; let the organism answer.</strong></div><div className="preset-list">{presets.map((preset) => <button key={preset.name} type="button" className={activePreset === preset.name ? 'is-active' : ''} onClick={() => applyPreset(preset)}><span>{preset.name}</span><small><b>{preset.genre}</b> · {preset.detail}</small></button>)}</div></section>
    </div>
    <section className="working-surface" aria-label="Hi Drone instrument deck">
      <section className={`console-panel sequence-console ${surface === 'sequence' ? 'is-focused' : ''} ${openModules.sequence ? '' : 'is-folded'}`} aria-label="Sequence module" onPointerDown={() => setSurface('sequence')}><header className="module-rail"><span>02</span><strong>SEQUENCE</strong><small>melodic current</small><button type="button" aria-expanded={openModules.sequence} onClick={() => setOpenModules((previous) => ({ ...previous, sequence: !previous.sequence }))}>{openModules.sequence ? 'FOLD −' : 'OPEN +'}</button></header>{openModules.sequence && <div className="sequence-surface">
        <div className="surface-heading"><div><span>MELODIC CURRENT</span><h2>Four paths through one scale</h2></div><p>Build a pulse, choose its notes, then let four cycles develop the phrase.</p></div>
        <section className="transport-deck" aria-label="Sequencer transport">
          <button className={`transport-button ${sequencerPlaying ? 'is-playing' : ''}`} type="button" onClick={toggleSequencer}><span aria-hidden="true">{sequencerPlaying ? '■' : '▶'}</span>{sequencerPlaying ? 'PAUSE CURRENT' : 'START CURRENT'}</button>
          <div className="transport-readout"><span>PHRASE CYCLE</span><strong>{sequenceCycle} / 4</strong><small>{sequenceStep >= 0 ? `step ${sequenceStep + 1}` : 'waiting'}</small></div>
          <label className="sequence-control"><span>TEMPO <output>{bpm} BPM</output></span><input aria-label="Tempo" type="range" min="50" max="180" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /></label>
          <label className="sequence-control"><span>SWING <output>{swing}%</output></span><input aria-label="Swing" type="range" min="50" max="72" value={swing} onChange={(event) => setSwing(Number(event.target.value))} /></label>
          <label className="sequence-select"><span>ROOT</span><select aria-label="Root note" value={root} onChange={(event) => setRoot(Number(event.target.value))}>{rootNames.map((name, index) => <option value={index} key={name}>{name}</option>)}</select></label>
          <label className="sequence-select"><span>SCALE</span><select aria-label="Musical scale" value={scale} onChange={(event) => setScale(event.target.value as ScaleName)}>{(Object.keys(scales) as ScaleName[]).map((name) => <option value={name} key={name}>{scales[name].label}</option>)}</select></label>
          <button className="evolve-button" type="button" onClick={evolveSequence}><span>↻</span> EVOLVE PHRASE<small>controlled variation {evolveCount}</small></button>
        </section>
        <section className="sequencer-board" aria-label="Four track step sequencer">
          <div className="beat-ruler" aria-hidden="true"><span /><div>{Array.from({ length: 16 }, (_, index) => <i className={index % 4 === 0 ? 'bar-start' : ''} key={index}>{index + 1}</i>)}</div></div>
          {sequenceTracks.map((track) => <article className={`sequence-lane lane-${track.colour} ${selectedTrack === track.id ? 'is-selected' : ''} ${track.muted ? 'is-muted' : ''}`} key={track.id}>
            <div className="lane-identity"><button className="lane-select" type="button" onClick={() => { setSelectedTrack(track.id); setSelectedSequenceStep(Math.min(selectedSequenceStep, track.length - 1)); }}><i aria-hidden="true" /><span><strong>{track.name}</strong><small>{voices[track.voice].name} · {track.pulses}/{track.length}</small></span></button><button className="lane-mute" type="button" aria-pressed={track.muted} onClick={() => toggleTrackMute(track.id)}>{track.muted ? 'MUTED' : 'MUTE'}</button></div>
            <div className="step-grid">{track.steps.map((step, index) => <button key={index} type="button" disabled={index >= track.length} className={`sequence-cell ${step.active ? 'is-active' : ''} ${step.accent ? 'is-accented' : ''} ${selectedTrack === track.id && selectedSequenceStep === index ? 'is-selected' : ''} ${sequencerPlaying && sequenceStep % track.length === index ? 'is-current' : ''}`} aria-label={`${track.name} step ${index + 1}, ${step.active ? midiToLabel(sequenceStepMidi(track, step, root, scale)) : 'off'}`} onClick={() => toggleSequenceStep(track.id, index)}><span>{index + 1}</span><strong>{step.active ? midiToLabel(sequenceStepMidi(track, step, root, scale)) : '·'}</strong><i aria-hidden="true" /></button>)}</div>
          </article>)}
        </section>
        <section className="sequence-editors">
          <div className="track-sculptor"><div className="editor-heading"><span>TRACK SHAPE</span><strong>{selectedTrackData.name}</strong><button type="button" onClick={() => reseedTrack(selectedTrackData.id)}>RESEED NOTES</button></div><div className="track-controls">
            <label><span>STEPS <output>{selectedTrackData.length}</output></span><input type="range" min="4" max="16" value={selectedTrackData.length} onChange={(event) => updateTrackStructure(selectedTrackData.id, 'length', Number(event.target.value))} /></label>
            <label><span>PULSES <output>{selectedTrackData.pulses}</output></span><input type="range" min="0" max={selectedTrackData.length} value={selectedTrackData.pulses} onChange={(event) => updateTrackStructure(selectedTrackData.id, 'pulses', Number(event.target.value))} /></label>
            <label><span>ROTATE <output>{selectedTrackData.rotate}</output></span><input type="range" min="0" max={selectedTrackData.length - 1} value={selectedTrackData.rotate} onChange={(event) => updateTrackStructure(selectedTrackData.id, 'rotate', Number(event.target.value))} /></label>
            <label><span>OCTAVE <output>+{selectedTrackData.octave}</output></span><input type="range" min="0" max="2" value={selectedTrackData.octave} onChange={(event) => updateTrackValue(selectedTrackData.id, 'octave', Number(event.target.value))} /></label>
            <label><span>NOTE RANGE <output>{selectedTrackData.range}</output></span><input type="range" min="1" max="8" value={selectedTrackData.range} onChange={(event) => updateTrackValue(selectedTrackData.id, 'range', Number(event.target.value))} /></label>
            <label><span>TRACK CHANCE <output>{selectedTrackData.chance}%</output></span><input type="range" min="0" max="100" value={selectedTrackData.chance} onChange={(event) => updateTrackValue(selectedTrackData.id, 'chance', Number(event.target.value))} /></label>
            <label><span>GATE <output>{selectedTrackData.gate}%</output></span><input type="range" min="10" max="100" value={selectedTrackData.gate} onChange={(event) => updateTrackValue(selectedTrackData.id, 'gate', Number(event.target.value))} /></label>
          </div></div>
          <div className="step-inspector"><div className="editor-heading"><span>STEP {String(selectedSequenceStep + 1).padStart(2, '0')}</span><strong>{midiToLabel(selectedMidi)}</strong><button className={selectedStepData.active ? 'is-on' : ''} type="button" onClick={() => updateSelectedStep({ active: !selectedStepData.active })}>{selectedStepData.active ? 'ACTIVE' : 'OFF'}</button></div><div className="pitch-steppers"><button type="button" aria-label="Lower note" onClick={() => updateSelectedStep({ degree: Math.max(0, selectedStepData.degree - 1) })}>−</button><div><span>SCALE DEGREE</span><strong>{selectedStepData.degree + 1}</strong><small>{rootNames[root]} {selectedScale.label}</small></div><button type="button" aria-label="Raise note" onClick={() => updateSelectedStep({ degree: Math.min(14, selectedStepData.degree + 1) })}>+</button></div><div className="step-detail-controls"><label><span>STEP OCTAVE <output>{selectedStepData.octave > 0 ? `+${selectedStepData.octave}` : selectedStepData.octave}</output></span><input type="range" min="-1" max="1" value={selectedStepData.octave} onChange={(event) => updateSelectedStep({ octave: Number(event.target.value) })} /></label><label><span>STEP CHANCE <output>{selectedStepData.chance}%</output></span><input type="range" min="0" max="100" value={selectedStepData.chance} onChange={(event) => updateSelectedStep({ chance: Number(event.target.value) })} /></label><button className={selectedStepData.accent ? 'is-on' : ''} type="button" onClick={() => updateSelectedStep({ accent: !selectedStepData.accent })}>{selectedStepData.accent ? 'ACCENT ON' : 'ADD ACCENT'}</button></div></div>
        </section>
      </div>}</section>
      <section className={`console-panel licks-console ${surface === 'licks' ? 'is-focused' : ''} ${openModules.licks ? '' : 'is-folded'}`} aria-label="Licks module" onPointerDown={() => setSurface('licks')}><header className="module-rail"><span>03</span><strong>LICKS</strong><small>harmonic vocabulary</small><button type="button" aria-expanded={openModules.licks} onClick={() => setOpenModules((previous) => ({ ...previous, licks: !previous.licks }))}>{openModules.licks ? 'FOLD −' : 'OPEN +'}</button></header>{openModules.licks && <div className="lick-surface">
        <div className="surface-heading"><div><span>JAZZ WEATHER</span><h2>Five ii–V–I licks in G major</h2></div><p>Original educational lines for Am7 · D7 · Gmaj7. Fold one into the drone.</p></div>
        <div className="lick-hero"><div><span>HARMONIC LOOP</span><strong>Am7&nbsp;&nbsp;→&nbsp;&nbsp;D7&nbsp;&nbsp;→&nbsp;&nbsp;Gmaj7</strong><small>112 BPM · 4/4 · eighth-note vocabulary</small></div><button type="button" onClick={() => foldJazzLickIntoDrone(jazzLicks[0])}>FOLD GUIDE TONES INTO DRONE</button></div>
        <div className="lick-grid">{jazzLicks.map((lick, index) => <article className={`lick-card lick-${lick.colour}`} key={lick.name}><div className="lick-card-top"><span>0{index + 1}</span><b>{lick.idea}</b></div><h3>{lick.name}</h3><div className="lick-phrase" aria-label={lick.phrase}>{lick.phrase.split('/').map((bar, barIndex) => <div className="lick-bar" key={`${lick.name}-${barIndex}`}><span>{['Am7', 'D7', 'Gmaj7'][barIndex]}</span><div>{bar.split('·').map((note, noteIndex) => <b key={`${note.trim()}-${noteIndex}`}>{note.trim()}</b>)}</div></div>)}</div><div className="lick-card-bottom"><small>ii &nbsp;→&nbsp; V &nbsp;→&nbsp; I</small><button type="button" onClick={() => foldJazzLickIntoDrone(lick)}>FOLD INTO DRONE <span aria-hidden="true">↗</span></button></div></article>)}</div>
        <div className="lick-note"><span>LISTENING NOTE</span><p>The engraved notation and TAB are playing above. In the drone, use the sequencer as the sustained harmonic bed; each card sets the engine to G major and keeps the ii–V–I colour close at hand.</p></div>
      </div>}</section>
      <section className={`console-panel sound-console ${surface === 'sound' ? 'is-focused' : ''} ${openModules.sound ? '' : 'is-folded'}`} aria-label="Sound module" onPointerDown={() => setSurface('sound')}><header className="module-rail"><span>01</span><strong>SOUND</strong><small>drone field</small><button type="button" aria-expanded={openModules.sound} onClick={() => setOpenModules((previous) => ({ ...previous, sound: !previous.sound }))}>{openModules.sound ? 'FOLD −' : 'OPEN +'}</button></header>{openModules.sound && <div className="sound-surface">
        <section className="drone-engine-surface" aria-label="Self-generating drone engine">
          <div className="surface-heading"><div><span>SELF-GENERATING AMBIENT</span><h2>Drone engine / never the same twice</h2></div><p>Prime-timed voices bloom around the existing instrument. Start this layer when the field needs more air.</p></div>
          <div className="drone-visualizer-wrap"><canvas ref={droneCanvasRef} aria-label="Live drone spectrum visualizer" /><div className="drone-viz-label">SPECTRUM / INCOMMENSURABLE WEATHER</div><div className={`drone-viz-status ${droneRunning && !dronePaused ? 'is-running' : ''}`}><span />{dronePaused ? 'PAUSED' : droneRunning ? 'GENERATING' : 'STANDBY'}</div></div>
          <div className="drone-readout"><span>ACTIVE VOICES <strong>{droneVoiceCount}</strong> / {droneSettings.maxVoices}</span><span>NOTES <strong>{droneNotes.length ? droneNotes.join(' · ') : '—'}</strong></span><span>SEED <strong>{droneSeed || 'AUTO'}</strong></span></div>
          <div className="drone-control-grid">
            <section className="drone-control-panel"><h3>TONE</h3>
              <label><span>BASE PITCH / SEQUENCE ROOT <output>{droneSettings.basePitch} Hz</output></span><input type="range" min="27" max="110" value={droneSettings.basePitch} onChange={(event) => updateDroneSetting('basePitch', Number(event.target.value))} /></label>
              <label><span>DETUNE SPREAD <output>{droneSettings.detuneCents} cents</output></span><input type="range" min="0" max="30" value={droneSettings.detuneCents} onChange={(event) => updateDroneSetting('detuneCents', Number(event.target.value))} /></label>
              <label><span>OSCILLATORS <output>{droneSettings.oscCount}</output></span><input type="range" min="2" max="8" value={droneSettings.oscCount} onChange={(event) => updateDroneSetting('oscCount', Number(event.target.value))} /></label>
              <label><span>NOISE BED <output>{Math.round(droneSettings.noiseAmount * 100)}%</output></span><input type="range" min="0" max="60" value={droneSettings.noiseAmount * 100} onChange={(event) => updateDroneSetting('noiseAmount', Number(event.target.value) / 100)} /></label>
              <div className="drone-button-row"><span>WAVEFORM</span>{(['sine', 'triangle', 'sawtooth'] as OscillatorType[]).map((waveform) => <button key={waveform} className={droneSettings.waveform === waveform ? 'is-active' : ''} type="button" onClick={() => updateDroneSetting('waveform', waveform)}>{waveform === 'sawtooth' ? 'SAW' : waveform === 'triangle' ? 'TRI' : 'SINE'}</button>)}</div>
              <div className="drone-button-row"><span>NOISE COLOUR</span>{(['brown', 'pink', 'white'] as NoiseColor[]).map((color) => <button key={color} className={droneSettings.noiseColor === color ? 'is-active' : ''} type="button" onClick={() => updateDroneSetting('noiseColor', color)}>{color.toUpperCase()}</button>)}</div>
            </section>
            <section className="drone-control-panel"><h3>MODULATION</h3>
              <div className="drone-button-row drone-shape-row"><span>MOTION SHAPE</span>{(['sine', 'random'] as ModulationShape[]).map((shape) => <button key={shape} className={droneSettings.modulationShape === shape ? 'is-active' : ''} type="button" onClick={() => updateDroneSetting('modulationShape', shape)}>{shape.toUpperCase()}</button>)}</div>
              <label><span>FILTER SWEEP SPEED <output>{droneSettings.filterRate.toFixed(3)} Hz</output></span><input type="range" min="0.005" max="0.5" step="0.005" value={droneSettings.filterRate} onChange={(event) => updateDroneSetting('filterRate', Number(event.target.value))} /></label>
              <label><span>FILTER DEPTH / MOVEMENT <output>{Math.round(droneSettings.filterDepth * 100)}%</output></span><input type="range" min="0" max="100" value={droneSettings.filterDepth * 100} onChange={(event) => updateDroneSetting('filterDepth', Number(event.target.value) / 100)} /></label>
              <label><span>PITCH DRIFT <output>{Math.round(droneSettings.pitchDrift * 100)}%</output></span><input type="range" min="0" max="50" value={droneSettings.pitchDrift * 100} onChange={(event) => updateDroneSetting('pitchDrift', Number(event.target.value) / 100)} /></label>
              <label><span>VOLUME SWELL / TENSION <output>{Math.round(droneSettings.volLfoDepth * 100)}%</output></span><input type="range" min="0" max="80" value={droneSettings.volLfoDepth * 100} onChange={(event) => updateDroneSetting('volLfoDepth', Number(event.target.value) / 100)} /></label>
              <label><span>PAN DRIFT <output>{Math.round(droneSettings.panDepth * 100)}%</output></span><input type="range" min="0" max="100" value={droneSettings.panDepth * 100} onChange={(event) => updateDroneSetting('panDepth', Number(event.target.value) / 100)} /></label>
            </section>
            <section className="drone-control-panel"><h3>SPACE</h3>
              <label><span>REVERB / SPACE <output>{Math.round(droneSettings.reverbAmount * 100)}%</output></span><input type="range" min="0" max="100" value={droneSettings.reverbAmount * 100} onChange={(event) => updateDroneSetting('reverbAmount', Number(event.target.value) / 100)} /></label>
              <label><span>DELAY <output>{Math.round(droneSettings.delayAmount * 100)}%</output></span><input type="range" min="0" max="100" value={droneSettings.delayAmount * 100} onChange={(event) => updateDroneSetting('delayAmount', Number(event.target.value) / 100)} /></label>
              <label><span>DELAY TIME <output>{droneSettings.delayTime.toFixed(1)} s</output></span><input type="range" min="0.1" max="3" step="0.1" value={droneSettings.delayTime} onChange={(event) => updateDroneSetting('delayTime', Number(event.target.value))} /></label>
              <label><span>FEEDBACK <output>{Math.round(droneSettings.delayFeedback * 100)}%</output></span><input type="range" min="0" max="85" value={droneSettings.delayFeedback * 100} onChange={(event) => updateDroneSetting('delayFeedback', Number(event.target.value) / 100)} /></label>
              <label><span>CHORUS <output>{Math.round(droneSettings.chorusAmount * 100)}%</output></span><input type="range" min="0" max="100" value={droneSettings.chorusAmount * 100} onChange={(event) => updateDroneSetting('chorusAmount', Number(event.target.value) / 100)} /></label>
              <label><span>DRIVE / DAMAGE <output>{Math.round(droneSettings.driveAmount * 100)}%</output></span><input type="range" min="0" max="55" value={droneSettings.driveAmount * 100} onChange={(event) => updateDroneSetting('driveAmount', Number(event.target.value) / 100)} /></label>
              <label><span>MASTER VOLUME <output>{Math.round(droneSettings.masterVolume * 100)}%</output></span><input type="range" min="0" max="100" value={droneSettings.masterVolume * 100} onChange={(event) => updateDroneSetting('masterVolume', Number(event.target.value) / 100)} /></label>
            </section>
            <section className="drone-control-panel drone-control-panel-full"><h3>SCALE & GENERATION</h3><div className="drone-scale-row">{(Object.keys(droneScales) as DroneScaleName[]).map((name) => <button key={name} className={droneSettings.scale === name ? 'is-active' : ''} type="button" onClick={() => updateDroneSetting('scale', name)}>{droneScales[name].label}</button>)}</div><div className="drone-generation-grid"><label><span>NEW NOTE INTERVAL <output>{droneSettings.genSpeed} s</output></span><input type="range" min="2" max="30" value={droneSettings.genSpeed} onChange={(event) => updateDroneSetting('genSpeed', Number(event.target.value))} /></label><label><span>MAX VOICES / DENSITY <output>{droneSettings.maxVoices}</output></span><input type="range" min="1" max="12" value={droneSettings.maxVoices} onChange={(event) => updateDroneSetting('maxVoices', Number(event.target.value))} /></label></div><div className="drone-engine-actions"><button className="drone-begin-button" type="button" onClick={droneRunning ? toggleDronePause : startDroneEngine}>{droneRunning ? (dronePaused ? 'RESUME GENERATOR' : 'PAUSE GENERATOR') : 'BEGIN DRONE ENGINE'}</button><button type="button" onClick={newDroneSeed}>NEW SEED</button><button className="drone-stop-button" type="button" onClick={() => { stopAllDroneVoices(); setDroneRunning(false); droneRunningRef.current = false; setDronePaused(false); setNotice('drone voices released — the rest of the instrument is still here'); addEvent('drone voices stopped', 'gesture'); }}>STOP ALL</button></div></section>
          </div>
          <p className="drone-engine-note">Web Audio only · multiple detuned oscillators · slow LFOs · procedural reverb · prime-number timing</p>
        </section>
        <div className="surface-heading"><div><span>MANUAL VOICE FIELD</span><h2>Eight voices, one nervous system</h2></div><p>Touch a body. Latch the ones that want to stay. The rest will keep listening.</p></div><div className="voice-grid">{voices.map((voice) => <article className={`voice-module tone-${voice.tone} ${activeVoices.includes(voice.id) ? 'is-active' : ''}`} key={voice.id}><div className="module-index">0{voice.id + 1}</div><button className="voice-pad" type="button" onClick={() => activateVoice(voice.id)}><span className="voice-core" aria-hidden="true" /><strong>{voice.name}</strong><small>{Math.round(voice.base * (0.94 + macros.tension / 100 * 0.12))} Hz · {voice.role}</small></button><label><span>TUNE <output>{Math.round(24 + (voice.base / 262) * 36)}</output></span><input aria-label={`${voice.name} tune`} type="range" min="24" max="76" defaultValue={Math.round(24 + (voice.base / 262) * 36)} /></label><button className={`latch-button ${latchedVoices.includes(voice.id) ? 'is-on' : ''}`} type="button" onClick={() => toggleLatch(voice.id)}><span aria-hidden="true" />{latchedVoices.includes(voice.id) ? 'LATCHED' : 'LATCH'}</button></article>)}</div><div className="surface-heading percussion-heading"><div><span>PULSE FIELD</span><h2>Four percussive bodies</h2></div><p>Every impact changes the shared breath. Hold one open and it becomes a heartbeat.</p></div><div className="percussion-grid">{percussion.map((item) => <article className={`percussion-module ${item.tone}`} key={item.id}><button className="percussion-pad" type="button" onClick={() => triggerPercussion(item.id)}><span aria-hidden="true" /><strong>{item.name}</strong><small>{item.role}</small></button><label><span>DECAY <output>{48 + item.id * 10}</output></span><input aria-label={`${item.name} decay`} type="range" min="5" max="100" defaultValue={48 + item.id * 10} /></label><button className={`hold-button ${heldPercs.includes(item.id) ? 'is-on' : ''}`} type="button" onClick={() => toggleHold(item.id)}>{heldPercs.includes(item.id) ? 'RELEASE DRONE' : 'HOLD AS DRONE'}</button></article>)}</div></div>}</section>
      <section className={`console-panel behaviour-console ${surface === 'behaviour' ? 'is-focused' : ''} ${openModules.behaviour ? '' : 'is-folded'}`} aria-label="Behaviour module" onPointerDown={() => setSurface('behaviour')}><header className="module-rail"><span>04</span><strong>BEHAVIOUR</strong><small>cell autonomy</small><button type="button" aria-expanded={openModules.behaviour} onClick={() => setOpenModules((previous) => ({ ...previous, behaviour: !previous.behaviour }))}>{openModules.behaviour ? 'FOLD −' : 'OPEN +'}</button></header>{openModules.behaviour && <><div className="behaviour-switch"><div><span>CELL AUTONOMY</span><strong>{behaviourRunning ? 'Cells are moving beside the melody' : 'Cells are sleeping'}</strong><small>Keep this off for a clear sequence; wake it when you want organic interference.</small></div><button className={behaviourRunning ? 'is-on' : ''} type="button" onClick={toggleBehaviourNetwork}>{behaviourRunning ? 'LET CELLS SLEEP' : 'WAKE CELLS'}</button></div><div className="behaviour-surface"><div className="surface-heading"><div><span>BEHAVIOUR NETWORK</span><h2>Eight cells with unfinished plans</h2></div><p>Cells drift, wake each other and forget what they meant to do.</p></div><div className="network-field"><div className="network-lines" aria-hidden="true"><i /><i /><i /><i /><i /></div>{cells.map((cell) => <article className={`cell cell-${cell.colour} ${pulse === cell.id ? 'is-pulsing' : ''}`} key={cell.id}><div className="cell-orbit" /><div className="cell-head"><span>0{cell.id + 1}</span><strong>{cell.name}</strong><b>{cell.mode}</b></div><div className="cell-body"><div className="cell-target">{cell.kind === 'voice' ? voices[cell.target]?.name : percussion[cell.target]?.name}</div><div className="cell-stats"><span>{cell.interval}ms</span><span>{cell.probability}% chance</span></div></div><label><span>PROBABILITY <output>{cell.probability}</output></span><input type="range" min="0" max="100" value={cell.probability} onChange={(event) => setCells((previous) => previous.map((entry) => entry.id === cell.id ? { ...entry, probability: Number(event.target.value) } : entry))} /></label><select aria-label={`${cell.name} mode`} value={cell.mode} onChange={(event) => setCells((previous) => previous.map((entry) => entry.id === cell.id ? { ...entry, mode: event.target.value as CellMode } : entry))}>{modes.map((mode) => <option key={mode}>{mode}</option>)}</select></article>)}</div></div></>}</section>
      <section className={`console-panel patch-console ${surface === 'patch' ? 'is-focused' : ''} ${openModules.patch ? '' : 'is-folded'}`} aria-label="Patch module" onPointerDown={() => setSurface('patch')}><header className="module-rail"><span>05</span><strong>PATCH</strong><small>signal metabolism</small><button type="button" aria-expanded={openModules.patch} onClick={() => setOpenModules((previous) => ({ ...previous, patch: !previous.patch }))}>{openModules.patch ? 'FOLD −' : 'OPEN +'}</button></header>{openModules.patch && <div className="patch-surface"><div className="surface-heading"><div><span>PATCH WEATHER</span><h2>Everything can feed everything</h2></div><p>Choose a source and destination, then let the organism metabolise the connection.</p></div><div className="patch-grid"><div className="patch-column"><span className="column-label">SOURCES</span>{['Breath A', 'Breath B', 'Uncertainty', 'Feedback weather'].map((source) => <button className={`patch-node source ${patchSource === source ? 'is-selected' : ''}`} key={source} type="button" onClick={() => { setPatchSource(source); setNotice(`${source} is ready to feed ${patchTarget}`); }}><i />{source}<small>signal</small></button>)}</div><div className="patch-visual"><div className="signal signal-one" /><div className="signal signal-two" /><div className="signal signal-three" /><button className="patch-connect" type="button" onClick={connectPatch}>CONNECT<div>{patchSource} → {patchTarget}</div></button></div><div className="patch-column"><span className="column-label">TARGETS</span>{['Voice pairs', 'Filter', 'Delay', 'Drive'].map((target) => <button className={`patch-node target ${patchTarget === target ? 'is-selected' : ''}`} key={target} type="button" onClick={() => { setPatchTarget(target); setNotice(`${patchSource} is ready to feed ${target}`); }}><i />{target}<small>destination</small></button>)}</div></div><div className="cable-list">{patches.map((patch) => <article className="cable" key={patch.id}><span className="cable-dot" /><strong>{patch.source}</strong><span className="cable-arrow">→</span><strong>{patch.target}</strong><label><span>AMOUNT <output>{patch.amount}</output></span><input type="range" min="-100" max="100" value={patch.amount} onChange={(event) => setPatches((previous) => previous.map((entry) => entry.id === patch.id ? { ...entry, amount: Number(event.target.value) } : entry))} /></label><button type="button" onClick={() => setPatches((previous) => previous.filter((entry) => entry.id !== patch.id))}>REMOVE</button></article>)}</div></div>}</section>
    </section>
    <section className="telemetry-rack"><div className="telemetry-label"><span>FIELD TELEMETRY</span><strong>{notice}</strong></div><div className="meter" aria-label={`audio activity ${meter}%`}><span style={{ width: `${meter}%` }} /></div><div className="shortcut-hint">P sequence · SPACE power · 1–8 voices · Q W E T surfaces · R capture</div></section>
    <section className="timeline-rack"><div className="timeline-heading"><span>EVENT WEATHER</span><strong>{timeline.length ? `${timeline.length} gestures in memory` : 'waiting for a first disturbance'}</strong></div><div className="timeline-track">{timeline.map((event, index) => <div className={`timeline-event ${event.kind}`} key={`${event.at}-${index}`} style={{ left: `${Math.min(96, (index / Math.max(1, timeline.length - 1)) * 92 + 2)}%` }} title={event.label}><i /><span>{event.label}</span></div>)}</div></section>
    <footer className={`capture-rack ${captureState === 'recording' ? 'is-recording' : ''}`}><div className="capture-status"><div className="capture-light" aria-hidden="true" /><div><span>{captureState === 'recording' ? 'CAPTURING PERFORMANCE' : captureState === 'held' ? 'PERFORMANCE HELD' : 'CAPTURE READY'}</span><strong>{captureState === 'recording' ? formatSeconds(captureSeconds) : take ? formatSeconds(captureSeconds) : '00:00'}</strong></div><small>{captureState === 'recording' ? `${events.length} gestures` : 'Audio + gesture memory stays local.'} <a href="https://polyhaven.com/a/moon_02" target="_blank" rel="noreferrer">Moon 02 / Poly Haven · CC0</a></small></div><div className="capture-actions">{captureState === 'recording' ? <button className="stop-button" type="button" onClick={stopCapture}>■ STOP</button> : <><button className="record-button" type="button" onClick={startCapture}><span aria-hidden="true" />CAPTURE</button><button className="save-moment" type="button" onClick={saveLastMoment}>SAVE LAST MOMENT</button></>}{take && <><button type="button" onClick={() => downloadTake('webm')}>AUDIO</button><button type="button" onClick={() => downloadTake('webm')}>EXPORT</button></>}</div></footer>
  </main>;
}
