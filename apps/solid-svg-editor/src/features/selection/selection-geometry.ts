import type { Rect } from '../../editor/geometry';

export function normalizeClientRect(startX: number, startY: number, endX: number, endY: number): Rect {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  return {
    x,
    y,
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY)
  };
}

export function mergeSelection(initial: readonly string[], added: readonly string[]): readonly string[] {
  const ids = new Set(initial);

  for (const id of added) {
    ids.add(id);
  }

  return [...ids];
}
