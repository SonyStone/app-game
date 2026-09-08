import { isBlockEraser } from './blockEraser';
import type { BrushFormValues } from './form';

/** Pencil and the Eraser's Pencil/Block modes use hard pixel coverage and ignore Flow. */
export function usesPencilCoverage(tool: BrushFormValues['tool']): boolean {
  return tool.type === 'PcTl' || (tool.type === 'ErTl' && tool.eraserMode === 2) || isBlockEraser(tool);
}

/** Chooses the Pencil's stroke color once at contact. Transparent pixels never match foreground.
 * The current RGB8 policy requires an opaque, exact foreground match; native tolerance/color management
 * and partially transparent source behavior still require calibration.
 */
export function pencilUsesBackground(pixel: ArrayLike<number>, foreground: string): boolean {
  if (pixel[3] !== 255) return false;
  return [0, 1, 2].every(
    (channel) => pixel[channel] === parseInt(foreground.slice(1 + channel * 2, 3 + channel * 2), 16)
  );
}

/** Binary document-pixel coverage before tool opacity. The threshold for sampled/texture tips is approximate. */
export function pencilCoverage(coverage: number): number {
  'use gpu';
  if (coverage >= 0.5) return 1;
  return 0;
}
