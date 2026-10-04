import type { Point } from '@app-game/paint-core/camera';
import type { ColorSample, PickedColor } from '@app-game/paint-core/colorSample';
import { createEventListener } from '@solid-primitives/event-listener';
import type { Result } from 'neverthrow';
import { createEffect, createSignal, getOwner, isDisposed, type Accessor } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import type { PaintError } from '../../shared/errors';

/**
 * Picks the foreground color from the canvas: Alt/Option-press with a painting tool, as in Photoshop, or the next
 * contact after `arm()`. While the contact is held, `preview` shows the color under it next to the current one and a
 * magnified view around it, sampled from the last presented frame as it moves; releasing picks the color there at
 * full detail and applies it, and a cancelled contact picks nothing. While armed, or while Alt/Option is held with a
 * painting tool, a pen or mouse hovering over the canvas previews the same way without picking. `settings` choose whether the view (all layers and the
 * paper) or the active layer is sampled, and over how many pixels. Must be created within a Solid owner; colors
 * arriving after disposal are dropped.
 */
export function createCanvasColorPicker(options: {
  /** Whether the active tool paints color, so Alt/Option-press samples instead of painting. */
  paints: () => boolean;
  /** Converts a document point to CSS pixels of the canvas. */
  toScreen: (point: Point) => Point;
  /** Reads a color at a canvas point; see `PaintEngine.pickColor`. */
  pick: (point: Point, sample: ColorSample) => Promise<Result<PickedColor, PaintError>>;
  /** Where a pen or mouse hovers over the canvas, in CSS pixels of the canvas; undefined when it is elsewhere. */
  hovered: Accessor<Point | undefined>;
  /** The color a pick replaces, shown beside the sample. */
  current: Accessor<string>;
  /** Receives the picked `#rrggbb` color. */
  apply: (color: string) => void;
  onError: (error: PaintError) => void;
}) {
  const owner = getOwner()!;
  const settings = createColorPickerSettings();
  const [armed, setArmed, isArmed] = createImmediateSignal(false);
  const [preview, setPreview] = createSignal<PickerPreview>();
  /** Alt/Option is held. */
  const [alt, setAlt] = createSignal(false);
  /** The contact or hover being sampled, in CSS pixels of the canvas; cleared when it ends. */
  let sampling: { point: Point; inFlight: boolean; hover?: boolean } | undefined;

  createEventListener(window, ['keydown', 'keyup'], (event: KeyboardEvent) =>
    setAlt(event.key === 'Alt' ? event.type === 'keydown' : event.altKey)
  );
  createEventListener(window, 'blur', () => setAlt(false));
  createEffect(
    () => (armed() || (alt() && options.paints()) ? options.hovered() : undefined),
    (point) => hover(point)
  );

  return {
    /** The next canvas contact picks a color instead of painting. */
    armed,
    arm: () => setArmed(true),
    cancel: () => setArmed(false),
    settings,
    /** Where a held contact samples and what it shows; undefined while not picking. */
    preview,
    /** Canvas contact handler for `attachInput`. */
    canvasAction: {
      enabled: (event: Pick<PointerEvent, 'altKey'>) => isArmed() || (event.altKey && options.paints()),
      run(point: Point) {
        setArmed(false);
        begin(point);
      },
      move: (point: Point) => follow(point),
      end: (cancelled: boolean) => finish(cancelled)
    }
  };

  function begin(point: Point) {
    sampling = { point: options.toScreen(point), inFlight: false };
    setPreview(blankPreview(sampling.point));
    void sampleLive();
  }

  /** Previews the color under a hovering pointer, or stops at `undefined`; a contact being sampled takes precedence. */
  function hover(point: Point | undefined) {
    if (sampling && !sampling.hover) {
      return;
    }

    if (!point) {
      if (sampling) {
        sampling = undefined;
        setPreview(undefined);
      }

      return;
    }

    if (sampling) {
      sampling.point = point;
      setPreview((previous) => previous && { ...previous, point });
    } else {
      sampling = { point, inFlight: false, hover: true };
      setPreview(blankPreview(point));
    }

    void sampleLive();
  }

  function follow(point: Point) {
    if (!sampling) {
      return;
    }

    sampling.point = options.toScreen(point);
    setPreview((previous) => previous && { ...previous, point: sampling!.point });
    void sampleLive();
  }

  /** Samples the latest point from the presented frame, one request at a time. */
  async function sampleLive() {
    const current = sampling;
    if (!current || current.inFlight) {
      return;
    }

    current.inFlight = true;
    const point = current.point;
    const sampled = await options.pick(point, { ...settings.sample(), exact: false, loupe: loupeSide });
    current.inFlight = false;
    if (isDisposed(owner) || sampling !== current) {
      return;
    }

    if (sampled.isOk()) {
      setPreview((previous) => previous && { ...previous, color: sampled.value.color, loupe: sampled.value.loupe });
    }

    if (current.point !== point) {
      void sampleLive();
    }
  }

  /** Picks the color at the final point at full detail and applies it, unless the contact was cancelled. */
  async function finish(cancelled: boolean) {
    const ended = sampling;
    sampling = undefined;
    setPreview(undefined);
    if (!ended || cancelled) {
      return;
    }

    const picked = await options.pick(ended.point, { ...settings.sample(), exact: true });
    if (isDisposed(owner)) {
      return;
    }

    if (picked.isErr()) {
      options.onError(picked.error);
      return;
    }

    if (picked.value.color !== null) {
      options.apply(picked.value.color);
    }
  }

  /** A preview at `point` before its first sample arrives. */
  function blankPreview(point: Point): PickerPreview {
    return { point, color: undefined, current: options.current(), size: settings.size(), loupeSide };
  }
}

