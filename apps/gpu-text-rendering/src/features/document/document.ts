import type { ResultValue } from '../../shared/errors';
import type { DecodedDocument } from './format/types';
import type { layoutPages } from './layoutPages';

/** Decoded document with viewer page positions and owned image resources. */
export type TextDocument = PositionedDocument<DecodedDocument>;

type PositionedDocument<Data> = Data extends DecodedDocument
  ? Omit<Data, 'pages'> & {
      pages: ResultValue<ReturnType<typeof layoutPages>>;
      imageVertices: ArrayBuffer;
      images: Map<string, ImageBitmap>;
    }
  : never;

/** A page's contiguous vertex range and optional image draws. */
export type PageMetadata = {
  width: number;
  height: number;
  beginVertex: number;
  endVertex: number;
  images: { filename: string; vertexOffset: number; numVerts: number }[];
};

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
