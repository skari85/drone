import { describe, expect, it } from 'vitest';
import { composeMelody, mutateComposition } from './melodic-engine';
import type { ComposerSettings } from './melodic-engine';

const settings: ComposerSettings = {
  mode: 'hypnotic',
  phraseBars: 8,
  complexity: 46,
  repetition: 76,
  variation: 32,
  range: 2,
  contour: 'arch',
  progression: 'deep',
  noteLength: 48,
};

describe('melodic composer', () => {
  it('is deterministic for the same seed and settings', () => {
    const first = composeMelody({ seed: 4242, scaleLength: 7, settings });
    const second = composeMelody({ seed: 4242, scaleLength: 7, settings });
    expect(second).toEqual(first);
  });

  it('builds the requested phrase structure and resolves to the tonic', () => {
    const composition = composeMelody({ seed: 17, scaleLength: 7, settings });
    expect(composition.bars).toHaveLength(8);
    expect(composition.bars.map((bar) => bar.stage)).toEqual(['motif', 'motif', 'answer', 'answer', 'variation', 'variation', 'resolution', 'resolution']);
    const finalNotes = composition.bars.at(-1)?.steps.filter((note) => note !== null) ?? [];
    expect(finalNotes.at(-1)?.degree).toBe(0);
  });

  it('keeps every scale degree inside the configured octave range', () => {
    const composition = composeMelody({ seed: 991, scaleLength: 5, settings: { ...settings, mode: 'arpeggio', range: 2 } });
    const notes = composition.bars.flatMap((bar) => bar.steps).filter((note) => note !== null);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((note) => note.degree >= 0 && note.degree < 10)).toBe(true);
  });

  it('mutates detail while preserving accented anchors and the cadence', () => {
    const composition = composeMelody({ seed: 31, scaleLength: 7, settings });
    const mutated = mutateComposition(composition, { seed: 555, scaleLength: 7, settings: { ...settings, variation: 100 } });
    composition.bars.forEach((bar, barIndex) => bar.steps.forEach((note, step) => {
      if (note?.accent || (barIndex === composition.bars.length - 1 && step >= 8)) expect(mutated.bars[barIndex].steps[step]).toEqual(note);
    }));
  });

  it.each(['hypnotic', 'emotional', 'arpeggio', 'callResponse'] as const)('produces playable notes in %s mode', (mode) => {
    const composition = composeMelody({ seed: 88, scaleLength: 7, settings: { ...settings, mode } });
    expect(composition.bars.some((bar) => bar.steps.some(Boolean))).toBe(true);
  });
});
