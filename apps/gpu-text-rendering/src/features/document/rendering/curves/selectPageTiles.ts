import { pageTileKey, type PageTile } from './pageTiles';

/** A resident composed tile; revisions change when source image detail changes. */
export type ResidentPageTile = { tile: PageTile; revision: number; readyAt: number };

/**
 * Covers requested tiles with resident ancestors, then retains sharper descendants on zoom-out.
 * Stale descendants never cover a refreshed ancestor. Adequate ready LOD replaces oversized detail;
 * parents remain behind fading new tiles.
 */
export function selectPageTiles<T extends ResidentPageTile>(
  wanted: ReadonlyMap<string, PageTile>,
  entries: ReadonlyMap<string, T>,
  revisions: ReadonlyMap<number, number>,
  now: number,
  fadeMs: number
) {
  const selected = new Map<string, T>();

  for (const tile of wanted.values()) {
    let ancestor = tile;

    while (true) {
      const key = pageTileKey(ancestor);
      const entry = entries.get(key);

      if (entry) {
        selected.set(key, entry);

        if (now - entry.readyAt >= fadeMs) {
          break;
        }
      }

      if (ancestor.level === 0) {
        break;
      }

      ancestor = parentTile(ancestor);
    }
  }

  for (const [key, entry] of entries) {
    if (selected.has(key) || entry.revision !== (revisions.get(entry.tile.page) ?? 0)) {
      continue;
    }

    let ancestor = entry.tile;

    while (ancestor.level > 0) {
      ancestor = parentTile(ancestor);

      const ancestorKey = pageTileKey(ancestor);
      if (wanted.has(ancestorKey)) {
        const target = entries.get(ancestorKey);
        if (!target || target.revision !== entry.revision || now - target.readyAt < fadeMs) {
          selected.set(key, entry);
        }
        break;
      }
    }
  }

  return [...selected.values()].sort((a, b) => a.tile.level - b.tile.level);
}

function parentTile(tile: PageTile): PageTile {
  return { page: tile.page, level: tile.level - 1, x: Math.floor(tile.x / 2), y: Math.floor(tile.y / 2) };
}
