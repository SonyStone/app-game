import {
  readLibrary,
  type AbrSource,
  type Brush,
  type EmbeddedResource,
  type Image,
  type ReadableObject
} from '@app-game/abr-parser';

/** Application brush state. Preset fields come directly from Rust; display IDs are local UI identity. */
export interface BrushAsset {
  id: string;
  name: string;
  preset: Brush;
  tipImage?: Image;
  resources: readonly EmbeddedResource[];
  source: AbrSource;
}
/** Editable library with shared source bytes, encoded resources and decoded primary masks. */
export interface BrushLibrary {
  brushes: BrushAsset[];
  hierarchy: readonly (ReadableObject & { readonly name?: string; readonly uuid?: string })[];
  sources: readonly AbrSource[];
  errors: readonly string[];
}
/** Builds application state from Rust's bulk loader. Call initAbr once before loading. */
export function loadBrushLibrary(bytes: ArrayBuffer | ArrayBufferView, maxDecodedBytes = 268_435_456): BrushLibrary {
  const library = readLibrary(bytes, maxDecodedBytes);
  const images = new Map(library.images.map((item) => [`${item.section}/${item.index}`, item.image]));
  return {
    brushes: library.document.brushes.map((preset, index) => {
      const primary = library.selections[index]?.sample;
      const image = primary ? images.get(`${primary.section}/${primary.index}`) : undefined;
      return {
        id: crypto.randomUUID(),
        name: preset.name ?? 'Unnamed brush',
        preset,
        ...(image ? { tipImage: image } : {}),
        resources: library.resources,
        source: library.document.source
      };
    }),
    hierarchy: library.document.hierarchy,
    sources: [library.document.source],
    errors: library.errors
  };
}

/** Coverage image consumed by renderers; generated tips have no encoded ABR source depth. */
export type BrushTipImage = Pick<Image, 'width' | 'height' | 'depth' | 'data'>;
