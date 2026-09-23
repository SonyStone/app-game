import { pageTileKey, type PageTile } from './pageTiles';

/**
 * During zoom-out, cover four missing fine regions with one intermediate tile first.
 * That tile often becomes the exact requested LOD a few frames later. Zoom-in keeps
 * requesting full detail. `source` carries the original request's waiting time.
 */
export function planPageRefinement(tiles: Iterable<PageTile>, resident: (key: string) => boolean, zoomingOut: boolean) {
  const coverage = new Map<string, { tile: PageTile; source: string }>();
  const detail: { tile: PageTile; source: string }[] = [];

  for (const tile of tiles) {
    const source = pageTileKey(tile);
    const base = { page: tile.page, level: 0, x: 0, y: 0 };
    const baseKey = pageTileKey(base);
    if (tile.level > 0 && !resident(baseKey)) {
      if (!coverage.has(baseKey)) coverage.set(baseKey, { tile: base, source });
      detail.push({ tile, source });
      continue;
    }
    if (zoomingOut && tile.level > 1 && !resident(source)) {
      const parent = { page: tile.page, level: tile.level - 1, x: Math.floor(tile.x / 2), y: Math.floor(tile.y / 2) };
      const key = pageTileKey(parent);
      if (!resident(key)) {
        if (!coverage.has(key)) {
          coverage.set(key, { tile: parent, source });
        }
        continue;
      }
    }
    detail.push({ tile, source });
  }

  return [...coverage.values(), ...detail];
}
