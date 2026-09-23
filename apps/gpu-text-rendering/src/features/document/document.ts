import { err, ok } from 'neverthrow';
import { documentError, type ResultValue } from '../../shared/errors';
import demoUrl from './assets/demo.gdoc?url';
import { readGdoc } from './format/readGdoc';
import { readDocumentSource } from './readDocumentSource';

/** Loads a selected PDF/GDOC or the bundled demo through Rust/WASM in a cancellable Worker, then lays out its pages. */
export async function loadDocument(signal?: AbortSignal, file?: File, onConverted?: (file: File) => void) {
  const source = file ? await readDocumentSource(file, signal, onConverted) : ok(demoUrl);

  if (source.isErr()) {
    return err(source.error);
  }

  const result = await readGdoc(source.value, signal);

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

/** Lays out pages once; resizing the viewport never moves them. */
export function layoutPages(metadata: readonly PageMetadata[], viewportAspect: number) {
  const first = metadata[0];
  if (!first) {
    return err(documentError('invalid-data', 'The document has no pages'));
  }

  const columns = Math.max(1, Math.floor(Math.sqrt((metadata.length * viewportAspect * first.height) / first.width)));

  const widths = Array.from({ length: columns }, () => 1);
  const heights = Array.from({ length: Math.ceil(metadata.length / columns) }, () => 1);

  metadata.forEach((page, i) => {
    widths[i % columns] = Math.max(widths[i % columns]!, page.width / first.width);
    const row = Math.floor(i / columns);
    heights[row] = Math.max(heights[row]!, page.height / first.height);
  });

  // Keep uniform demo placement byte-for-byte stable, adding space only for larger pages.
  const offsets = (sizes: number[]) => {
    let extra = 0;
    return sizes.map((size, i) => {
      const position = i * 1.06 + extra;
      extra += size - 1;
      return position;
    });
  };
  const x = offsets(widths);
  const y = offsets(heights);

  return ok(metadata.map((page, i) => ({ ...page, x: -x[i % columns]!, y: y[Math.floor(i / columns)]! })));
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
