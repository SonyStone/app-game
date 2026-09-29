import { useGpuCanvas } from '../../../shared/gpu/GpuCanvasProvider';
import { onGpuRelease } from '../../../shared/gpu/onGpuRelease';
import { buildCoverage } from '../documentWorkerProtocol';
import { createCurveRenderer } from './createTypeGpuRenderer';
import { createRasterWorker } from './curves/createRasterWorker';
import { DocumentEngine } from './DocumentEngine';
import { useDocumentRenderer } from './DocumentRenderer';
import type { DocumentWorkers } from './DocumentWorkers';

/**
 * Engine for curve documents, such as imported PDFs: vector outlines, streamed images, transparency groups and cached
 * page tiles. Owns the image decoder and coverage workers until unmount or GPU release. Mount beneath
 * DocumentRenderer with a curve document; other kinds are a programming error.
 */
export function VectorArtwork(props: {
  /** Paint every page directly instead of using cached page tiles, for diagnostics. Default false. */
  vectorOnly?: boolean;
  /** Higher values draw on top; equal values follow JSX order. Default 0. */
  order?: number;
  /** Skip drawing while retaining the prepared renderer. Default true. */
  visible?: boolean;
}) {
  const { document } = useDocumentRenderer();

  if (document.kind !== 'curves') {
    throw new Error('VectorArtwork draws curve documents; use GlyphText for glyph documents');
  }

  const raster = createRasterWorker();
  const abort = new AbortController();
  const workers: DocumentWorkers = {
    raster,
    coverage: (input) => buildCoverage(input, { signal: abort.signal })
  };

  onGpuRelease(useGpuCanvas().signal, () => {
    abort.abort();
    raster.destroy();
  });

  return (
    <DocumentEngine
      create={(gpu, options) => createCurveRenderer(gpu, document, { ...options, workers })}
      vectorOnly={props.vectorOnly}
      order={props.order}
      visible={props.visible}
    />
  );
}
