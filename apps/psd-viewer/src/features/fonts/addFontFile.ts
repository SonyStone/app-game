import { fontFileFaces } from '@app-game/psd/fontFile';
import type { PsdFontInfo, PsdFontLibrary, PsdResult } from '@app-game/psd/viewer';

/** A supplied face's availability for imported cache mixing and for the optional text rerasterizer. */
export type SessionFont = PsdFontInfo & {
  /** Original index in the supplied file, zero for standalone fonts. */
  faceIndex: number;
  /** User-selected file or Local Font Access source identifier. */
  provenance: string;
  /** Whether WASM accepted the original face for imported cache mixing. */
  active: boolean;
  /** Whether this face is also available for rerasterizing edited text. */
  raster: boolean;
  /** Why imported validation abstains, for example unsupported CFF outlines. */
  validationError?: string;
};

/**
 * Registers every face using the original bytes and collection index, checking WASM's returned PostScript identity.
 * Standalone files also populate the existing raster font library. Collections remain original and are never split.
 * CFF faces stay available to the standalone rerasterizer where supported and report their validation limitation.
 */
export function addFontFile(
  library: PsdFontLibrary,
  bytes: ArrayBuffer,
  provenance: string
): PsdResult<SessionFont[]> {
  try {
    const faces = fontFileFaces(new Uint8Array(bytes));
    const collection = new DataView(bytes).getUint32(0) === 0x74746366;
    const added = faces.map((face): SessionFont => {
      const validation = library.addActiveFace(bytes, face.faceIndex, provenance);
      if (validation.ok && validation.value !== face.name) {
        throw new Error(`font identity mismatch: expected ${face.name}, received ${validation.value}`);
      }

      const raster = collection ? undefined : library.add(bytes);
      if (raster?.ok && raster.value.name !== face.name) {
        throw new Error(`raster font identity mismatch: expected ${face.name}, received ${raster.value.name}`);
      }

      return {
        ...face,
        size: bytes.byteLength,
        provenance,
        active: validation.ok,
        raster: raster?.ok ?? false,
        ...(!validation.ok ? { validationError: validation.error.message } : {})
      };
    });
    return { ok: true, value: added };
  } catch (error) {
    return { ok: false, error: { kind: 'invalid', message: error instanceof Error ? error.message : String(error) } };
  }
}
