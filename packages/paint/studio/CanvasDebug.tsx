import { TILE_SIZE } from './brush';
import { worldToScreen, type Camera, type ViewSize } from './camera';
import type { PaintSession } from './createPaintSession';

/** Opt-in overlay of occupied raster tiles and the same two triangles used by tileVertex.
 * Kept outside the drawing canvas so exports and saved pixels never include debugging graphics.
 */
export function CanvasDebug(props: { session: PaintSession }) {
  const path = () => tileWireframe(props.session.debugTiles(), props.session.camera(), props.session.size());
  return (
    <div class="paint-debug" aria-label="Infinite canvas wireframe">
      <svg width="100%" height="100%" aria-hidden="true">
        <path
          opacity="0.25"
          d={path()}
          fill="none"
          stroke="#1488b8"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
        <path d={pagesPath(props.session, 'ready')} fill="none" stroke="#1b9964" stroke-width="1.5" />
        <path d={pagesPath(props.session, 'fallback')} fill="none" stroke="#e79826" stroke-width="1.5" />
        <path
          d={pagesPath(props.session, 'loading')}
          fill="none"
          stroke="#d05289"
          stroke-width="1.5"
          stroke-dasharray="4 4"
        />
      </svg>
      <output class="paint-debug-stats">
        {props.session.debugTiles().length} occupied tiles · 256×256 px · 2 triangles / tile
        <br />
        Document {(props.session.state().pixelBytes / 1048576).toFixed(2)} MiB stored /{' '}
        {(props.session.state().tileCount / 4).toFixed(1)} MiB raw
        <br />
        GPU caches {(props.session.metrics().gpu / 1048576).toFixed(1)} MiB
        <br />
        RAM tiles {((props.session.paging().storage?.ramBytes ?? 0) / 1048576).toFixed(1)} MiB · overviews{' '}
        {((props.session.paging().virtual?.overviewBytes ?? 0) / 1048576).toFixed(1)} MiB
        <br />
        {props.session.paging().virtual?.pages ?? 0} GPU pages · {props.session.paging().virtual?.drawCalls ?? 0} page
        draws · {props.session.paging().virtual?.pending ?? 0} loading
        <br />
        LOD{' '}
        {[...new Set(props.session.paging().debugPages?.map((page) => page.level) ?? [])]
          .sort((a, b) => a - b)
          .join(', ') || '—'}{' '}
        · uploads {((props.session.paging().virtual?.uploadedBytes ?? 0) / 1048576).toFixed(1)} MiB
        <br />
        Pinned overview {props.session.paging().virtual?.coveragePages ?? 0} pages ·{' '}
        {props.session.paging().virtual?.coveragePending ?? 0} preparing
        <br />
        Disk reads {props.session.paging().storage?.reads ?? 0} · writes {props.session.paging().storage?.writes ?? 0}
        <br />
        Low-res disk {props.session.paging().storage?.overviewReads ?? 0} reads ·{' '}
        {props.session.paging().storage?.overviewWrites ?? 0} writes
        <br />
        Green: resident · amber: coarse fallback · pink: loading
      </output>
    </div>
  );
}

/** Projects occupied tiles into CSS pixels, culling outside the current viewport. */
export function tileWireframe(keys: readonly string[], camera: Camera, size: ViewSize, span = TILE_SIZE): string {
  const paths: string[] = [];
  for (const key of keys) {
    const [tx, ty] = key.split(',').map(Number);
    const x = tx! * span,
      y = ty! * span;
    const points = [
      [x, y],
      [x + span, y],
      [x + span, y + span],
      [x, y + span]
    ].map(([x, y]) => worldToScreen({ x: x!, y: y! }, camera, size));
    if (
      points.every((p) => p.x < 0) ||
      points.every((p) => p.x > size.width) ||
      points.every((p) => p.y < 0) ||
      points.every((p) => p.y > size.height)
    )
      continue;
    const coords = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    paths.push(`M${coords.join('L')}ZM${coords[1]}L${coords[3]}`);
  }
  return paths.join('');
}

function pagesPath(session: PaintSession, state: 'ready' | 'fallback' | 'loading') {
  return (session.paging().debugPages ?? [])
    .filter((page) => (page.fallback ? 'fallback' : page.resident ? 'ready' : 'loading') === state)
    .map((page) =>
      tileWireframe([`${page.x},${page.y}`], session.camera(), session.size(), TILE_SIZE * 2 ** page.level)
    )
    .join('');
}
