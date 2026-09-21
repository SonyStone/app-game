import { err, ok, Result, ResultAsync, safeTry } from 'neverthrow';
import { checkAborted, documentError, errorMessage, type ResultValue } from '../../shared/errors';
import atlasUrl from './assets/atlas.bmp?url';
import atlasVerticesUrl from './assets/atlasverts.bmp?url';
import glyphsUrl from './assets/glyphs.bmp?url';
import imageVerticesUrl from './assets/imageverts.bmp?url';
import pagesUrl from './assets/pages.json?url';
import { decodeGlyphs } from './decodeGlyphs';
import { unpackBmp } from './unpackBmp';

/** Loads bundled assets as a typed result. The caller owns bitmaps; failure and cancellation close partial images. */
export async function loadDocument(signal?: AbortSignal) {
  const images = new Map<string, ImageBitmap>();

  const result = await safeTry(async function* () {
    yield* checkAborted(signal);

    const [glyphs, atlas, atlasVertices, imageVertices, metadata] = yield* await ResultAsync.combine([
      readBmp(glyphsUrl, signal),
      readBmp(atlasUrl, signal),
      readBmp(atlasVerticesUrl, signal),
      readBmp(imageVerticesUrl, signal),
      readAsset(pagesUrl, signal).andThen((response) =>
        ResultAsync.fromThrowable(
          () => response.json() as Promise<PageMetadata[]>,
          (cause) => documentError('decode', errorMessage(cause), cause)
        )()
      )
    ]);

    const names = yield* Result.fromThrowable(
      () => new Set(metadata.flatMap((page) => page.images.map((image) => image.filename))),
      (cause) => documentError('invalid-data', 'Invalid page metadata', cause)
    )();

    for (const name of names) {
      const image = yield* await readAsset(new URL(`images/${name}`, window.location.href).href, signal).andThen(
        (response) =>
          ResultAsync.fromThrowable(
            async () =>
              createImageBitmap(await response.blob(), {
                premultiplyAlpha: 'none',
                colorSpaceConversion: 'none'
              }),
            (cause) => documentError('decode', errorMessage(cause), cause)
          )()
      );
      images.set(name, image);
    }

    yield* checkAborted(signal);

    const { vertices, positions } = yield* decodeGlyphs(glyphs);
    const pages = yield* layoutPages(metadata, 2);

    return ok({
      glyphVertices: vertices,
      positions,
      atlas,
      atlasVertices,
      imageVertices: imageVertices.buf,
      pages,
      images
    });
  });

  // Fetch may report cancellation as a rejection; normalize it before exposing the result.
  const active = checkAborted(signal);
  if (result.isErr() || active.isErr()) {
    images.forEach((image) => image.close());
  }

  return active.isErr() ? err(active.error) : result;
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

  return ok(metadata.map((page, i) => ({ ...page, x: -(i % columns) * 1.06, y: Math.floor(i / columns) * 1.06 })));
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

/** Contains both synchronous fetch errors and rejected requests at the browser boundary. */
function readAsset(url: string, signal?: AbortSignal) {
  return ResultAsync.fromThrowable(
    () => fetch(url, { signal }),
    (cause) => documentError('load', errorMessage(cause), cause)
  )().andThen((response) =>
    response.ok ? ok(response) : err(documentError('http', `Unable to load document data (${response.status}): ${url}`))
  );
}

function readBmp(url: string, signal?: AbortSignal) {
  return readAsset(url, signal)
    .andThen((response) =>
      ResultAsync.fromThrowable(
        () => response.arrayBuffer(),
        (cause) => documentError('decode', errorMessage(cause), cause)
      )()
    )
    .andThen(unpackBmp);
}
