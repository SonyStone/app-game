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
    const { kind, stops, opacity, mixing } = currentSettings();
    const colors = options.colors();
    const points = options.selection();
    return {
      start,
      end,
      kind,
      stops: stops.map((stop) => ({ ...stop, color: resolveStop(stop.color, colors) })),
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
 * Gradient settings chosen in the gradient panel: its shape, its color stops, its opacity and its mixing (`linear`
 * like Smooth color).
 */
export type GradientSettings = {
  kind: GradientCommand['kind'];
  stops: GradientStop[];
  opacity: number;
  mixing: GradientCommand['mixing'];
};

/**
 * A color stop of the gradient: at `position` from 0 to 1, the foreground or background color as they are when the
 * gradient is drawn, or a fixed `#rrggbb`, with `alpha` from 0 to 1.
 */
export type GradientStop = { position: number; color: 'foreground' | 'background' | string; alpha: number };

/** The `#rrggbb` a stop's color stands for. */
export function resolveStop(color: GradientStop['color'], colors: { foreground: string; background: string }) {
  return color === 'foreground' ? colors.foreground : color === 'background' ? colors.background : color;
}

/** Stops of the presets in the gradient panel. */
export const gradientPresets = {
  background: [
    { position: 0, color: 'foreground', alpha: 1 },
    { position: 1, color: 'background', alpha: 1 }
  ],
  transparent: [
    { position: 0, color: 'foreground', alpha: 1 },
    { position: 1, color: 'foreground', alpha: 0 }
  ]
} as const satisfies Record<string, readonly GradientStop[]>;

const storageKey = 'paint.gradient';

const defaultSettings: GradientSettings = {
  kind: 'linear',
  stops: [...gradientPresets.background],
  opacity: 1,
  mixing: 'linear'
};

/** Stored settings, with defaults for missing or invalid values. */
function readSettings(): GradientSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<
      Record<keyof GradientSettings | 'end' | 'reverse', unknown>
    >;
    return {
      kind: stored.kind === 'radial' ? 'radial' : 'linear',
      stops: readStops(stored),
      opacity:
        typeof stored.opacity === 'number' && stored.opacity >= 0 && stored.opacity <= 1
          ? stored.opacity
          : defaultSettings.opacity,
      mixing: stored.mixing === 'classic' ? 'classic' : 'linear'
    };
  } catch {
    return defaultSettings;
  }
}

/** Stored stops, or those of settings saved before stops, which chose an end and whether to swap the colors. */
function readStops(stored: Partial<Record<string, unknown>>): GradientStop[] {
  if (Array.isArray(stored.stops)) {
    const stops = stored.stops.filter(
      (stop): stop is GradientStop =>
        typeof stop === 'object' &&
        stop !== null &&
        typeof stop.position === 'number' &&
        stop.position >= 0 &&
        stop.position <= 1 &&
        typeof stop.alpha === 'number' &&
        stop.alpha >= 0 &&
        stop.alpha <= 1 &&
        (stop.color === 'foreground' || stop.color === 'background' || /^#[0-9a-f]{6}$/i.test(stop.color))
    );
    if (stops.length >= 2 && stops.length <= 16) {
      return stops;
    }
  }

  if (stored.end === 'transparent') {
    return [...gradientPresets.transparent];
  }

  return stored.reverse === true
    ? [
        { position: 0, color: 'background', alpha: 1 },
        { position: 1, color: 'foreground', alpha: 1 }
      ]
    : [...gradientPresets.background];
}
