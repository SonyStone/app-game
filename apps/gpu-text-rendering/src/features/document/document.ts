import { err, ok } from 'neverthrow';
import type { ResultValue } from '../../shared/errors';
import demoUrl from './assets/demo.gdoc?url';
import type { OnDocumentProgress } from './documentProgress';
import { readGdoc } from './format/readGdoc';
import { layoutPages as layoutDocumentPages } from './layoutPages';
import { readDocumentSource, type ExportDocument } from './readDocumentSource';

/** Loads a selected PDF/GDOC or the bundled demo through Rust/WASM in a cancellable Worker, then lays out its pages. */
export async function loadDocument(
  signal?: AbortSignal,
  file?: File,
  onConverted?: (exportDocument: ExportDocument) => void,
  onProgress?: OnDocumentProgress
) {
  const source = file ? await readDocumentSource(file, signal, onConverted, onProgress) : ok(demoUrl);

  if (source.isErr()) {
    return err(source.error);
  }

  const result =
    typeof source.value === 'string' || source.value instanceof ArrayBuffer
      ? await readGdoc(source.value, signal, onProgress)
      : ok(source.value);

  return result.andThen((data) =>
    layoutPages(data.pages, 2).map((pages) => ({
      ...data,
      pages,
      imageVertices: new ArrayBuffer(0),
      images: new Map<string, ImageBitmap>()
    }))
  );
}

/** Decoded document in normalized page coordinates, independent of GPU resources. */
export type TextDocument = ResultValue<Awaited<ReturnType<typeof loadDocument>>>;

/** A page's contiguous vertex range and optional image draws. */
export type PageMetadata = {
  width: number;
  height: number;
  beginVertex: number;
  endVertex: number;
  images: { filename: string; vertexOffset: number; numVerts: number }[];
};

/** Lays out every page without changing placement during viewport resizing. */
export function layoutPages(metadata: readonly PageMetadata[], viewportAspect: number) {
  return layoutDocumentPages(metadata, viewportAspect);
}

/** Produces page backgrounds as one triangle strip with degenerate joins. */
export function pageVertices(document: TextDocument) {
  const vertices = new Float32Array(document.pages.length * 12);
  const first = document.pages[0]!;

  document.pages.forEach((page, i) => {
    const x = -page.x,
      y = page.y;
    const right = x + page.width / first.width,
      bottom = y + page.height / first.height;

    vertices.set([x, y, x, y, right, y, x, bottom, right, bottom, right, bottom], i * 12);
  });

  return vertices;
}
