import type { Sample } from '@app-game/paint-core/brush';
import type { Camera } from '@app-game/paint-core/camera';
import type { StrokeHoldDrag } from '@app-game/paint-core/input';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import {
  fitShape,
  moveShape,
  shapeName,
  shapePivot,
  shapeSamples,
  snappedName,
  snapShape,
  type QuickShape
} from '@app-game/paint-core/shapeFit';
import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, onCleanup } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';

/**
 * QuickShape, as in Procreate: a stroke whose pen rests at its end becomes a clean line, arc, ellipse or polyline,
 * which follows the pen while it stays down and is painted with the stroke's brush when it lifts. Give `strokeHold` to
 * canvas input (`attachInput`); the engine replaces the stroke through `replace-stroke`, so the shape stays one undo
 * step and passes through the stroke's decorations, such as symmetry. The shape is painted pixels, like any stroke of
 * the brush or eraser, not a vector object. Strokes that fit no shape, or smaller than {@link minimumSize}, stay as
 * drawn.
 *
 * While the pen is down after the shape appears, an open shape turns and scales around its start and a closed one
 * around its center, so the point where the pen rested follows the pen; the stroke is repainted at most once per
 * animation frame. Shift or a finger on the canvas snaps it; see `snapShape`. `cancel` abandons the shape for an
 * Escape that cancels the stroke. Settings are kept in `localStorage`. Must be created within a Solid owner.
 */
export function createQuickShape(options: {
  /** Sends `replace-stroke` commands, in order with the stroke's own commands. */
  send: (command: Extract<PaintCommand, { type: 'replace-stroke' }>) => void;
  /** The view the stroke is drawn in: shapes smaller than {@link minimumSize} CSS pixels on it are left alone. */
  camera: () => Camera;
}) {
  const [settings, setSettings, currentSettings] = createImmediateSignal(readSettings());
  const [hint, setHint] = createSignal<ShapeHint>();
  let session: Session | undefined;
  let shift = false;

  createEventListener(window, ['keydown', 'keyup'], (event) => {
    if (event.key === 'Shift' && shift !== event.shiftKey) {
      shift = event.shiftKey;
      session?.snapChanged();
    }
  });
  onCleanup(() => session?.close());

  return {
    /** Whether held strokes become shapes, and how long the pen must rest; see {@link QuickShapePreferences}. */
    settings,
    /** Changes the settings and remembers them. */
    update(patch: Partial<QuickShapePreferences>) {
      const next = normalizeSettings({ ...currentSettings(), ...patch });
      setSettings(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Keep the settings for this session.
      }
    },
    /** The shape being edited, for the on-canvas hint; `undefined` otherwise. */
    hint,
    /** The canvas input binding; see `attachInput`'s `strokeHold`. */
    strokeHold: {
      delay: () => currentSettings().delay,
      hold(samples: readonly Sample[]): StrokeHoldDrag | undefined {
        if (!currentSettings().enabled || session) {
          return undefined;
        }

        const zoom = options.camera().zoom;
        const shape = fitShape(samples);
        if (!shape || extent(samples) * zoom < minimumSize) {
          return undefined;
        }

        session = startSession(shape, [...samples], zoom);
        return session.drag;
      }
    },
    /** Abandons the shape being edited, without sending more of it, as when Escape cancels the stroke. */
    cancel() {
      session?.close();
    }
  };

  /** Edits one shape from the hold until the pen lifts. */
  function startSession(base: QuickShape, stroke: Sample[], zoom: number): Session {
    const pivot = shapePivot(base);
    const from = stroke.at(-1)!;
    let to: Sample = from;
    let fingers = 0;
    let frame: number | undefined;
    let closed = false;
    const snapping = () => shift || fingers > 0;
    const render = () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
        frame = undefined;
      }

      const moved = moveShape(base, pivot, from, to);
      const shape = snapping() ? snapShape(moved) : moved;
      setHint({ name: shapeName(shape), snap: snappedName(base), snapping: snapping() });
      options.send({ type: 'replace-stroke', samples: shapeSamples(shape, stroke, outlineSpacing / zoom) });
    };
    const schedule = () => {
      if (!closed && frame === undefined) {
        frame = requestAnimationFrame(render);
      }
    };
    const close = () => {
      closed = true;
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
        frame = undefined;
      }

      if (session === current) {
        session = undefined;
      }

      setHint(undefined);
    };
    const current: Session = {
      drag: {
        move(sample) {
          to = sample;
          schedule();
        },
        fingers(count) {
          fingers = count;
          schedule();
        },
        end(cancelled) {
          // The last position must reach the engine before the stroke ends.
          if (!closed && !cancelled && frame !== undefined) {
            render();
          }

          close();
        }
      },
      snapChanged: schedule,
      close
    };
    render();
    return current;
  }
}

/** QuickShape preferences, shared by every brush and the eraser rather than saved with a preset. */
export type QuickShapePreferences = {
  /** Held strokes become shapes; on by default. */
  enabled: boolean;
  /** How long the pen must rest, in milliseconds, from {@link minimumDelay} to {@link maximumDelay}; 500 by default. */
  delay: number;
};

/** What the hint shows: the shape's name, what snapping makes of it, if anything, and whether it is snapping now. */
export type ShapeHint = { name: string; snap: string | undefined; snapping: boolean };

/** Shortest and longest rest of the pen that makes a shape, in milliseconds. */
export const minimumDelay = 250;
export const maximumDelay = 1500;

/** One shape being edited. */
type Session = { drag: StrokeHoldDrag; snapChanged: () => void; close: () => void };

/** Smallest stroke, as the diagonal of its bounds in CSS pixels, that can become a shape: a resting tap stays a dot. */
const minimumSize = 24;

/** Spacing of the shape's samples in CSS pixels; brushes place their own dabs between them. */
const outlineSpacing = 2;

const storageKey = 'paint.quickShape';

function readSettings(): QuickShapePreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<Record<keyof QuickShapePreferences, unknown>>;
    return normalizeSettings({
      enabled: stored.enabled !== false,
      delay: typeof stored.delay === 'number' ? stored.delay : defaultDelay
    });
  } catch {
    return { enabled: true, delay: defaultDelay };
  }
}

function normalizeSettings(settings: QuickShapePreferences): QuickShapePreferences {
  return {
    enabled: settings.enabled,
    delay: Number.isFinite(settings.delay)
      ? Math.round(Math.min(maximumDelay, Math.max(minimumDelay, settings.delay)))
      : defaultDelay
  };
}

const defaultDelay = 500;

/** Diagonal of the samples' bounds. */
function extent(samples: readonly Sample[]) {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const { x, y } of samples) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }

  return Math.hypot(right - left, bottom - top);
}
