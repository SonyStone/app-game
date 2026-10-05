import type { Point } from '@app-game/paint-core/camera';
import type { SelectionSummary } from '@app-game/paint-core/selectionMask';

/**
 * A CSS `clip-path` that shows an overlay of the canvas only over the selection, such as a gradient's preview: the
 * selected cells of the summary's hit map, merged into rectangles and placed on screen by `toScreen`, which may rotate
 * or mirror them. An inverted selection clips its unselected cells out of `size`, the canvas in CSS pixels. Without a
 * selection, `undefined`, so the overlay covers the canvas. As coarse as the hit map is for large selections.
 */
export function selectionClipPath(
  summary: SelectionSummary,
  toScreen: (point: Point) => Point,
  size: { width: number; height: number }
): string | undefined {
  const hits = summary.hits;
  if (!summary.selected || (!hits && summary.inverted)) {
    return undefined;
  }

  const paths: string[] = [];
  // A clockwise rectangle on screen adds to the clip, a counterclockwise one cuts out of it (nonzero rule).
  const quad = (left: number, top: number, right: number, bottom: number, reverse: boolean) => {
    const corners = [
      toScreen({ x: left, y: top }),
      toScreen({ x: right, y: top }),
      toScreen({ x: right, y: bottom }),
      toScreen({ x: left, y: bottom })
    ];
    const twice = corners.reduce((sum, a, index) => {
      const b = corners[(index + 1) % 4]!;
      return sum + a.x * b.y - b.x * a.y;
    }, 0);
    if (twice > 0 === reverse) {
      corners.reverse();
    }

    paths.push(`M${corners.map(({ x, y }) => `${round(x)} ${round(y)}`).join('L')}Z`);
  };

  if (summary.inverted) {
    paths.push(`M0 0L${size.width} 0L${size.width} ${size.height}L0 ${size.height}Z`);
  }

  if (hits) {
    // The runs of each row, merged with the same run of the rows below.
    const wanted = summary.inverted ? 0 : 1;
    const open = new Map<string, { start: number; end: number; top: number; bottom: number }>();
    const close = (run: { start: number; end: number; top: number; bottom: number }) =>
      quad(
        hits.left + run.start * hits.cell,
        hits.top + run.top * hits.cell,
        hits.left + run.end * hits.cell,
        hits.top + run.bottom * hits.cell,
        summary.inverted
      );
    for (let row = 0; row <= hits.rows; row++) {
      const runs = new Set<string>();
      for (let column = 0; row < hits.rows && column < hits.columns; column++) {
        if (hits.cells[row * hits.columns + column] !== wanted) {
          continue;
        }

        const start = column;
        while (column + 1 < hits.columns && hits.cells[row * hits.columns + column + 1] === wanted) {
          column++;
        }

        const key = `${start},${column + 1}`;
        runs.add(key);
        const run = open.get(key);
        if (run) {
          run.bottom = row + 1;
        } else {
          open.set(key, { start, end: column + 1, top: row, bottom: row + 1 });
        }
      }

      for (const [key, run] of open) {
        if (!runs.has(key)) {
          close(run);
          open.delete(key);
        }
      }
    }
  }

  return `path('${paths.join('')}')`;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
