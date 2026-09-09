import { sampleMixing, smudgeCarry } from '@app-game/abr-brush/effects';
import { common, d, std, tgpu, type TgpuRoot } from 'typegpu';
import type { createCanvasPickup } from './canvasPickup';
import { commandBatch } from './commandBatch';
import { commandSlots } from './commandSlots';

/** Two device-owned Smudge banks. Each step captures current canvas paint into carried brush-local pixels.
 * Inputs and outputs are borrowed: submit consumers or encode them in the same batch before the next step. No GPU wait.
 * Reset at every stroke boundary, including cancellation. Allocation grows only to the bounded pickup size.
 */
export function createSmudgePickup(root: TgpuRoot) {
  type Group = ReturnType<typeof root.createBindGroup<typeof Layout.entries>>;
  const slots = Array.from({ length: 8 }, () => ({
    params: root.createBuffer(Params).$usage('uniform'),
    groups: new WeakMap<object, WeakMap<object, Group>>()
  }));
  const reserve = commandSlots(slots.length);
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  const pipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: carryFragment,
    targets: { format: 'rgba8unorm' }
  });
  const banks: Array<ReturnType<typeof createBank> | undefined> = [undefined, undefined];
  let front = 0;
  let previous: { width: number; height: number; pixelsWide: number; pixelsHigh: number } | undefined;
  return {
    /** Capture must be centered on the current dab. A first step initializes paint without depositing a mark.
     * A borrowed batch may span steps; its owner must submit before reset/destroy or external texture reuse.
     */
    step(
      patch: Awaited<ReturnType<ReturnType<typeof createCanvasPickup>['capture']>>,
      strength: number,
      linear: boolean,
      fingerColor?: readonly [number, number, number],
      batch?: ReturnType<typeof commandBatch>
    ) {
      const commands = batch ?? commandBatch(root.device);
      const back = 1 - front;
      let target = banks[back];
      if (!target || target.width < patch.width || target.height < patch.height) {
        const width = Math.max(target?.width ?? 0, patch.width);
        const height = Math.max(target?.height ?? 0, patch.height);
        commands.flush();
        target?.texture.destroy();
        target = banks[back] = createBank(width, height);
      }
      const old = banks[front]?.texture ?? patch.texture;
      const slot = slots[reserve(commands)]!;
      const { params } = slot;
      params.write({
        size: d.vec4f(patch.width, patch.height, patch.region.width, patch.region.height),
        carry: d.vec4f(
          previous?.width ?? patch.region.width,
          previous?.height ?? patch.region.height,
          previous || fingerColor ? strength : 0,
          Number(linear)
        ),
        seed: fingerColor && !previous ? d.vec4f(...fingerColor, 1) : d.vec4f(0),
        oldSize: d.vec2f(previous?.pixelsWide ?? patch.width, previous?.pixelsHigh ?? patch.height)
      });
      let byCanvas = slot.groups.get(old);
      if (!byCanvas) slot.groups.set(old, (byCanvas = new WeakMap()));
      let group = byCanvas.get(patch.texture);
      if (!group) {
        group = root.createBindGroup(Layout, { old, canvas: patch.texture, params, sampler });
        byCanvas.set(patch.texture, group);
      }
      const pass = commands.encoder().beginRenderPass({
        colorAttachments: [{ view: target.view, loadOp: 'clear', storeOp: 'store' }]
      });
      pass.setViewport(0, 0, patch.width, patch.height, 0, 1);
      pass.setScissorRect(0, 0, patch.width, patch.height);
      pipeline.with(pass).with(group).draw(3);
      pass.end();
      if (!batch) commands.flush();
      const validWidth = previous ? Math.min(1, previous.width / patch.region.width) : 1;
      const validHeight = previous ? Math.min(1, previous.height / patch.region.height) : 1;
      const clip: [number, number, number, number] = [
        (1 - validWidth) / 2,
        (1 - validHeight) / 2,
        (1 + validWidth) / 2,
        (1 + validHeight) / 2
      ];
      previous = {
        width: patch.region.width,
        height: patch.region.height,
        pixelsWide: patch.width,
        pixelsHigh: patch.height
      };
      front = back;
      return { texture: target.texture, region: patch.region, width: patch.width, height: patch.height, clip };
    },
    reset() {
      previous = undefined;
    },
    bytes: () => banks.reduce((bytes, bank) => bytes + (bank ? bank.width * bank.height * 4 : 0), 0),
    destroy() {
      banks.forEach((bank) => bank?.texture.destroy());
      banks.fill(undefined);
      previous = undefined;
      for (const slot of slots) slot.params.destroy();
    }
  };

  function createBank(width: number, height: number) {
    const texture = root.createTexture({ size: [width, height], format: 'rgba8unorm' }).$usage('sampled', 'render');
    return {
      texture,
      width,
      height,
      view: root.unwrap(texture).createView()
    };
  }
}

const Params = d.struct({ size: d.vec4f, carry: d.vec4f, seed: d.vec4f, oldSize: d.vec2f });
const Layout = tgpu.bindGroupLayout({
  old: { texture: d.texture2d() },
  canvas: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
  params: { uniform: Params }
});
const carryFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const p = Layout.$.params;
  const uv = std.div(input.position.xy, p.size.xy);
  const canvas = sampleMixing(Layout.$.canvas, Layout.$.sampler, uv, p.carry.w > 0);
  if (p.carry.z <= 0) return canvas;
  if (p.seed.a > 0) return smudgeCarry(canvas, p.seed, p.carry.z, p.carry.w > 0);
  // Preserve physical brush-local extent during diameter changes instead of stretching old paint.
  const oldUv = std.add(std.mul(std.sub(uv, d.vec2f(0.5)), std.div(p.size.zw, p.carry.xy)), d.vec2f(0.5));
  if (oldUv.x < 0 || oldUv.y < 0 || oldUv.x > 1 || oldUv.y > 1) return canvas;
  const previousUv = std.div(
    std.clamp(std.mul(oldUv, p.oldSize), d.vec2f(0.5), std.sub(p.oldSize, d.vec2f(0.5))),
    d.vec2f(std.textureDimensions(Layout.$.old))
  );
  const previous = sampleMixing(Layout.$.old, Layout.$.sampler, previousUv, p.carry.w > 0);
  return smudgeCarry(canvas, previous, p.carry.z, p.carry.w > 0);
});
