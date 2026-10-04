import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import { TILE_SIZE } from '../brush';
import type { Point } from '../camera';
import { selectionTileMask } from '../selection';
import { fullscreenVertex } from './shaders';
import { tileCoordinates, type StrokeScratch } from './tileTextures';

/**
 * Keeps a stroke inside the lasso selection: after a stroke composites into a tile, `restore` puts the tile's base
 * pixels back wherever the selection does not cover, so every brush engine, retouch tool and eraser paints only inside
 * it. Masks follow `selectionTileMask`'s pixel-center rule and are made once per tile for the stroke. Tiles wholly
 * outside are refused by `allows`, so the stroke never touches them; tiles wholly inside need no pass.
 */
export function createStrokeClip(root: TgpuRoot) {
  /** Made on the first restore, so a renderer that never clips allocates nothing. */
  let pipeline: ReturnType<typeof createPipeline> | undefined;
  const createPipeline = () =>
    root.createRenderPipeline({ vertex: fullscreenVertex, fragment: clipFragment, targets: { format: 'rgba8unorm' } });
  let points: readonly Point[] | undefined;
  let bounds: { left: number; top: number; right: number; bottom: number } | undefined;
  const masks = new Map<string, { kind: 'outside' | 'inside' } | { kind: 'partial'; texture: MaskTexture }>();
  /** Bind groups by tile key, for the base texture they were made with. */
  const groups = new Map<string, { base: unknown; group: ReturnType<typeof bind> }>();
  const bind = (base: BaseTexture, mask: MaskTexture) => root.createBindGroup(clipLayout, { base, mask });

  return {
    /** Clips the strokes that follow to the closed polygon `next`, in document pixels, or stops clipping. */
    set(next: readonly Point[] | undefined) {
      release();
      points = next && next.length >= 3 ? next.map((point) => ({ ...point })) : undefined;
      bounds = points && {
        left: Math.min(...points.map(({ x }) => x)),
        top: Math.min(...points.map(({ y }) => y)),
        right: Math.max(...points.map(({ x }) => x)),
        bottom: Math.max(...points.map(({ y }) => y))
      };
    },
    /** Whether strokes are clipped now. */
    active: () => points !== undefined,
    /** Whether the stroke may touch tile `key`: always without a selection, otherwise if the selection reaches it. */
    allows(key: string) {
      if (!points || !bounds) {
        return true;
      }

      const [tx, ty] = tileCoordinates(key);
      const left = tx * TILE_SIZE,
        top = ty * TILE_SIZE;
      if (
        left >= bounds.right ||
        left + TILE_SIZE <= bounds.left ||
        top >= bounds.bottom ||
        top + TILE_SIZE <= bounds.top
      ) {
        return false;
      }

      return maskOf(key).kind !== 'outside';
    },
    /**
     * Encodes the pass that puts `base`, the tile's pixels before this paint step, back outside the selection within
     * `region` of the tile `key`, whose level-0 view is `target`. Does nothing without a selection or inside it.
     */
    restore(
      encoder: GPUCommandEncoder,
      target: GPUTextureView,
      base: BaseTexture,
      key: string,
      region: { x: number; y: number; width: number; height: number }
    ) {
      if (!points) {
        return;
      }

      const mask = maskOf(key);
      if (mask.kind !== 'partial') {
        return;
      }

      let cached = groups.get(key);
      if (!cached || cached.base !== base) {
        cached = { base, group: bind(base, mask.texture) };
        groups.set(key, cached);
      }

      pipeline ??= createPipeline();
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }] });
      pass.setScissorRect(region.x, region.y, region.width, region.height);
      pipeline.with(pass).with(cached.group).draw(3);
      pass.end();
    },
    /** GPU memory of the stroke's masks. */
    bytes: () => [...masks.values()].filter(({ kind }) => kind === 'partial').length * TILE_SIZE * TILE_SIZE,
    destroy: release
  };

  /** The mask of tile `key`, made on first use; partial masks are uploaded to the GPU. */
  function maskOf(key: string) {
    let mask = masks.get(key);
    if (!mask) {
      const [tx, ty] = tileCoordinates(key);
      const made = selectionTileMask(points!, tx, ty);
      if (made.kind === 'partial') {
        const texture = createMaskTexture(root);
        root.device.queue.writeTexture(
          { texture: root.unwrap(texture) },
          made.mask as Uint8Array<ArrayBuffer>,
          { bytesPerRow: TILE_SIZE },
          [TILE_SIZE, TILE_SIZE]
        );
        mask = { kind: 'partial', texture };
      } else {
        mask = { kind: made.kind };
      }

      masks.set(key, mask);
    }

    return mask;
  }

  function release() {
    for (const mask of masks.values()) {
      if (mask.kind === 'partial') {
        mask.texture.destroy();
      }
    }

    masks.clear();
    groups.clear();
  }
}

/** The renderer's stroke clip. */
export type StrokeClip = ReturnType<typeof createStrokeClip>;

/** An R8 selection mask of one tile, 1 inside the selection. */
function createMaskTexture(root: TgpuRoot) {
  return root.createTexture({ size: [TILE_SIZE, TILE_SIZE], format: 'r8unorm' }).$usage('sampled');
}

type MaskTexture = ReturnType<typeof createMaskTexture>;
type BaseTexture = StrokeScratch['base'];

const clipLayout = tgpu.bindGroupLayout({
  base: { texture: d.texture2d() },
  mask: { texture: d.texture2d() }
});

/** The base pixel wherever the selection does not cover the tile; inside it, the stroke's result stays. */
const clipFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const pixel = d.vec2i(input.position.xy);
  if (std.textureLoad(clipLayout.$.mask, pixel, 0).x > 0.5) {
    std.discard();
  }

  return std.textureLoad(clipLayout.$.base, pixel, 0);
});
