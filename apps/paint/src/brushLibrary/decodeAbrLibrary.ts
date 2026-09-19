import type { BrushResource } from '@app-game/abr-paint/resources';
import { initAbr, readLibrary } from '@app-game/abr-parser';
import type { BrushEngineSelection } from '@app-game/paint-core/composition/defineBrushEngine';

/** Imports sampled grayscale tips only. Preset dynamics are deliberately not interpreted as Studio controls. */
export async function decodeAbrLibrary(buffer: ArrayBuffer, name: string): Promise<BrushLibrary> {
  if (buffer.byteLength > MAX_ABR_BYTES) throw new Error('Choose an ABR file smaller than 32 MiB.');
  await initAbr();
  const parsed = readLibrary(buffer, 64 * 1024 * 1024);
  const images = new Map(parsed.images.map((item) => [`${item.section}/${item.index}`, item.image]));
  const libraryId = crypto.randomUUID();
  const tips: BrushResource[] = [];
  const brushes: BrushLibrary['brushes'] = [];
  const seen = new Map<Uint8Array, string>();
  let skipped = 0;
  for (const [index, brush] of parsed.document.brushes.entries()) {
    const resource = parsed.selections[index]?.sample;
    const tip = resource ? images.get(`${resource.section}/${resource.index}`) : undefined;
    if (
      !tip ||
      tip.width > 8192 ||
      tip.height > 8192 ||
      tip.data.byteLength > 32 * 1024 * 1024 ||
      brushes.length >= 1000
    ) {
      skipped++;
      continue;
    }
    let tipId = seen.get(tip.data);
    if (!tipId) {
      tipId = `${libraryId}:${tips.length}`;
      seen.set(tip.data, tipId);
      tips.push({ id: tipId, width: tip.width, height: tip.height, format: 'r8unorm', pixels: tip.data });
    }
    brushes.push({ id: `${libraryId}:brush:${brushes.length}`, name: brush.name ?? 'Unnamed brush', tipId });
  }
  if (!brushes.length) throw new Error(parsed.errors[0] ?? 'This ABR has no supported sampled brush tips.');
  return { name, brushes, tips, skipped, notices: parsed.errors.length };
}

/** One imported library per editor session. Source pixels outlive rendering-mode changes. */
export type BrushLibrary = {
  name: string;
  brushes: { id: string; name: string; tipId: string; angle?: number; engine?: BrushEngineSelection }[];
  tips: BrushResource[];
  skipped: number;
  notices: number;
};
/** Bounds source-file copies as well as parser work; decoded pixels have a separate parser budget. */
export const MAX_ABR_BYTES = 32 * 1024 * 1024;
