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
        <path d={path()} fill="none" stroke="#1488b8" stroke-width="1" vector-effect="non-scaling-stroke" />
      </svg>
      <output class="paint-debug-stats">
        {props.session.debugTiles().length} occupied tiles · 256×256 px · 2 triangles / tile
        <br />
        Document {(props.session.state().pixelBytes / 1048576).toFixed(2)} MiB stored /{' '}
        {(props.session.state().tileCount / 4).toFixed(1)} MiB raw
        <br />
        GPU cache {(props.session.metrics().gpu / 1048576).toFixed(1)} MiB
      </output>
    </div>
  );
}

/** Projects occupied tiles into CSS pixels, culling outside the current viewport. */
export function tileWireframe(keys: readonly string[], camera: Camera, size: ViewSize): string {
  const paths: string[] = [];
  for (const key of keys) {
    const [tx, ty] = key.split(',').map(Number);
    const x = tx! * TILE_SIZE,
      y = ty! * TILE_SIZE;
    const points = [
      [x, y],
      [x + TILE_SIZE, y],
      [x + TILE_SIZE, y + TILE_SIZE],
      [x, y + TILE_SIZE]
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
