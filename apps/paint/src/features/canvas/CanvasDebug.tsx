import { TILE_SIZE } from '@app-game/paint-core/brush';
import { worldToScreen, type Camera, type ViewSize } from '@app-game/paint-core/camera';
import type { EnginePaging } from '../engine';
import styles from './CanvasDebug.module.css';

/**
 * Opt-in overlay of occupied raster tiles, drawn as the same two triangles used by tileVertex, of overview pages and
 * of engine statistics. Kept outside the drawing canvas so exports and saved pixels never include debugging graphics.
 */
export function CanvasDebug(props: {
  /** Occupied tile keys, `"x,y"` in tile units. */
  tiles: readonly string[];
  paging: EnginePaging;
  camera: Camera;
  size: ViewSize;
  /** Stored (compressed) and raw size of the document. */
  document: { pixelBytes: number; tileCount: number };
  /** GPU cache bytes. */
  gpuBytes: number;
}) {
  const path = () => tileWireframe(props.tiles, props.camera, props.size);
  const paging = () => props.paging;
  const pagesPath = (state: 'ready' | 'fallback' | 'loading') =>
    (paging().debugPages ?? [])
      .filter((page) => (page.fallback ? 'fallback' : page.resident ? 'ready' : 'loading') === state)
      .map((page) => tileWireframe([`${page.x},${page.y}`], props.camera, props.size, TILE_SIZE * 2 ** page.level))
      .join('');

  return (
    <div class={styles.debug} aria-label="Infinite canvas wireframe">
      <svg width="100%" height="100%" aria-hidden="true">
        <path
          opacity="0.25"
          d={path()}
          fill="none"
          stroke="#1488b8"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
        <path d={pagesPath('ready')} fill="none" stroke="#1b9964" stroke-width="1.5" />
        <path d={pagesPath('fallback')} fill="none" stroke="#e79826" stroke-width="1.5" />
        <path d={pagesPath('loading')} fill="none" stroke="#d05289" stroke-width="1.5" stroke-dasharray="4 4" />
      </svg>
      <output class={styles.debugStats}>
        {props.tiles.length} occupied tiles · 256×256 px · 2 triangles / tile
        <br />
        Document {(props.document.pixelBytes / 1048576).toFixed(2)} MiB stored /{' '}
        {(props.document.tileCount / 4).toFixed(1)} MiB raw
        <br />
        GPU caches {(props.gpuBytes / 1048576).toFixed(1)} MiB
        <br />
        RAM tiles {((paging().storage?.ramBytes ?? 0) / 1048576).toFixed(1)} MiB · overviews{' '}
        {((paging().virtual?.overviewBytes ?? 0) / 1048576).toFixed(1)} MiB
        <br />
        {paging().virtual?.pages ?? 0} GPU pages · {paging().virtual?.drawCalls ?? 0} page draws ·{' '}
        {paging().virtual?.pending ?? 0} loading
        <br />
        LOD {[...new Set(paging().debugPages?.map((page) => page.level) ?? [])].sort((a, b) => a - b).join(', ') ||
          '—'}{' '}
        · uploads {((paging().virtual?.uploadedBytes ?? 0) / 1048576).toFixed(1)} MiB
        <br />
        Tile draws: {paging().rasterDraws?.preview ?? 0} active · {paging().rasterDraws?.committed ?? 0} committed
        <br />
        Pinned overview {paging().virtual?.coveragePages ?? 0} pages · {paging().virtual?.coveragePending ?? 0}{' '}
        preparing
        <br />
        Readback staging {((paging().readback?.bytes ?? 0) / 1048576).toFixed(1)} MiB ·{' '}
        {paging().readback?.pending ?? 0}/2 pending · {paging().readback?.capacityWaits ?? 0} capacity waits
        <br />
        Page jobs {paging().virtual?.activePageJobs ?? 0}/2 · budget yields {paging().virtual?.workYields ?? 0}
        <br />
        Peak / 16ms window: CPU {(paging().virtual?.peakWorkCpuMs ?? 0).toFixed(1)} ms · upload{' '}
        {((paging().virtual?.peakUploadBytes ?? 0) / 1048576).toFixed(2)} MiB
        <br />
        Disk reads {paging().storage?.reads ?? 0} · writes {paging().storage?.writes ?? 0}
        <br />
        Low-res disk {paging().storage?.overviewReads ?? 0} reads · {paging().storage?.overviewWrites ?? 0} writes
        <br />
        Green: resident · amber: coarse fallback · pink: loading
      </output>
    </div>
  );
}

/** Projects occupied tiles into CSS pixels as SVG path data, culling tiles outside the viewport. */
export function tileWireframe(keys: readonly string[], camera: Camera, size: ViewSize, span = TILE_SIZE): string {
  const paths: string[] = [];
  for (const key of keys) {
    const [tx, ty] = key.split(',').map(Number);
    const x = tx! * span;
    const y = ty! * span;
    const points = [
      [x, y],
      [x + span, y],
      [x + span, y + span],
      [x, y + span]
    ].map(([x, y]) => worldToScreen({ x: x!, y: y! }, camera, size));
    const outside =
      points.every((p) => p.x < 0) ||
      points.every((p) => p.x > size.width) ||
      points.every((p) => p.y < 0) ||
      points.every((p) => p.y > size.height);
    if (outside) {
      continue;
    }

    const coords = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    paths.push(`M${coords.join('L')}ZM${coords[1]}L${coords[3]}`);
  }

  return paths.join('');
}
