import { describe, expect, it } from 'vitest';
import {
  harnessTuning,
  loadClassTuning,
  readTuning,
  saveClassTuning,
  TUNING_VERSION,
  tuningLink,
  writeTuning,
  type Tuning
} from './tuning';

describe('tuning', () => {
  const tuning: Tuning = {
    version: TUNING_VERSION,
    pace: { damage: 1, botSight: 600 },
    classes: { soldier: { interval: 0.4 }, sniper: { chargeTime: 1.5 } }
  };

  it('reads back what it writes, as JSON, as a link and as a link’s code', () => {
    const link = tuningLink(tuning, 'http://localhost:3190/koth?lang=ru&tuning=old');
    const code = new URL(link).searchParams.get('tuning')!;

    // The page as it stands, its language included, with the tuning in place of an older one.
    expect(link.startsWith('http://localhost:3190/koth?lang=ru&tuning=')).toBe(true);
    expect(code).not.toBe('old');
    // base64url keeps the code whole in an address.
    expect(code).toMatch(/^[\w-]+$/);
    expect(readTuning(writeTuning(tuning))).toEqual({ tuning, dropped: [] });
    expect(readTuning(link)).toEqual({ tuning, dropped: [] });
    expect(readTuning(`  ${code}\n`)).toEqual({ tuning, dropped: [] });
    expect(readTuning(`/tanki/koth?lang=ru&tuning=${code}&tune`)).toEqual({ tuning, dropped: [] });
  });

  it('leaves out what it does not know or what is out of range, and names it', () => {
    const read = readTuning(
      JSON.stringify({
        version: 1,
        pace: { damage: 1, zoom: 99, wind: 3 },
        classes: { soldier: { interval: 0.4, interval2: 1 }, medic: {} },
        comment: 'try faster rockets'
      })
    );

    expect(read).toEqual({
      tuning: { version: 1, pace: { damage: 1 }, classes: { soldier: { interval: 0.4 } } },
      dropped: ['comment', 'pace.zoom', 'pace.wind', 'soldier.interval2', 'medic']
    });
    expect(readTuning('{"version":1,"pace":7}')).toEqual({
      tuning: { version: 1, pace: {}, classes: {} },
      dropped: ['pace']
    });
  });

  it('reads no tuning from text without one or from another version', () => {
    expect(readTuning('')).toEqual({ error: 'unreadable' });
    expect(readTuning('hello there')).toEqual({ error: 'unreadable' });
    expect(readTuning('{"pace": {}')).toEqual({ error: 'unreadable' });
    expect(readTuning('[1]')).toEqual({ error: 'unreadable' });
    expect(readTuning('{"pace": {"damage": 1}}')).toEqual({ error: 'version' });
    expect(readTuning('{"version": 2, "pace": {}}')).toEqual({ error: 'version' });
  });

  it('runs a harness with the defaults without a tuning and refuses one it cannot read', () => {
    expect(harnessTuning(undefined)).toEqual({ tuning: { version: 1, pace: {}, classes: {} }, dropped: [] });
    expect(harnessTuning(writeTuning(tuning)).tuning).toEqual(tuning);
    expect(() => harnessTuning('{"version": 7}')).toThrow(/version/);
  });

  it('keeps only the changes to the classes, with the version, and reads back only valid ones', () => {
    const storage = memoryStorage();

    saveClassTuning({ soldier: { interval: 0.4 } }, storage);

    expect(JSON.parse(storage.items.get('tanki.koth.classes')!)).toEqual({
      version: 1,
      classes: { soldier: { interval: 0.4 } }
    });
    expect(loadClassTuning(storage)).toEqual({ soldier: { interval: 0.4 } });

    saveClassTuning({}, storage);

    expect(storage.items.has('tanki.koth.classes')).toBe(false);
    expect(loadClassTuning(storage)).toEqual({});

    storage.setItem(
      'tanki.koth.classes',
      JSON.stringify({ version: 1, classes: { soldier: { interval: 99, speed: 300 }, ghost: { speed: 1 } } })
    );

    expect(loadClassTuning(storage)).toEqual({ soldier: { speed: 300 } });

    storage.setItem('tanki.koth.classes', JSON.stringify({ version: 0, classes: { soldier: { speed: 300 } } }));

    expect(loadClassTuning(storage)).toEqual({});

    storage.setItem('tanki.koth.classes', '{broken');

    expect(loadClassTuning(storage)).toEqual({});
    expect(loadClassTuning(undefined)).toEqual({});
  });
});

/** A `Storage` in memory, with its items to look at. */
function memoryStorage() {
  const items = new Map<string, string>();

  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key)
  };
}
