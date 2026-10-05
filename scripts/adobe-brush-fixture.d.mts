/**
 * Returns the bytes of an Adobe brush pack, downloading it once into the ignored `.tmp/adobe-brushes` cache.
 * Rejects unpinned filenames, HTTP failures, timeouts (`ADOBE_BRUSH_TIMEOUT_MS`) and bytes whose SHA-256 differs from
 * `adobe-brush-fixtures.json`. Concurrent callers, including parallel test workers, share one download.
 */
export function readAdobeBrushFixture(filename: string): Promise<Buffer>;

/** Pinned SHA-256 digests by filename, from `adobe-brush-fixtures.json`. */
export const adobeBrushFixtureDigests: Readonly<Record<string, string>>;

/** Absolute path of the ignored fixture cache, ending with a separator; derived fixtures may use subdirectories. */
export const adobeBrushCacheDirectory: string;
