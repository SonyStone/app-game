import type { TgpuRoot } from 'typegpu';
import { TILE_SIZE, type Dab } from '../brush';
import type { createAbrStamps } from './abrStamps';
import type { commandBatch } from './commandBatch';
import { directStampBounds } from './stampBounds';

/** Groups one dab's destination tiles into bounded contiguous GPU staging areas.
 * The caller reserves enough resident-cache space to keep every tile alive until deposition completes.
 * Capacity must be a positive integer; invalid capacities throw RangeError.
 */
export function planSmudgeDeposits(dab: Dab, keys: Iterable<string>, capacity: number) {
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Deposit capacity must be a positive integer.');
  const tiles = Array.from(keys, (key) => {
    const [x, y] = key.split(',').map(Number) as [number, number];
    return { key, x, y, bounds: directStampBounds(dab, x, y) };
  }).filter((tile): tile is typeof tile & { bounds: NonNullable<typeof tile.bounds> } => !!tile.bounds);
  if (!tiles.length) return [];
  const left = Math.min(...tiles.map((tile) => tile.x)),
    top = Math.min(...tiles.map((tile) => tile.y));
  const blocks = new Map<string, typeof tiles>();
  for (const tile of tiles) {
    const key = `${Math.floor((tile.x - left) / 8)},${Math.floor((tile.y - top) / 8)}`;
    const block = blocks.get(key) ?? [];
    block.push(tile);
    blocks.set(key, block);
  }
  const chunks = [];
  for (const block of blocks.values())
    for (let offset = 0; offset < block.length; offset += capacity) {
      const tiles = block.slice(offset, offset + capacity);
      const x = Math.min(...tiles.map((tile) => tile.x)),
        y = Math.min(...tiles.map((tile) => tile.y));
      const width = (Math.max(...tiles.map((tile) => tile.x)) - x + 1) * TILE_SIZE;
      const height = (Math.max(...tiles.map((tile) => tile.y)) - y + 1) * TILE_SIZE;
      chunks.push({ x, y, width, height, tiles });
    }
  return chunks;
}

/** Deposits one smudge dab across a group of tiles in one render pass.
 * Scratch grows to at most two 2048² RGBA textures plus ABR uniforms/masks. Never retained in history.
 */
export function createSmudgeDepositBatch(root: TgpuRoot, stamps: ReturnType<typeof createAbrStamps>) {
  let scratch: ReturnType<typeof allocate> | undefined;
  let previous: { commands: ReturnType<typeof commandBatch>; version: number } | undefined;
  return {
    /** Destinations must follow chunk.tiles order and stay resident until copy-back is encoded.
     * Requires canBatchDirect(); uniforms are submitted before scratch reuse or retirement.
     */
    draw(
      commands: ReturnType<typeof commandBatch>,
      dab: Dab,
      pickup: NonNullable<Parameters<ReturnType<typeof createAbrStamps>['composite']>[2]>,
      chunk: ReturnType<typeof planSmudgeDeposits>[number],
      destinations: readonly GPUTexture[]
    ) {
      if (previous && previous.commands.version === previous.version) previous.commands.flush();
      const side = 2 ** Math.ceil(Math.log2(Math.max(chunk.width, chunk.height)));
      if (!scratch || scratch.side < side) {
        scratch?.destroy();
        scratch = allocate(side);
      }
      const { base, output, tile } = scratch;
      const shared = stamps.prepareDirect(dab);
      stamps.prepareTile(tile, commands, chunk.x, chunk.y);
      const encoder = commands.encoder();
      chunk.tiles.forEach(({ x, y, bounds }, index) => {
        encoder.copyTextureToTexture(
          { texture: destinations[index]!, origin: [bounds.x, bounds.y] },
          {
            texture: root.unwrap(base),
            origin: [(x - chunk.x) * TILE_SIZE + bounds.x, (y - chunk.y) * TILE_SIZE + bounds.y]
          },
          [bounds.width, bounds.height]
        );
      });
      // The rotated quad does not shade its bounding-box corners. Preserve those destination pixels.
      encoder.copyTextureToTexture({ texture: root.unwrap(base) }, { texture: root.unwrap(output) }, [
        chunk.width,
        chunk.height
      ]);
      const pass = encoder.beginRenderPass({
        label: 'smudge-deposit-batch',
        colorAttachments: [{ view: scratch.view, loadOp: 'load', storeOp: 'store' }]
      });
      pass.setScissorRect(0, 0, chunk.width, chunk.height);
      stamps.draw(tile, commands, [dab], chunk.x, chunk.y, {
        pass,
        stamps: shared,
        pickup: { ...pickup, x: chunk.x * TILE_SIZE - pickup.x, y: chunk.y * TILE_SIZE - pickup.y }
      });
      pass.end();
      chunk.tiles.forEach(({ x, y, bounds }, index) => {
        encoder.copyTextureToTexture(
          {
            texture: root.unwrap(output),
            origin: [(x - chunk.x) * TILE_SIZE + bounds.x, (y - chunk.y) * TILE_SIZE + bounds.y]
          },
          { texture: destinations[index]!, origin: [bounds.x, bounds.y] },
          [bounds.width, bounds.height]
        );
      });
      previous = { commands, version: commands.version };
    },
    bytes: () => (scratch ? scratch.side ** 2 * 8 + TILE_SIZE ** 2 * 8 : 0),
    destroy() {
      previous?.commands.flush();
      scratch?.destroy();
      scratch = undefined;
    }
  };

  function allocate(side: number) {
    const base = root.createTexture({ size: [side, side], format: 'rgba8unorm' }).$usage('sampled', 'render');
    const output = root.createTexture({ size: [side, side], format: 'rgba8unorm' }).$usage('sampled', 'render');
    const tile = stamps.createTile(base, base, 1);
    return {
      side,
      base,
      output,
      tile,
      view: root.unwrap(output).createView(),
      destroy() {
        tile.destroy();
        base.destroy();
        output.destroy();
      }
    };
  }
}
