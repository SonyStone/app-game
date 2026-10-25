import { describe, expect, it } from 'vitest';
import { loadPace, PACE_DEFAULTS, PACE_KNOBS, savePace } from './pace';

describe('the pace', () => {
  it('keeps only the knobs that differ from the defaults, and reads them back over the defaults', () => {
    const storage = createStorage();

    savePace({ ...PACE_DEFAULTS, shellSpeed: 0.65, lead: 0.3 }, storage);

    expect(JSON.parse(storage.items.get('tanki.koth.pace')!)).toEqual({ shellSpeed: 0.65, lead: 0.3 });
    expect(loadPace(storage)).toEqual({ ...PACE_DEFAULTS, shellSpeed: 0.65, lead: 0.3 });

    savePace({ ...PACE_DEFAULTS }, storage);

    expect(storage.items.has('tanki.koth.pace')).toBe(false);
  });

  it('takes the default for a knob kept out of range, of the wrong kind, or not kept at all', () => {
    const storage = createStorage();
    storage.items.set('tanki.koth.pace', JSON.stringify({ speed: 9, damage: 'lots', botReaction: 2.5 }));

    expect(loadPace(storage)).toEqual({ ...PACE_DEFAULTS, botReaction: 2.5 });

    storage.items.set('tanki.koth.pace', '{not json');

    expect(loadPace(storage)).toEqual(PACE_DEFAULTS);
    expect(loadPace(undefined)).toEqual(PACE_DEFAULTS);
  });

  it('has defaults within the panel’s ranges, on the sliders’ steps', () => {
    for (const knob of PACE_KNOBS) {
      const value = PACE_DEFAULTS[knob.key];
      expect(value).toBeGreaterThanOrEqual(knob.min);
      expect(value).toBeLessThanOrEqual(knob.max);
      expect(Math.abs((value - knob.min) / knob.step - Math.round((value - knob.min) / knob.step))).toBeLessThan(1e-6);
    }

    expect(PACE_KNOBS.map((knob) => knob.key).sort()).toEqual(Object.keys(PACE_DEFAULTS).sort());
  });
});

/** A storage in memory, as `localStorage` behaves. */
function createStorage() {
  const items = new Map<string, string>();

  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key)
  };
}
