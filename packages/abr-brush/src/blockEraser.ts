import type { BrushTipImage } from '@app-game/abr-parser/reader';
import { brushToFormValues, record, type BrushFormValues } from './form';

/** Fixed CSS-pixel square. Exact Photoshop CC footprint and pixel placement still need native calibration. */
export const blockEraserSize = 16;

/** Accepts decoded settings or a UI-side settings record without parsing the whole preset. */
export function isBlockEraser(tool: unknown): boolean {
  const value = record(tool);
  return value.type === 'ErTl' && value.eraserMode === 3;
}

/** Creates transient raster settings; dormant brush dynamics and tool controls remain in the saved preset.
 * View zoom is CSS pixels per document pixel, angle is radians. Missing view means unrotated 100%.
 */
export function blockEraserValues(
  source: BrushFormValues,
  view: { zoom: number; angle: number; mirrored: boolean } = { zoom: 1, angle: 0, mirrored: false }
): BrushFormValues {
  if (!Number.isFinite(view.zoom) || view.zoom <= 0 || !Number.isFinite(view.angle))
    throw new Error('Block eraser requires a finite view and positive zoom.');
  const degrees = ((view.mirrored ? view.angle : -view.angle) * 180) / Math.PI;
  return {
    ...brushToFormValues({ id: 'block-eraser', name: source.name, type: 'computed', spacing: 6.25, settings: {} }),
    diameter: blockEraserSize / view.zoom,
    useSmoothing: source.useSmoothing,
    smoothing: { ...source.smoothing },
    angle: ((((degrees + 180) % 360) + 360) % 360) - 180,
    tool: {
      ...source.tool,
      mode: 'Nrml',
      opacity: 100,
      flow: 100,
      pressureOverridesOpacity: false,
      pressureOverridesSize: false
    }
  };
}

/** A full square mask; the stamp quad supplies the footprint, independent of any saved brush tip. */
export function blockEraserTip(): BrushTipImage {
  return { width: 1, height: 1, depth: 8, data: new Uint8Array([255]) };
}
