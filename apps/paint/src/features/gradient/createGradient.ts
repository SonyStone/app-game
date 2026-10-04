import type { Point } from '@app-game/paint-core/camera';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import { createSignal } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { gradientEdit, type GradientCommand } from './gradientEdit';

/**
 * The UI half of the gradient tool, whose engine half is `gradientEdit` in the drawing engine's recipe: settings,
 * remembered in `localStorage`, and the canvas drag that draws a gradient. A pen or mouse drag sets the start and the
 * end, shown by `drag` for a preview, and draws the gradient on release; touch keeps navigating, Alt/Option is left
 * to color picking, and a cancelled drag draws nothing. Must be created within a Solid owner.
 */
export function createGradient(options: {
  /** The gradient tool is active. */
  active: () => boolean;
  /** Foreground and background colors, `#rrggbb`. */
  colors: () => { foreground: string; background: string };
  /** The view's bounds in document pixels, covered without a selection. */
  area: () => GradientCommand['area'];
  /** The lasso outline limiting the gradient; fewer than three points cover the view. */
  selection: () => readonly Point[];
  /** Whether a gradient can be drawn now: the engine accepts edits and no stroke or selection edit runs. */
  canDraw: () => boolean;
  send: (command: Extract<PaintCommand, { type: 'edit' }>) => void;
}) {
  const [settings, setSettings, currentSettings] = createImmediateSignal<GradientSettings>(readSettings());
  const [drag, setDrag] = createSignal<{ start: Point; end: Point }>();
  let dragging: { start: Point; end: Point } | undefined;

  return {
    settings,
    /** Changes gradient settings and remembers them. */
    update(patch: Partial<GradientSettings>) {
      const next = { ...currentSettings(), ...patch };
      setSettings(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Settings are a convenience; keep them for this page.
      }
    },
    /** The drag in progress, in document pixels. */
    drag,
    /** The command the drag in progress would send, for its preview. */
    preview: () => {
      const current = drag();
      return current && command(current.start, current.end);
    },
    canvasAction: {
      enabled: (event: Pick<PointerEvent, 'altKey' | 'pointerType'>) =>
        options.active() && !event.altKey && event.pointerType !== 'touch',
      run(point: Point) {
        dragging = { start: point, end: point };
        setDrag(dragging);
      },
      move(point: Point) {
        if (dragging) {
          dragging = { ...dragging, end: point };
          setDrag(dragging);
        }
      },
      end(cancelled: boolean) {
        const ended = dragging;
        dragging = undefined;
        setDrag(undefined);
        if (
          ended &&
          !cancelled &&
          options.canDraw() &&
          Math.hypot(ended.end.x - ended.start.x, ended.end.y - ended.start.y) > 0
        ) {
          options.send(gradientEdit.command(command(ended.start, ended.end)));
        }
      }
    }
  };

  function command(start: Point, end: Point): GradientCommand {
    const { kind, end: ending, opacity, mixing, reverse } = currentSettings();
    const { foreground, background } = options.colors();
    const points = options.selection();
    const [from, to] = reverse && ending === 'background' ? [background, foreground] : [foreground, background];
    return {
      start,
      end,
      kind,
      from,
      to: ending === 'transparent' ? 'transparent' : to,
      opacity,
      mixing,
      area: options.area(),
      ...(points.length >= 3 ? { points: [...points] } : {})
    };
  }
}

/** The gradient tool's state and canvas action. */
export type Gradient = ReturnType<typeof createGradient>;

/**
 * Gradient settings chosen in the gradient panel: its shape, whether it ends in the background color or fades out,
 * its opacity, its mixing (`linear` like Smooth color) and whether the colors are swapped.
 */
export type GradientSettings = {
  kind: GradientCommand['kind'];
  end: 'background' | 'transparent';
  opacity: number;
  mixing: GradientCommand['mixing'];
  reverse: boolean;
};

const storageKey = 'paint.gradient';

const defaultSettings: GradientSettings = {
  kind: 'linear',
  end: 'background',
  opacity: 1,
  mixing: 'linear',
  reverse: false
};

/** Stored settings, with defaults for missing or invalid values. */
function readSettings(): GradientSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<
      Record<keyof GradientSettings, unknown>
    >;
    return {
      kind: stored.kind === 'radial' ? 'radial' : 'linear',
      end: stored.end === 'transparent' ? 'transparent' : 'background',
      opacity:
        typeof stored.opacity === 'number' && stored.opacity >= 0 && stored.opacity <= 1
          ? stored.opacity
          : defaultSettings.opacity,
      mixing: stored.mixing === 'classic' ? 'classic' : 'linear',
      reverse: stored.reverse === true
    };
  } catch {
    return defaultSettings;
  }
}