/** The canvas color picker. */
export type CanvasColorPicker = ReturnType<typeof createCanvasColorPicker>;

/**
 * A pick being previewed: the sampled point in CSS pixels of the canvas, the color there (`undefined` until the first
 * sample arrives, `null` where the sampled layer has no paint), the current color it would replace, the side of the
 * averaged square (`size`) and of the magnified view (`loupeSide`) in CSS pixels, and the magnified view's pixels once
 * sampled; see `PickedColor.loupe`.
 */
export type PickerPreview = {
  point: Point;
  color: string | null | undefined;
  current: string;
  size: ColorSample['size'];
  loupeSide: number;
  loupe?: PickedColor['loupe'];
};

/** CSS pixels per side of the view magnified in the preview's ring. */
const loupeSide = 11;

/**
 * What the color picker samples: the view with all layers and the paper, or the active layer only, averaged over 1, 3
 * or 5 pixels per side. Persisted in `localStorage`; storage failures keep the choice for this session.
 */
export function createColorPickerSettings() {
  // A pick in the same event as a change already uses the new settings.
  const [, setStored, stored] = createImmediateSignal(read());

  return {
    /** `view` samples what is shown, `layer` the active layer's paint. */
    source: () => stored().source,
    /** Pixels per side of the averaged square. */
    size: () => stored().size,
    /** The sample for `PaintEngine.pickColor`, without its `exact` flag. */
    sample: (): Omit<ColorSample, 'exact'> => stored(),
    update(patch: Partial<Omit<ColorSample, 'exact'>>) {
      const next = { ...stored(), ...patch };
      setStored(next);
      try {
        localStorage.setItem(settingsKey, JSON.stringify(next));
      } catch {
        // Keep the choice for this session.
      }
    }
  };
}

function read(): Omit<ColorSample, 'exact'> {
  try {
    const stored = JSON.parse(localStorage.getItem(settingsKey) ?? '{}') as Partial<ColorSample>;
    return {
      source: stored.source === 'layer' ? 'layer' : 'view',
      size: stored.size === 3 || stored.size === 5 ? stored.size : 1
    };
  } catch {
    return { source: 'view', size: 1 };
  }
}

const settingsKey = 'paint.colorPicker';
