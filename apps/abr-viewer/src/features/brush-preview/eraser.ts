import { d, std } from 'typegpu';

/**
 * Composites an eraser test layer over an 8 CSS-pixel transparency checker.
 * Ordinary erasing starts with the opaque background color. History mode starts
 * transparent and restores that same color. Coverage is the completed stroke mask.
 * This fixture resets for each preview stroke; it does not hold document history.
 */
export function eraserPreviewColor(
  background: d.v3f,
  coverage: number,
  position: d.v2f,
  dpr: number,
  restore: boolean
): d.v3f {
  'use gpu';
  const cell = std.floor(std.div(position, 8 * dpr));
  const checker = std.select(184 / 255, 224 / 255, (cell.x + cell.y) % 2 === 0);
  const alpha = std.select(1 - coverage, coverage, restore);
  return std.mix(d.vec3f(checker), background, alpha);
}
