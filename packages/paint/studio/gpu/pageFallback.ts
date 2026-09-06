import type { VirtualPage } from '../virtualPages';

/** Covers a missing target with disjoint quadtree regions. Ready descendants replace only their
 * portion of an ancestor; every other portion keeps its closest available ancestor's pixels.
 * Call with disjoint targets. Source pages may be shared, but emitted regions never overlap.
 */
export function pageFallback<T extends { page: VirtualPage }>(target: VirtualPage, resident: readonly T[]) {
  const parents = resident.filter((entry) => containsPage(entry.page, target));
  const ancestor = parents.reduce<T | undefined>(
    (best, entry) => (!best || entry.page.level < best.page.level ? entry : best),
    undefined
  );
  const result: { source: T; region: VirtualPage }[] = [];
  const visit = (region: VirtualPage, candidates: readonly T[], inherited?: T) => {
    const exact = candidates.find((entry) => samePage(entry.page, region));
    if (exact) {
      result.push({ source: exact, region });
      return;
    }
    const descendants = candidates.filter((entry) => containsPage(region, entry.page));
    if (!descendants.length) {
      if (inherited) result.push({ source: inherited, region });
      return;
    }
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        visit(
          { ...region, level: region.level - 1, x: region.x * 2 + dx, y: region.y * 2 + dy },
          descendants,
          inherited
        );
      }
  };
  visit(
    target,
    resident.filter((entry) => containsPage(target, entry.page)),
    ancestor
  );
  return result;
}

/** UV origin and extent of a world region inside its source page, including negative coordinates. */
export function pageCrop(source: VirtualPage, region: VirtualPage) {
  const scale = 2 ** (region.level - source.level);
  return { x: region.x * scale - source.x, y: region.y * scale - source.y, scale };
}

function samePage(a: VirtualPage, b: VirtualPage) {
  return a.layerId === b.layerId && a.level === b.level && a.x === b.x && a.y === b.y;
}

function containsPage(parent: VirtualPage, child: VirtualPage) {
  if (parent.layerId !== child.layerId || parent.level < child.level) return false;
  const ratio = 2 ** (parent.level - child.level);
  return Math.floor(child.x / ratio) === parent.x && Math.floor(child.y / ratio) === parent.y;
}
