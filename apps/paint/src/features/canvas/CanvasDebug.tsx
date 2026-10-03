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
  const pagesPath = (state: 'ready' | 'fallback' | 'loading') =>
    (props.paging.debugPages ?? [])
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
        RAM tiles {((props.paging.storage?.ramBytes ?? 0) / 1048576).toFixed(1)} MiB · overviews{' '}
        {((props.paging.virtual?.overviewBytes ?? 0) / 1048576).toFixed(1)} MiB
        <br />
        {props.paging.virtual?.pages ?? 0} GPU pages · {props.paging.virtual?.drawCalls ?? 0} page draws ·{' '}
        {props.paging.virtual?.pending ?? 0} loading
        <br />
        LOD{' '}
        {[...new Set(props.paging.debugPages?.map((page) => page.level) ?? [])].sort((a, b) => a - b).join(', ') ||
          '—'}{' '}
        · uploads {((props.paging.virtual?.uploadedBytes ?? 0) / 1048576).toFixed(1)} MiB
        <br />
        Tile draws: {props.paging.rasterDraws?.preview ?? 0} active · {props.paging.rasterDraws?.committed ?? 0}{' '}
        committed
        <br />
        Pinned overview {props.paging.virtual?.coveragePages ?? 0} pages · {props.paging.virtual?.coveragePending ?? 0}{' '}
        preparing
        <br />
        Readback staging {((props.paging.readback?.bytes ?? 0) / 1048576).toFixed(1)} MiB ·{' '}
        {props.paging.readback?.pending ?? 0}/2 pending · {props.paging.readback?.capacityWaits ?? 0} capacity waits
        <br />
        Page jobs {props.paging.virtual?.activePageJobs ?? 0}/2 · budget yields {props.paging.virtual?.workYields ?? 0}
        <br />
        Peak / 16ms window: CPU {(props.paging.virtual?.peakWorkCpuMs ?? 0).toFixed(1)} ms · upload{' '}
        {((props.paging.virtual?.peakUploadBytes ?? 0) / 1048576).toFixed(2)} MiB
        <br />
        Disk reads {props.paging.storage?.reads ?? 0} · writes {props.paging.storage?.writes ?? 0}
        <br />
        Low-res disk {props.paging.storage?.overviewReads ?? 0} reads · {props.paging.storage?.overviewWrites ?? 0}{' '}
        writes
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
