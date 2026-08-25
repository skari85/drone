export type MelodyMode = 'hypnotic' | 'emotional' | 'arpeggio' | 'callResponse';
export type MelodyContour = 'rise' | 'fall' | 'arch' | 'wave';
export type MelodyProgression = 'static' | 'deep' | 'classic' | 'rising';
export type MelodyRole = 'lead' | 'answer';
export type MelodyStage = 'motif' | 'answer' | 'variation' | 'resolution';

export type ComposerSettings = {
  mode: MelodyMode;
  phraseBars: 4 | 8 | 16;
  complexity: number;
  repetition: number;
  variation: number;
  range: number;
  contour: MelodyContour;
  progression: MelodyProgression;
  noteLength: number;
};

export type MelodyNote = {
  degree: number;
  velocity: number;
  gate: number;
  accent: boolean;
  role: MelodyRole;
};

export type MelodyBar = {
  stage: MelodyStage;
  chordRoot: number;
  chordLabel: string;
  steps: Array<MelodyNote | null>;
};

export type MelodyComposition = {
  seed: number;
  motif: Array<MelodyNote | null>;
  bars: MelodyBar[];
};

export type ComposeMelodyInput = {
  seed: number;
  scaleLength: number;
  settings: ComposerSettings;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const romanDegrees = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const progressionRoots: Record<MelodyProgression, number[]> = {
  static: [0, 0, 0, 0],
  deep: [0, 5, 3, 6],
  classic: [0, 3, 5, 4],
  rising: [0, 1, 3, 4],
};

const createRandom = (initialSeed: number) => {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
};

const distributeSteps = (count: number, steps = 16, rotation = 0) => {
  const pulses = clamp(Math.round(count), 0, steps);
  return Array.from({ length: steps }, (_, step) => step).filter((step) => (((step - rotation + steps) % steps) * pulses) % steps < pulses);
};

const stageForBar = (bar: number, barCount: number): MelodyStage => {
  const progress = bar / barCount;
  if (progress < 0.25) return 'motif';
  if (progress < 0.5) return 'answer';
  if (progress < 0.75) return 'variation';
  return 'resolution';
};

const contourDegree = (index: number, count: number, contour: MelodyContour, random: () => number) => {
  const progress = count <= 1 ? 0 : index / (count - 1);
  const jitter = random() < 0.42 ? (random() < 0.5 ? -1 : 1) : 0;
  if (contour === 'rise') return Math.round(progress * 4) + jitter;
  if (contour === 'fall') return Math.round((1 - progress) * 4) + jitter;
  if (contour === 'arch') return Math.round((1 - Math.abs(progress * 2 - 1)) * 5) + jitter;
  return Math.round((Math.sin(progress * Math.PI * 2) + 1) * 2) + jitter;
};

const cloneNote = (note: MelodyNote | null) => note ? { ...note } : null;

const buildMotif = (scaleLength: number, settings: ComposerSettings, random: () => number) => {
  const modeBias = settings.mode === 'hypnotic' ? -1 : settings.mode === 'arpeggio' ? 2 : 0;
  const noteCount = clamp(Math.round(3 + settings.complexity / 18 + modeBias), 3, 10);
  const rotation = settings.mode === 'callResponse' ? 0 : Math.floor(random() * 4);
  const positions = distributeSteps(noteCount, 16, rotation);
  const motif: Array<MelodyNote | null> = Array(16).fill(null);
  const maximumDegree = Math.max(1, scaleLength * clamp(Math.round(settings.range), 1, 3) - 1);
  positions.forEach((step, index) => {
    let degree: number;
    if (settings.mode === 'arpeggio') degree = [0, 2, 4, 7, 4, 2][index % 6];
    else degree = contourDegree(index, positions.length, settings.contour, random);
    if (settings.mode === 'hypnotic') degree = Math.round(degree * 0.55);
    const accent = index === 0 || (settings.mode === 'arpeggio' && index % 3 === 0);
    motif[step] = {
      degree: clamp(degree, 0, maximumDegree),
      velocity: clamp(0.54 + random() * 0.24 + (accent ? 0.12 : 0), 0.35, 1),
      gate: clamp(0.38 + settings.noteLength / 100 * 2.8 + random() * 0.18, 0.3, 3.4),
      accent,
      role: 'lead',
    };
  });
  return motif;
};

const transformBar = (
  motif: Array<MelodyNote | null>,
  bar: number,
  barCount: number,
  chordRoot: number,
  scaleLength: number,
  settings: ComposerSettings,
  random: () => number,
) => {
  const stage = stageForBar(bar, barCount);
  const steps: Array<MelodyNote | null> = motif.map(cloneNote);
  const repetition = settings.repetition / 100;
  const variation = settings.variation / 100;
  const maximumDegree = Math.max(1, scaleLength * clamp(Math.round(settings.range), 1, 3) - 1);

  steps.forEach((note, step) => {
    if (!note) return;
    note.degree = clamp(note.degree + chordRoot, 0, maximumDegree);
    if (stage === 'answer') {
      note.role = 'answer';
      const answerShift = settings.mode === 'callResponse' ? 2 : 1;
      note.degree = clamp(note.degree + answerShift, 0, maximumDegree);
      note.velocity *= 0.9;
    }
    if (stage === 'variation' && random() > repetition) {
      note.degree = clamp(note.degree + (random() < 0.5 ? -1 : 1) * Math.max(1, Math.round(variation * 3)), 0, maximumDegree);
      note.velocity = clamp(note.velocity + (random() - 0.5) * 0.16, 0.35, 1);
    }
    if (stage === 'resolution') {
      note.degree = step < 8 ? clamp(note.degree, 0, scaleLength - 1) : clamp(Math.round(note.degree * (1 - variation * 0.4)), 0, scaleLength - 1);
      note.velocity *= step < 8 ? 0.94 : 0.82;
    }
  });

  if (settings.mode === 'callResponse' && (stage === 'answer' || (stage === 'resolution' && bar % 2 === 0))) {
    const shifted = Array<MelodyNote | null>(16).fill(null);
    steps.forEach((note, step) => {
      if (!note) return;
      const target = (step + 2) % 16;
      shifted[target] = { ...note, role: 'answer', velocity: note.velocity * 0.88 };
    });
    return shifted;
  }

  if (settings.mode === 'arpeggio' && bar % 2 === 1) {
    return steps.map((note, step) => note ? { ...note, degree: clamp(note.degree + (step >= 8 ? scaleLength : 0), 0, maximumDegree) } : null);
  }
  return steps;
};

export const composeMelody = ({ seed, scaleLength, settings }: ComposeMelodyInput): MelodyComposition => {
  const safeScaleLength = Math.max(1, Math.round(scaleLength));
  const random = createRandom(seed);
  const motif = buildMotif(safeScaleLength, settings, random);
  const progression = progressionRoots[settings.progression];
  const bars = Array.from({ length: settings.phraseBars }, (_, bar) => {
    const stage = stageForBar(bar, settings.phraseBars);
    const section = Math.min(3, Math.floor(bar / settings.phraseBars * 4));
    const chordRoot = progression[section] % safeScaleLength;
    const steps = transformBar(motif, bar, settings.phraseBars, chordRoot, safeScaleLength, settings, random);
    if (stage === 'resolution') {
      const finalBar = bar === settings.phraseBars - 1;
      if (finalBar) {
        const finalStep = steps.reduce((latest, note, step) => note ? step : latest, 0);
        steps[finalStep] = { degree: 0, velocity: 0.64, gate: Math.max(1.8, settings.noteLength / 32), accent: true, role: 'lead' };
      }
    }
    return { stage, chordRoot, chordLabel: romanDegrees[chordRoot] ?? `${chordRoot + 1}`, steps };
  });
  return { seed, motif, bars };
};

export const mutateComposition = (composition: MelodyComposition, input: ComposeMelodyInput): MelodyComposition => {
  const random = createRandom(input.seed);
  const mutationChance = clamp(input.settings.variation / 100 * 0.34, 0.02, 0.34);
  const scaleLength = Math.max(1, input.scaleLength);
  const maximumDegree = Math.max(1, scaleLength * clamp(Math.round(input.settings.range), 1, 3) - 1);
  const bars = composition.bars.map((bar, barIndex) => ({
    ...bar,
    steps: bar.steps.map((note, step) => {
      if (!note || note.accent || (barIndex === composition.bars.length - 1 && step >= 8) || random() > mutationChance) return cloneNote(note);
      return {
        ...note,
        degree: clamp(note.degree + (random() < 0.5 ? -1 : 1), 0, maximumDegree),
        velocity: clamp(note.velocity + (random() - 0.5) * 0.12, 0.35, 1),
      };
    }),
  }));
  return { seed: input.seed, motif: composition.motif.map(cloneNote), bars };
};
