/**
 * Chooses up to `count` least-recently-used resident tiles to evict. Tiles in `pinned` are never chosen: a render
 * batch pins the members it already loaded but has not drawn yet, so loading the rest of that batch cannot recycle
 * them, even when the batch is as large as the resident limit and eviction works in larger groups.
 */
export function evictionVictims<Tile extends { used: number }>(
  cache: ReadonlyMap<string, Tile>,
  count: number,
  pinned?: ReadonlySet<string>
): [string, Tile][] {
  return [...cache]
    .filter(([id]) => !pinned?.has(id))
    .sort((a, b) => a[1].used - b[1].used)
    .slice(0, count);
}
