import { fontRows, glyphColumns, glyphRows, type PanelQuad } from './layoutPerformancePanel';

/**
 * Draws a performance panel layout on a 2D canvas whose backing store is `pixels` in size, replacing its previous
 * contents. For apps that cannot draw into their own GPU pass, such as one whose renderer runs in a worker; the result
 * matches the GPU panel. Glyph quads fill one rectangle per lit font pixel.
 */
export function drawPerformancePanel(
  context: PanelContext,
  quads: readonly PanelQuad[],
  /** Canvas size in device pixels, the size the layout was computed for. */
  pixels: { width: number; height: number }
) {
  context.clearRect(0, 0, pixels.width, pixels.height);

  for (const { rect, color, glyph } of quads) {
    const left = ((rect[0] + 1) / 2) * pixels.width;
    const top = ((1 - rect[1]) / 2) * pixels.height;
    const width = ((rect[2] + 1) / 2) * pixels.width - left;
    const height = ((1 - rect[3]) / 2) * pixels.height - top;

    context.fillStyle = cssColor(color);

    if (glyph < 0) {
      context.fillRect(left, top, width, height);
      continue;
    }

    const cellWidth = width / glyphColumns;
    const cellHeight = height / glyphRows;

    for (let row = 0; row < glyphRows; row++) {
      const bits = fontRows[glyph * glyphRows + row]!;

      for (let column = 0; column < glyphColumns; column++) {
        if ((bits >> (glyphColumns - 1 - column)) & 1) {
          context.fillRect(left + column * cellWidth, top + row * cellHeight, cellWidth, cellHeight);
        }
      }
    }
  }
}

/** The part of `CanvasRenderingContext2D` the panel uses; also satisfied by `OffscreenCanvasRenderingContext2D`. */
export type PanelContext = Pick<CanvasRenderingContext2D, 'clearRect' | 'fillRect' | 'fillStyle'>;

/** Converts straight RGBA components in the range 0–1 to a CSS color. */
function cssColor([red, green, blue, alpha]: PanelQuad['color']) {
  return `rgb(${Math.round(red * 255)} ${Math.round(green * 255)} ${Math.round(blue * 255)} / ${alpha})`;
}
