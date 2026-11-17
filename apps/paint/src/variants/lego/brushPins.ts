import { panelFrame, partsBounds, placePart, putPanel, removePart, type Board, type Panel } from './board';
import { partDefinition } from './parts';

/** Membership is always derived from parts, including parts moved to other plates. */
export function brushPinned(board: Board, id: string) {
  return board.panels.some((panel) => panel.parts.some((part) => part.kind === `value:brush:${id}`));
}

/** Adds to the collecting plate using ordinary board placement, or removes every matching part. */
export function toggleBrushPin(board: Board, id: string, view: { width: number; height: number }): Board {
  const kind = `value:brush:${id}`;
  if (brushPinned(board, id)) {
    let next = board;
    for (const part of board.panels.flatMap((panel) => panel.parts).filter((part) => part.kind === kind)) {
      next = removePart(next, part.id);
    }
    return next;
  }

  const plate: Panel = board.panels.find((panel) => panel.id === 'brush-pins') ?? {
    id: 'brush-pins',
    floating: true,
    at: freeSpot(board, view),
    parts: []
  };
  const row = plate.parts.length ? partsBounds(plate.parts).row + partsBounds(plate.parts).rows : 0;
  return putPanel(board, {
    ...plate,
    parts: placePart(plate.parts, {
      id: crypto.randomUUID(),
      kind,
      cell: { column: 0, row },
      span: {
        columns: Math.max(3, Math.min(6, Math.ceil(((partDefinition(kind)?.label.length ?? 30) * 3 + 60) / 48))),
        rows: 1
      }
    })
  });
}

/** Search from the right edge for an unoccupied plate-sized rectangle. */
function freeSpot(board: Board, view: { width: number; height: number }) {
  const width = 296;
  const height = 64;
  const occupied = board.panels.filter((p) => !p.owner && !p.bench).map((p) => panelFrame(p, view).rect);
  for (let x = Math.max(0, view.width - width - 16); x >= 0; x -= 48) {
    for (let y = 96; y < view.height - height; y += 48) {
      if (
        occupied.every(
          (r) => x + width <= r.left || x >= r.left + r.width || y + height <= r.top || y >= r.top + r.height
        )
      ) {
        return { x: x / view.width, y: y / view.height };
      }
    }
  }
  return { x: 0.7, y: 0.15 };
}
