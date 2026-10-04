import type { Point } from '@app-game/paint-core/camera';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import { createSignal } from 'solid-js';
import { fillEdit, type FillCommand } from './fillEdit';

/**
 * The UI half of the bucket fill, whose engine half is `fillEdit` in the drawing engine's recipe: fill settings,
 * remembered in `localStorage`, and the canvas contact that fills. A contact with a pen or mouse fills at its point;
 * touch keeps navigating, and Alt/Option is left to color picking.
 */
export function createFill(options: {
  /** The fill tool is active. */
  active: () => boolean;
  /** The color to fill with, `#rrggbb`. */
  color: () => string;
  /** The visible part of the canvas in document pixels; a fill stays inside it. */
  area: () => FillCommand['area'];
  /** Whether a fill can start now: the engine accepts edits and no stroke or selection edit runs. */
  canFill: () => boolean;
  send: (command: Extract<PaintCommand, { type: 'edit' }>) => void;
}) {
  const [settings, setSettings] = createSignal<FillSettings>(readSettings());

  return {
    settings,
    /** Changes fill settings and remembers them. */
    update(patch: Partial<FillSettings>) {
      const next = { ...settings(), ...patch };
      setSettings(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Settings are a convenience; keep them for this page.
      }
    },
    canvasAction: {
      enabled: (event: Pick<PointerEvent, 'altKey' | 'pointerType'>) =>
        options.active() && !event.altKey && event.pointerType !== 'touch',
      run(point: Point) {
        if (options.canFill()) {
          options.send(fillEdit.command({ ...settings(), point, area: options.area(), color: options.color() }));
        }
      }
    }
  };
}

/** Fill settings chosen in the fill panel. */
export type FillSettings = Pick<FillCommand, 'tolerance' | 'expand' | 'opacity' | 'source'>;

const storageKey = 'paint.fill';

const defaultSettings: FillSettings = { tolerance: 32, expand: 1, opacity: 1, source: 'all' };

/** Stored settings, with defaults for missing or invalid values. */
function readSettings(): FillSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    const record = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
    const integer = (value: unknown, max: number, fallback: number) =>
      Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max ? (value as number) : fallback;
    return {
      tolerance: integer(record.tolerance, 255, defaultSettings.tolerance),
      expand: integer(record.expand, 32, defaultSettings.expand),
      opacity:
        typeof record.opacity === 'number' && record.opacity >= 0 && record.opacity <= 1
          ? record.opacity
          : defaultSettings.opacity,
      source: record.source === 'layer' ? 'layer' : 'all'
    };
  } catch {
    return defaultSettings;
  }
}
