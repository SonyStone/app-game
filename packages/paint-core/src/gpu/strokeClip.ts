import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import { TILE_SIZE } from '../brush';
import { isSelected, tileCoverage, type SelectionMask } from '../selectionMask';
import { fullscreenVertex } from './shaders';
import { tileCoordinates, type StrokeScratch } from './tileTextures';

/**
 * Keeps a stroke inside the selection: after a stroke composites into a tile, `restore` mixes the tile's base pixels
 * back in proportion to how little the selection covers each pixel, so every brush engine, retouch tool and eraser
 * paints only inside it, and fades across a feathered edge. Masks are uploaded once per tile for the stroke. Tiles
 * wholly outside are refused by `allows`, so the stroke never touches them; tiles wholly inside need no pass.
 */
export function createStrokeClip(root: TgpuRoot) {
  /** Made on the first restore, so a renderer that never clips allocates nothing. */
  let pipeline: ReturnType<typeof createPipeline> | undefined;
  const createPipeline = () =>
    root.createRenderPipeline({ vertex: fullscreenVertex, fragment: clipFragment, targets: { format: 'rgba8unorm' } });
  /** The step's result, copied so that one pass mixes it with the base and rounds once. */
  let result: ReturnType<typeof createResultTexture> | undefined;
  let selection: SelectionMask | undefined;
  const masks = new Map<string, { kind: 'outside' | 'inside' } | { kind: 'partial'; texture: MaskTexture }>();
  /** Bind groups by tile key, for the base texture they were made with. */
  const groups = new Map<string, { base: unknown; group: ReturnType<typeof bind> }>();
  const bind = (base: BaseTexture, mask: MaskTexture) =>
    root.createBindGroup(clipLayout, { base, mask, result: result! });

  return {
    /** Clips the strokes that follow to the selection `next`, or stops clipping without one. */
    set(next: SelectionMask | undefined) {
      release();
      selection = next && isSelected(next) ? next : undefined;
    },
    /** Whether strokes are clipped now. */
    active: () => selection !== undefined,
    /** Whether the stroke may touch tile `key`: always without a selection, otherwise if the selection reaches it. */
    allows(key: string) {
      return !selection || maskOf(key).kind !== 'outside';
    },
    /**
     * Encodes the pass that mixes `base`, the tile's pixels before this paint step, back where the selection does not
     * wholly cover, within `region` of the tile `key`, whose texture is `tile.texture` and level-0 view `tile.render`.
     * Pixels the step left unchanged stay exactly as they were. Does nothing without a selection or inside it.
     */
    restore(
      encoder: GPUCommandEncoder,
      tile: { texture: BaseTexture; render: GPUTextureView },
      base: BaseTexture,
      key: string,
      region: { x: number; y: number; width: number; height: number }
    ) {
      if (!selection) {
        return;
      }

      const mask = maskOf(key);
      if (mask.kind !== 'partial') {
        return;
      }

      result ??= createResultTexture(root);
      const origin = { x: region.x, y: region.y };
      encoder.copyTextureToTexture(
        { texture: root.unwrap(tile.texture), origin },
        { texture: root.unwrap(result), origin },
        [region.width, region.height]
      );
      let cached = groups.get(key);
      if (!cached || cached.base !== base) {
        cached = { base, group: bind(base, mask.texture) };
        groups.set(key, cached);
      }

      pipeline ??= createPipeline();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: tile.render, loadOp: 'load', storeOp: 'store' }]
      });
      pass.setScissorRect(region.x, region.y, region.width, region.height);
      pipeline.with(pass).with(cached.group).draw(3);
      pass.end();
    },
    /** GPU memory of the stroke's masks. */
    bytes: () =>
      [...masks.values()].filter(({ kind }) => kind === 'partial').length * TILE_SIZE * TILE_SIZE +
      (result ? TILE_SIZE * TILE_SIZE * 4 : 0),
    destroy() {
      release();
      result?.destroy();
      result = undefined;
    }
  };

  /** The mask of tile `key`, made on first use; partial masks are uploaded to the GPU. */
  function maskOf(key: string) {
    let mask = masks.get(key);
    if (!mask) {
      const [tx, ty] = tileCoordinates(key);
      const made = tileCoverage(selection!, tx, ty);
      if (made.kind === 'partial') {
        const texture = createMaskTexture(root);
        root.device.queue.writeTexture(
          { texture: root.unwrap(texture) },
          made.coverage as Uint8Array<ArrayBuffer>,
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

/** An R8 selection coverage of one tile, 1 wholly selected. */
function createMaskTexture(root: TgpuRoot) {
  return root.createTexture({ size: [TILE_SIZE, TILE_SIZE], format: 'r8unorm' }).$usage('sampled');
}

type MaskTexture = ReturnType<typeof createMaskTexture>;
type BaseTexture = StrokeScratch['base'];

/** A tile-sized copy of a paint step's result. */
function createResultTexture(root: TgpuRoot) {
  return root.createTexture({ size: [TILE_SIZE, TILE_SIZE], format: 'rgba8unorm' }).$usage('sampled');
}

const clipLayout = tgpu.bindGroupLayout({
  base: { texture: d.texture2d() },
  mask: { texture: d.texture2d() },
  result: { texture: d.texture2d() }
});

/** The step's result where the selection covers the tile, the base where it does not, mixed across soft edges. */
export const clipFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const pixel = d.vec2i(input.position.xy);
  const covered = std.textureLoad(clipLayout.$.mask, pixel, 0).x;
  return std.mix(std.textureLoad(clipLayout.$.base, pixel, 0), std.textureLoad(clipLayout.$.result, pixel, 0), covered);
});
