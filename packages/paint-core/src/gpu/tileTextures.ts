import type { AbrTile } from '@app-game/abr-paint/gpu/abrStamps';
import { commandBatch } from '@app-game/abr-paint/gpu/commandBatch';
import { d, type RenderFlag, type TgpuRoot, type TgpuTexture } from 'typegpu';
import { TILE_SIZE } from '../brush';
import { unpackTile } from '../tilePixels';
import * as shader from './shaders';
import type { createTileMipmaps } from './tileMipmaps';

/** Round-brush instances per tile pass; also the ABR per-tile stamp capacity. */
export const STAMP_CAPACITY = 1024;
/** Default resident pixel-tile budget. */
export const MAX_RESIDENT_TILES = 128;

/** Cache and stroke id of a document tile: `${layerId}/${x},${y}`. Tile keys never contain '/'. */
export function tileId(layerId: string, key: string) {
  return `${layerId}/${key}`;
}

/** Parses a tile key `x,y` into integer tile coordinates. */
export function tileCoordinates(key: string): [number, number] {
  const [x, y] = key.split(',').map(Number);
  return [x!, y!];
}

/** A resident, mipmapped document tile with its display binding and optional per-tile brush scratch. */
export type PaintTile = ReturnType<typeof createTile>;

/** Uploads `pixels` (or leaves the tile transparent) into a new mipmapped tile with its own camera uniform. */
export function createTile(
  root: TgpuRoot,
  pixels: Uint8Array | undefined,
  sampler: ReturnType<TgpuRoot['createSampler']>
) {
  const texture = tileTexture(root, true);
  writePixels(root.device, root.unwrap(texture), pixels);
  const camera = root.createBuffer(shader.viewLayout.entries.view.uniform).$usage('uniform');
  return {
    texture,
    render: root.unwrap(texture).createView({ baseMipLevel: 0, mipLevelCount: 1 }),
    mipLevelReady: 0,
    camera,
    viewGroup: root.createBindGroup(shader.viewLayout, { view: camera, image: texture, sampler }),
    strokeDirty: false,
    scratch: undefined as StrokeScratch | undefined,
    used: 0
  };
}

/** Persistent coverage belongs to a pixel tile; sampling tools borrow a separate submitted batch slot. */
export function prepareStroke(root: TgpuRoot, tile: PaintTile) {
  return (tile.scratch ??= createStrokeScratch(root));
}

/** Pre-stroke base, accumulated coverage and stamp instances for rasterizing one tile. */
export type StrokeScratch = ReturnType<typeof createStrokeScratch>;

/**
 * `transmittance` accumulates round and textured stamps as 1 − coverage in r16float: each stamp multiplies it by
 * 1 − alpha, so low-flow build-up keeps relative precision instead of stalling where an 8-bit increment rounds to
 * zero. Every first touch, revisit and tail resets or restores it before stamping. `mask` is the 8-bit coverage that ABR tiles accumulate in, matching
 * Photoshop's 8-bit arithmetic.
 */
export function createStrokeScratch(root: TgpuRoot) {
  const base = tileTexture(root);
  const mask = tileTexture(root);
  const transmittance = root
    .createTexture({ size: [TILE_SIZE, TILE_SIZE], format: 'r16float' })
    .$usage('sampled', 'render');
  return {
    base,
    mask,
    transmittance,
    transmittanceRender: root.unwrap(transmittance).createView(),
    strokeGroup: root.createBindGroup(shader.strokeLayout, { base, transmittance }),
    stamps: root.createBuffer(d.arrayOf(d.vec4f, STAMP_CAPACITY)).$usage('vertex'),
    abr: undefined as AbrTile | undefined
  };
}

/** Texture and instance-buffer footprint; small uniforms/bindings are excluded from this estimate. */
export function scratchBytes(scratch: StrokeScratch) {
  return TILE_SIZE * TILE_SIZE * (4 * 2 + 2) + STAMP_CAPACITY * 16 + (scratch.abr?.bytes() ?? 0);
}

/** Mipmapped tile texture plus any per-tile scratch. */
export function tileBytes(tile: PaintTile) {
  return (TILE_SIZE * TILE_SIZE * 4 * 4) / 3 + (tile.scratch ? scratchBytes(tile.scratch) : 0);
}

