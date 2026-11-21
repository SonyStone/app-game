import { readPaintFile } from '@app-game/paint-core/paintFile';
import { unpackTile } from '@app-game/paint-core/tilePixels';

/** Undo may change PSD edit timestamps and tile insertion order. Compare drawing state and pixels by tile key. */
export async function equalDocuments(a: Blob, b: Blob) {
  const left = await readPaintFile(a),
    right = await readPaintFile(b);
  if (
    JSON.stringify(left.psdIdentity?.creation) !== JSON.stringify(right.psdIdentity?.creation) ||
    left.linearBlending !== right.linearBlending ||
    JSON.stringify(left.features) !== JSON.stringify(right.features) ||
    left.activeId !== right.activeId ||
    JSON.stringify(left.camera) !== JSON.stringify(right.camera) ||
    left.layers.length !== right.layers.length
  ) {
    return false;
  }
  return left.layers.every(({ tiles, ...info }, index) => {
    const { tiles: other, ...otherInfo } = right.layers[index]!;
    if (
      left.psdIdentity?.layers[info.id]?.id !== right.psdIdentity?.layers[otherInfo.id]?.id ||
      JSON.stringify(info) !== JSON.stringify(otherInfo) ||
      tiles.size !== other.size
    ) {
      return false;
    }
    return [...tiles].every(([key, data]) => {
      const match = other.get(key);
      if (!match) {
        return false;
      }
      const pixels = unpackTile(match);
      return unpackTile(data).every((value, at) => value === pixels[at]);
    });
  });
}
