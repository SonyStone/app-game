import type { Tile } from './virtualTiles';

/** Stable best-K selection: only the bounded result is sorted, preserving resident priority and painter-independent ties. */
export function selectImageTiles(
  candidates: Map<string, Tile & { priority: number }>,
  capacity: number,
  resident: ReadonlyMap<string, unknown>
) {
  const heap: { key: string; tile: Tile; score: number; order: number }[] = [];
  let order = 0;
  for (const [key, tile] of candidates) {
    const entry = { key, tile, score: tile.priority - (resident.has(key) ? 0.1 : 0), order: order++ };
    if (capacity === 0) break;
    if (heap.length < capacity) {
      heap.push(entry);
      let index = heap.length - 1;
      while (index > 0) {
        const parent = (index - 1) >>> 1;
        if (compare(heap[parent]!, entry) >= 0) break;
        heap[index] = heap[parent]!;
        index = parent;
      }
      heap[index] = entry;
    } else if (compare(entry, heap[0]!) < 0) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && compare(heap[child + 1]!, heap[child]!) > 0) child++;
        if (compare(entry, heap[child]!) >= 0) break;
        heap[index] = heap[child]!;
        index = child;
      }
      heap[index] = entry;
    }
  }
  return new Map(heap.sort(compare).map(({ key, tile }) => [key, tile]));

  function compare(a: (typeof heap)[number], b: (typeof heap)[number]) {
    return a.score - b.score || a.order - b.order;
  }
}