export function destroyStrokeScratch(scratch: StrokeScratch) {
  scratch.abr?.destroy();
  scratch.mask.destroy();
  scratch.transmittance.destroy();
  scratch.base.destroy();
  scratch.stamps.destroy();
}

export function destroyTile(tile: PaintTile) {
  if (tile.scratch) {
    destroyStrokeScratch(tile.scratch);
  }

  tile.texture.destroy();
  tile.camera.destroy();
}

/** One reusable full-resolution history-source tile, independent of destination tile-cache eviction. */
export function historyTexture(root: TgpuRoot) {
  return root.createTexture({ size: [TILE_SIZE, TILE_SIZE], format: 'rgba8unorm' }).$usage('sampled', 'render');
}

/** Attachment clears avoid allocating/uploading a viewport-sized CPU array of zeros. */
export function clearAttachment(encoder: GPUCommandEncoder, view: GPUTextureView) {
  encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store' }] }).end();
}

/** Multiplies transmittance by 1 − stamp alpha, the complement of source-over coverage accumulation. */
export const transmittanceBlend = {
  color: { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha' },
  alpha: { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha' }
} as const satisfies GPUBlendState;

/** Resets round-brush transmittance to 1, meaning the stroke covers nothing yet. */
export function clearTransmittance(encoder: GPUCommandEncoder, view: GPUTextureView) {
  encoder
    .beginRenderPass({ colorAttachments: [{ view, clearValue: [1, 1, 1, 1], loadOp: 'clear', storeOp: 'store' }] })
    .end();
}

/** Restores evicted round-brush transmittance from its raw r16float readback, or resets it when absent. */
export function replaceTransmittance(
  device: GPUDevice,
  texture: GPUTexture,
  bytes: Uint8Array | undefined,
  batch: ReturnType<typeof commandBatch> | undefined
) {
  if (bytes) {
    device.queue.writeTexture({ texture }, bytes, { bytesPerRow: TILE_SIZE * 2 }, [TILE_SIZE, TILE_SIZE]);
    return;
  }

  const commands = batch ?? commandBatch(device);
  clearTransmittance(commands.encoder(), texture.createView());
  if (!batch) {
    commands.flush();
  }
}

/** Assigns every level-zero pixel when recycling a slot, including transparent source/base/mask.
 * Pixels upload immediately on the queue; a transparent clear is encoded in `batch` when given.
 */
export function replacePixels(
  device: GPUDevice,
  texture: GPUTexture,
  pixels?: Uint8Array,
  batch?: ReturnType<typeof commandBatch>
) {
  if (pixels) {
    writePixels(device, texture, pixels);
    return;
  }

  const commands = batch ?? commandBatch(device);
  clearAttachment(commands.encoder(), texture.createView({ baseMipLevel: 0, mipLevelCount: 1 }));
  if (!batch) {
    commands.flush();
  }
}

/**
 * Extends a tile's valid mip prefix to `requested` (clamped to its chain). Uses the batched generator when given,
 * encoding into `encoder` if supplied; otherwise TypeGPU's per-level helper submits on its own.
 */
export function createMipmapEnsurer(generate: ReturnType<typeof createTileMipmaps> | undefined) {
  return (
    tile: { texture: TgpuTexture & RenderFlag; mipLevelReady: number },
    requested: number,
    encoder?: GPUCommandEncoder
  ) => {
    const last = Math.max(0, Math.min((tile.texture.props.mipLevelCount ?? 1) - 1, requested));
    if (last <= tile.mipLevelReady) {
      return;
    }

    if (generate) {
      generate(tile.texture, tile.mipLevelReady, last, encoder);
    } else {
      tile.texture.generateMipmaps(tile.mipLevelReady, last - tile.mipLevelReady + 1);
    }

    tile.mipLevelReady = last;
  };
}

function tileTexture(root: TgpuRoot, mipmaps = false) {
  return root
    .createTexture({ size: [TILE_SIZE, TILE_SIZE], format: 'rgba8unorm', mipLevelCount: mipmaps ? 9 : 1 })
    .$usage('sampled', 'render');
}

function writePixels(device: GPUDevice, texture: GPUTexture, pixels?: Uint8Array) {
  if (pixels) {
    device.queue.writeTexture({ texture }, unpackTile(pixels), { bytesPerRow: TILE_SIZE * 4 }, [TILE_SIZE, TILE_SIZE]);
  }
}
