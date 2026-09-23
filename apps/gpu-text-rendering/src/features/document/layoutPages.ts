import { err, ok } from 'neverthrow';
import { documentError } from '../../shared/errors';
import type { PageMetadata } from './document';

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
