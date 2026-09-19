import { TILE_SIZE } from '../input';
import { commandBatch } from './commandBatch';

/** Captures only the channels sampled by this stroke. Layout is fixed before asynchronous readback. */
export function abrCoveragePlan(options: { mask: boolean; dual: boolean; scale: number; transient: boolean }) {
  const side = TILE_SIZE / options.scale;
  if (![1, 2, 4, 8].includes(options.scale)) throw new Error('Unsupported ABR coverage scale.');
  const channels: { channel: Channel; side: number }[] = options.transient ? [] : [
    ...(options.mask ? [{ channel: 'mask' as const, side }] : []),
    { channel: 'paint', side },
    ...(options.dual ? [{ channel: 'dual' as const, side: TILE_SIZE }] : [])
  ];
  return {
    /** Number of mask readbacks per destination, excluding the host-owned output tile. */
    count: channels.length,
    /** Borrowed sources; the host must submit copies before recycling their scratch. */
    sources: (coverage: AbrCoverage) => channels.map(({ channel, side }) => ({ texture: coverage.textures[channel], side })),
    /** Retains owned readback bytes without copying. Full tiles may use the host's lossless codec. */
    snapshot(pixels: readonly Uint8Array[], offset = 0): AbrCoverageSnapshot {
      if (!Number.isInteger(offset) || offset < 0 || pixels.length - offset < channels.length) throw new Error('Incomplete ABR coverage readback.');
      return channels.map(({ channel, side }, index) => ({ channel, side, pixels: pixels[offset + index]! }));
    }
  };
}

/** Transient stroke state, never part of an ABR preset or saved document. Treat this payload as opaque. */
export type AbrCoverageSnapshot = readonly { channel: Channel; side: number; pixels: Uint8Array }[];
type Channel = 'mask' | 'paint' | 'dual';

/** Borrows the rasterizer's textures; neither allocates another texture set nor owns their destruction. */
export function createAbrCoverage(device: GPUDevice, textures: Record<Channel, GPUTexture>) {
  const views = { mask: textures.mask.createView(), paint: textures.paint.createView(), dual: textures.dual.createView() };
  return {
    /** Rasterizer-private channel mapping used by readback plans and disposable preview copies. */
    textures,
    /** Cached views shared with raster passes; no per-stamp view allocation. */
    views,
    /** Restores complete active regions and clears omitted channels, including stale scratch from another preset.
     * decodeFullTile handles the host's lossless document-tile codec; compact LOD masks are raw RGBA.
     * Submit earlier users before restoring. Supplied commands retain queued clears until the host flushes.
     */
    restore(snapshot: AbrCoverageSnapshot | undefined, decodeFullTile: (pixels: Uint8Array) => Uint8Array,
      batch?: ReturnType<typeof commandBatch>) {
      // Decode and validate every channel before touching device resources.
      const restored = new Map<Channel, { side: number; pixels: Uint8Array }>();
      for (const item of snapshot ?? []) {
        if (!['mask', 'paint', 'dual'].includes(item.channel) || restored.has(item.channel) ||
            ![32, 64, 128, TILE_SIZE].includes(item.side) || (item.channel === 'dual' && item.side !== TILE_SIZE))
          throw new Error('Invalid ABR coverage snapshot layout.');
        const pixels = item.side === TILE_SIZE ? decodeFullTile(item.pixels) : item.pixels;
        if (pixels.byteLength !== item.side * item.side * 4) throw new Error('Invalid ABR coverage snapshot size.');
        restored.set(item.channel, { side: item.side, pixels });
      }
      const commands = batch ?? commandBatch(device);
      for (const channel of ['mask', 'paint', 'dual'] as const) {
        const value = restored.get(channel);
        if (value) device.queue.writeTexture({ texture: textures[channel] }, value.pixels,
          { bytesPerRow: value.side * 4 }, [value.side, value.side]);
        else clear(commands, views[channel]);
      }
      if (!batch) commands.flush();
    },
    /** Copies all accumulated channels to a disposable preview, or clears a preview starting on untouched pixels. */
    copyFrom(source: { textures: Readonly<Record<Channel, GPUTexture>> } | undefined, commands: ReturnType<typeof commandBatch>) {
      for (const channel of ['mask', 'paint', 'dual'] as const) {
        if (source) commands.encoder().copyTextureToTexture(
          { texture: source.textures[channel] }, { texture: textures[channel] }, [TILE_SIZE, TILE_SIZE]
        );
        else clear(commands, views[channel]);
      }
    },
    /** Starts fresh primary coverage. Preserve dual coverage while consecutive sampling dabs share a secondary mask. */
    clear(commands: ReturnType<typeof commandBatch>, resetDual = true) {
      clear(commands, views.mask);
      clear(commands, views.paint);
      if (resetDual) clear(commands, views.dual);
    }
  };
}

/** Device-local coverage handle; its textures share the owning ABR tile's lifetime. */
export type AbrCoverage = ReturnType<typeof createAbrCoverage>;

function clear(commands: ReturnType<typeof commandBatch>, view: GPUTextureView) {
  const pass = commands.encoder().beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store' }] });
  pass.end();
}
