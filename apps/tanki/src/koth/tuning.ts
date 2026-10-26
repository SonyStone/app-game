import { createEffect, createSignal, onCleanup } from 'solid-js';
import { applyClassTuning, cleanClassTuning, withKnob, type ClassKnob, type ClassTuning } from './classes/knobs';
import { cleanPace, loadPace, PACE_DEFAULTS, paceChanges, savePace, type Pace } from './pace';
import type { TankClassId } from './tanks';

/**
 * The game's tuning as the player sets it in the pause menu: the pace (see `Pace`) and the
 * changes to the classes (see `CLASS_KNOBS`), both kept in local storage for the next visit as
 * their differences from the defaults. The classes' changes are applied to `TANK_CLASSES` and
 * `TACTICS` as they change, and taken back when the owner is disposed, so other pages see the
 * classes as written.
 *
 * `?tuning=` in the address, a tuning's code from `tuningLink`, replaces the kept tuning and is
 * kept in its stead; the address then drops it, so a reload keeps later changes.
 *
 * Call under an owner, in the browser.
 */
export function createTuning() {
  const shared = new URLSearchParams(window.location.search).get('tuning');
  const linked = shared === null ? undefined : readTuning(shared);
  const start = linked && 'tuning' in linked ? linked.tuning : undefined;
  const startClasses = start ? start.classes : loadClassTuning();
  const [pace, setPace] = createSignal<Pace>(start ? { ...PACE_DEFAULTS, ...start.pace } : loadPace());
  const [classes, setClasses] = createSignal<ClassTuning>(startClasses);

  if (shared !== null) {
    forgetAddressTuning();
  }

  if (linked && 'error' in linked) {
    console.warn(`The tuning in the address could not be read (${linked.error}); the kept one stays.`);
  }

  // The first match is built before the effect below first runs.
  applyClassTuning(startClasses);

  createEffect(
    () => pace(),
    (next) => savePace(next)
  );
  createEffect(
    () => classes(),
    (next) => {
      applyClassTuning(next);
      saveClassTuning(next);
    }
  );
  onCleanup(() => applyClassTuning({}));

  return {
    /** The pace now. */
    pace,

    /** The changes to the classes now. */
    classes,

    /** Replaces the pace. */
    setPace,

    /** Sets `knob` of class `id` to `value`; its default takes the change out. */
    setKnob(id: TankClassId, knob: ClassKnob, value: number) {
      setClasses((current) => withKnob(current, id, knob, value));
    },

    /** Puts every knob of class `id` back to its default. */
    resetClass(id: TankClassId) {
      setClasses((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    },

    /** Puts every knob of every class back to its default; the pace stays. */
    resetClasses() {
      setClasses({});
    },

    /** The tuning now, as `writeTuning` writes it. */
    exportText() {
      return writeTuning(current());
    },

    /** A link to this page that opens with the tuning now (see `tuningLink`). */
    link() {
      return tuningLink(current(), window.location.href);
    },

    /**
     * Reads `text` as `readTuning` does and, if it is a tuning, makes it the tuning now: the pace
     * and the classes it leaves out go back to their defaults. Returns what `readTuning` read.
     */
    importText(text: string) {
      const read = readTuning(text);

      if ('tuning' in read) {
        setPace({ ...PACE_DEFAULTS, ...read.tuning.pace });
        setClasses(read.tuning.classes);
      }

      return read;
    }
  };

  function current(): Tuning {
    return { version: TUNING_VERSION, pace: paceChanges(pace()), classes: classes() };
  }
}

/** The tuning of a route as returned by `createTuning`. */
export type TuningControls = ReturnType<typeof createTuning>;

/**
 * A tuning, as one JSON object: the format's `version`, the pace knobs that differ from the
 * defaults (see `PACE_KNOBS`) and the class knobs that do (see `CLASS_KNOBS`), as
 * `{ "version": 1, "pace": { "damage": 1 }, "classes": { "soldier": { "interval": 0.4 } } }`.
 * The pause menu exports and imports it, a link carries it, and the balance and pace harnesses
 * run with it from `TANKI_TUNING` (see `harnessTuning`).
 */
export type Tuning = { version: typeof TUNING_VERSION; pace: Partial<Pace>; classes: ClassTuning };

/** Version of the `Tuning` format; a tuning of another version is not read. */
export const TUNING_VERSION = 1;

/** `tuning` as indented JSON, for a person or an agent to read. */
export function writeTuning(tuning: Tuning) {
  return JSON.stringify(tuning, null, 2);
}

/**
 * The tuning in `text`: its JSON, a link from `tuningLink` or the link's code alone. Knobs of
 * unknown names or classes, numbers out of range and keys the format does not have are left out
 * and named in `dropped`, as `pace.zoom` or `soldier.speed`. An error tells why `text` holds no
 * tuning: `unreadable` for no JSON object, `version` for one of another version or none.
 */
export function readTuning(text: string): { tuning: Tuning; dropped: string[] } | { error: 'unreadable' | 'version' } {
  const value = parseTuningText(text.trim());

  if (!isRecord(value)) {
    return { error: 'unreadable' };
  }

  if (value.version !== TUNING_VERSION) {
    return { error: 'version' };
  }

  const pace = cleanPace(value.pace);
  const classes = cleanClassTuning(value.classes);
  const unknown = Object.keys(value).filter((key) => !TUNING_KEYS.includes(key));
  const paceDropped = isRecord(value.pace ?? {}) ? pace.dropped.map((key) => `pace.${key}`) : ['pace'];

  return {
    tuning: { version: TUNING_VERSION, pace: pace.changes, classes: classes.tuning },
    dropped: [...unknown, ...paceDropped, ...classes.dropped]
  };
}

/**
 * The address `href` with `tuning` in it as `?tuning=`, its JSON in base64url, which keeps it
 * whole in an address: a link that opens the page as it stands, in its language, with the tuning.
 */
export function tuningLink(tuning: Tuning, href: string) {
  const url = new URL(href);
  url.searchParams.set('tuning', encodeBase64Url(JSON.stringify(tuning)));
  return url.href;
}

/**
 * The tuning a harness runs with, from `TANKI_TUNING`: a tuning's JSON, which the vitest config
 * reads from the file the variable names, a link or a link's code; without it the defaults.
 * Throws on a tuning it cannot read, so a run never measures the defaults by mistake.
 */
export function harnessTuning(text: string | undefined): { tuning: Tuning; dropped: string[] } {
  if (!text) {
    return { tuning: { version: TUNING_VERSION, pace: {}, classes: {} }, dropped: [] };
  }

  const read = readTuning(text);

  if ('error' in read) {
    throw new Error(`TANKI_TUNING holds no tuning (${read.error})`);
  }

  return read;
}

/**
 * The changes to the classes kept in `storage` from the last session, as `cleanClassTuning`
 * reads them; none for a kept tuning of another version, or without storage, as in tests.
 */
export function loadClassTuning(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): ClassTuning {
  try {
    const kept: unknown = JSON.parse(storage?.getItem(CLASSES_KEY) ?? 'null');
    return isRecord(kept) && kept.version === TUNING_VERSION ? cleanClassTuning(kept.classes).tuning : {};
  } catch {
    return {};
  }
}

/** Keeps the changes to the classes in `storage` for the next session, with the format's version; none removes the entry. */
export function saveClassTuning(
  classes: ClassTuning,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage
) {
  try {
    if (Object.keys(classes).length > 0) {
      storage?.setItem(CLASSES_KEY, JSON.stringify({ version: TUNING_VERSION, classes }));
    } else {
      storage?.removeItem(CLASSES_KEY);
    }
  } catch {
    // A full or blocked storage only loses the changes for the next session.
  }
}

/** Key of the changes to the classes in local storage. */
const CLASSES_KEY = 'tanki.koth.classes';

/** The keys of a `Tuning`. */
const TUNING_KEYS = ['version', 'pace', 'classes'];

/** The JSON value in `text`, a link with `?tuning=` or a link's code alone; `undefined` if none. */
function parseTuningText(text: string): unknown {
  const code = text.startsWith('{') ? undefined : (/[?&]tuning=([^&#\s]*)/.exec(text)?.[1] ?? text);

  try {
    return JSON.parse(code === undefined ? text : decodeBase64Url(code));
  } catch {
    return undefined;
  }
}

/** `text`, of ASCII characters as a tuning's JSON is, in base64url without padding. */
function encodeBase64Url(text: string) {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The text of base64url `code`; throws on a code that is not base64url. */
function decodeBase64Url(code: string) {
  return atob(code.replace(/-/g, '+').replace(/_/g, '/'));
}

/** Takes `?tuning=` out of the address without a new history entry, so a reload does not apply it again. */
function forgetAddressTuning() {
  const url = new URL(window.location.href);
  url.searchParams.delete('tuning');
  history.replaceState(history.state, '', url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
