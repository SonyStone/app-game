import type { Brush } from '@app-game/paint-core/brush';
import { createEffect, type Accessor } from 'solid-js';

/**
 * The browser's delegated ink trail (`navigator.ink`): between two frames of the drawing engine, the browser's
 * compositor extends the stroke from the last event the engine received to the pen's current position, as a plain
 * round line in the brush's color, opacity and size. It hides about one frame of latency; the engine's next frame
 * then covers it.
 * Erasing strokes get no trail, since its color would be wrong. Does nothing where the browser lacks the Ink API.
 * Must be created within a Solid owner; the trail presenter is released when `canvas` or `enabled` changes.
 */
export function createInkTrail(options: {
  /** The drawing canvas, which bounds the trail. */
  canvas: Accessor<HTMLCanvasElement | undefined>;
  enabled: Accessor<boolean>;
  /** Document-to-CSS-pixel scale of the view, which sizes the trail like the brush. */
  zoom: () => number;
}) {
  let presenter: InkPresenter | undefined;
  createEffect(
    () => (options.enabled() ? options.canvas() : undefined),
    (canvas) => {
      const ink = (navigator as Navigator & { ink?: InkApi }).ink;
      if (!canvas || !ink) {
        return;
      }

      let released = false;
      ink.requestPresenter({ presentationArea: canvas }).then(
        (requested) => {
          if (!released) {
            presenter = requested;
          }
        },
        () => {}
      );
      return () => {
        released = true;
        presenter = undefined;
      };
    }
  );

  return {
    /**
     * Starts the trail at `event`, a pen or mouse event of a stroke the engine just received; pass it to the canvas
     * input's `drawn`. Ignored without a presenter and for erasing brushes.
     */
    drawn(event: PointerEvent, brush: Brush) {
      if (!presenter || erases(brush)) {
        return;
      }

      const pressure = event.pointerType === 'pen' && brush.pressureSize ? calibrated(event.pressure, brush) : 1;
      const diameter = Math.max(1, brush.size * options.zoom() * Math.max(0.04, pressure));
      try {
        presenter.updateInkTrailStartPoint(event, { color: withOpacity(brush.color, brush.opacity), diameter });
      } catch {
        // A rejected event or style only loses the trail; the stroke itself is unaffected.
      }
    }
  };
}

/** The parts of the Ink API this module uses; TypeScript's DOM library does not declare it. */
type InkApi = { requestPresenter(options: { presentationArea: Element }): Promise<InkPresenter> };
type InkPresenter = {
  updateInkTrailStartPoint(event: PointerEvent, style: { color: string; diameter: number }): void;
};

/** Whether the brush removes paint: the eraser tool or a preset in the Clear mode or of Photoshop's Eraser. */
function erases(brush: Brush) {
  const settings = brush.engine?.settings as
    { blendMode?: unknown; values?: { tool?: { type?: unknown } } } | undefined;
  return brush.tool === 'eraser' || settings?.blendMode === 'Cler' || settings?.values?.tool?.type === 'ErTl';
}

/** Pen pressure through the brush's calibration, as the smoothing modes apply it; raw for the others. */
function calibrated(raw: number, brush: Brush) {
  const { mode, minimum, maximum, firmness } = brush.stroke;
  if (mode !== 'normal' && mode !== 'smooth' && mode !== 'stabilizer') {
    return raw;
  }

  return Math.max(0, Math.min(1, (raw - minimum) / (maximum - minimum))) ** firmness;
}

/** A `#rrggbb` color with `opacity` as its alpha byte; other color forms are returned unchanged. */
function withOpacity(color: string, opacity: number) {
  if (!/^#[0-9a-f]{6}$/i.test(color) || opacity >= 1) {
    return color;
  }

  const alpha = Math.round(Math.max(0, opacity) * 255);
  return color + alpha.toString(16).padStart(2, '0');
}
