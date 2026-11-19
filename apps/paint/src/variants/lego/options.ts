import { createSignal } from 'solid-js';
import { defaultCell } from './grid';

/**
 * LEGO's options on this device, as the Options sheet sets them: for now the grid's cell edge in CSS pixels, absent
 * while the user has not chosen one. Kept per device in `localStorage` under `optionsKey`, never in the board.
 */
export type LegoOptions = { cell?: number };

/** The key the options are kept under in `localStorage`. */
export const optionsKey = 'paint.lego.options';

/**
 * The cell sizes the Options sheet offers, in CSS pixels, found on the default board (2026-11-19). Below 24 a one-cell
 * button's 20 px icon touches its edges and named buttons lose their names; above 52 a one-cell value turns from a
 * knob into a slider without its number, and from 60 the default board's plates overlap on a landscape tablet. In
 * steps of 2, so the cell and its gaps stay on whole pixels at a device scale of 1.5.
 */
export const cellRange = { min: 24, max: 52, step: 2 } as const;

/**
 * The cell a device starts with while the user has not chosen one and the host names none: the 28 px chosen with a
 * pen on the tablet, on every device for now. A phone used with a finger may later start larger; this is the one
 * place to decide that from the device.
 */
export function deviceCell() {
  return defaultCell;
}

/**
 * The options on this device, read once, before the first layout, and written back on every change. A missing,
 * corrupt or unreadable entry gives no choice; a refused write keeps the choice until the page closes.
 */
export function createLegoOptions() {
  const [options, setOptions] = createSignal<LegoOptions>(readOptions());

  return {
    /** The cell the user chose, a whole step within `cellRange`, or `undefined` while they have not. */
    cell: () => options().cell,
    /** Chooses the cell, settled to the nearest step within `cellRange`, and keeps it. */
    setCell(cell: number) {
      const next = normalOptions({ ...options(), cell });
      setOptions(next);
      writeOptions(next);
    }
  };
}

/**
 * The stored options. Without an entry of their own, a cell size kept by the tile look trial, the control LEGO had
 * before this sheet, is carried over once: written under `optionsKey` and the trial's entry removed, so the trial's
 * key is never read again once the options are stored.
 */
export function readOptions(): LegoOptions {
  let stored: string | null;
  try {
    stored = localStorage.getItem(optionsKey);
  } catch {
    return {};
  }

  if (stored === null) {
    return carryOverTrial();
  }

  try {
    const parsed = JSON.parse(stored) as unknown;
    return normalOptions(parsed && typeof parsed === 'object' ? (parsed as LegoOptions) : {});
  } catch {
    return {};
  }
}

/** The key the tile look trial kept its corners and cell size under, read once by `readOptions`. */
const trialKey = 'paint.lego.tile-look';

/** The trial's cell size as options, kept under `optionsKey` from now on; no choice when there is none. */
function carryOverTrial(): LegoOptions {
  let carried: LegoOptions = {};
  try {
    const trial = JSON.parse(localStorage.getItem(trialKey) ?? 'null') as { cellSize?: unknown } | null;
    carried = normalOptions({ cell: typeof trial?.cellSize === 'number' ? trial.cellSize : undefined });
  } catch {
    // A corrupt trial entry carries nothing over.
  }

  if (writeOptions(carried)) {
    try {
      localStorage.removeItem(trialKey);
    } catch {
      // Left behind, it is never read again: the options are stored now.
    }
  }

  return carried;
}

/** Keeps `options` on the device; false when storage refused them. */
function writeOptions(options: LegoOptions) {
  try {
    localStorage.setItem(optionsKey, JSON.stringify(options));
    return true;
  } catch {
    return false;
  }
}

/** `options` with only their own fields, each valid: the cell a whole step within `cellRange`, or none. */
function normalOptions(options: LegoOptions): LegoOptions {
  const cell = options.cell;
  if (typeof cell !== 'number' || !Number.isFinite(cell)) {
    return {};
  }

  const stepped = Math.round(cell / cellRange.step) * cellRange.step;
  return { cell: Math.min(cellRange.max, Math.max(cellRange.min, stepped)) };
}
