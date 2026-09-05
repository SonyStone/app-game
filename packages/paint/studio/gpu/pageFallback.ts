import type { VirtualPage } from '../virtualPages';

/** Reuses resident ancestors on zoom-in and resident descendants on zoom-out.
 * Returns disjoint regions, so semitransparent pixels never accumulate twice during refinement.
 */
export function pageFallback<T extends { page: VirtualPage }>(target: VirtualPage, resident: readonly T[]): T[] {
  const parents = resident.filter((entry) => containsPage(entry.page, target));
  if (parents.length) return [parents.reduce((a, b) => (a.page.level < b.page.level ? a : b))];
  return disjointPages(resident.filter((entry) => containsPage(target, entry.page)));
}

/** Keeps the coarsest page wherever a batch contains both an ancestor and its descendants. */
export function disjointPages<T extends { page: VirtualPage }>(entries: readonly T[]): T[] {
  return entries.filter(
    (entry) =>
      !entries.some(
        (other) => other !== entry && other.page.level > entry.page.level && containsPage(other.page, entry.page)
      )
  );
}

function containsPage(parent: VirtualPage, child: VirtualPage) {
  if (parent.layerId !== child.layerId || parent.level < child.level) return false;
  const ratio = 2 ** (parent.level - child.level);
  return Math.floor(child.x / ratio) === parent.x && Math.floor(child.y / ratio) === parent.y;
}
