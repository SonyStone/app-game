import { mixerDose, mixerPaint, mixerPickup, mixerReservoir } from '@app-game/abr-brush/effects';
import { previewColor } from '@app-game/abr-brush/stroke';
import { common, d, std, tgpu, type TgpuRoot } from 'typegpu';
import type { createCanvasPickup } from './canvasPickup';
import { commandBatch } from './commandBatch';
import { commandSlots } from './commandSlots';
import type { RendererToolState } from './toolState';

/** Device-owned reservoir and pickup wells. Current paint survives strokes until load/clean or preset replacement.
 * Cancellation restores both wells and remaining paint. A step's consumers must be submitted, or encoded in the
 * step's own batch, before the next step.
 * Exchange/depletion rates are a brush-diameter-based approximation, not a measured Photoshop solvent model.
 */
export function createMixerWells(root: TgpuRoot) {
  const pair = () => [texture(root), texture(root)] as const;
  const reservoirs = pair(),
    pickups = pair();
  const savedReservoir = texture(root),
    savedPickup = texture(root),
    loadedPaint = texture(root),
    output = texture(root);
  type Group = ReturnType<typeof root.createBindGroup<typeof Layout.entries>>;
  // Uniforms are written at call time, so every step encoded in one batch needs its own slot.
  const slots = Array.from({ length: 8 }, () => ({
    params: root.createBuffer(Params).$usage('uniform'),
    /** Per canvas texture: bind groups reading well pair 0 and well pair 1. */
    groups: new WeakMap<object, [Group | undefined, Group | undefined]>()
  }));
  const reserve = commandSlots(slots.length);
  const views = {
    reservoirs: reservoirs.map((well) => root.unwrap(well).createView()),
    pickups: pickups.map((well) => root.unwrap(well).createView()),
    output: root.unwrap(output).createView()
  };
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  const update = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: updateWells,
    targets: {
      reservoir: { format: 'rgba16float' },
      pickup: { format: 'rgba16float' },
      paint: { format: 'rgba16float' }
    }
  });
  const load = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: loadPaint,
    targets: { format: 'rgba16float' }
  });
  let front = 0,
    remaining = 0,
    savedRemaining = 0;
  let key: string | undefined,
    color = '#000000';
  let settings: { load: number; autoFill: boolean; autoClean: boolean } | undefined;
  let active = false;
  let snapshotBytes = 0;
  const fill = () => {
    remaining = settings!.load;
    copy(loadedPaint, reservoirs[front]!);
  };
  const foreground = () => {
    const rgb = previewColor(color);
    clear(loadedPaint, { r: rgb[0], g: rgb[1], b: rgb[2], a: 1 });
    fill();
  };
  const clear = (target: ReturnType<typeof texture>, color: GPUColor = [0, 0, 0, 0]) => {
    const encoder = root.device.createCommandEncoder();
    encoder
      .beginRenderPass({
        colorAttachments: [
          { view: root.unwrap(target).createView(), loadOp: 'clear', storeOp: 'store', clearValue: color }
        ]
      })
      .end();
    root.device.queue.submit([encoder.finish()]);
  };
  const copy = (from: ReturnType<typeof texture>, to: ReturnType<typeof texture>) => {
    const encoder = root.device.createCommandEncoder();
    encoder.copyTextureToTexture({ texture: root.unwrap(from) }, { texture: root.unwrap(to) }, [256, 256]);
    root.device.queue.submit([encoder.finish()]);
  };
  return {
    /** Copies idle wells once for a renderer handoff; regular autosave never reads these pixels.
     * Submission precedes the await, so later GPU writes cannot alter this snapshot.
     */
    async snapshot(): Promise<RendererToolState['mixer']> {
      if (active) throw new Error('Finish or cancel the Mixer Brush stroke before replacing the renderer.');
      if (!key || !settings) return undefined;
      if (snapshotBytes) throw new Error('A Mixer Brush handoff is already being captured.');
      const metadata = { key, color, remaining, settings: { ...settings } };
      const imageBytes = 256 * 256 * 8;
      const staging = root.device.createBuffer({
        size: 3 * imageBytes,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      });
      snapshotBytes = staging.size;
      try {
        const encoder = root.device.createCommandEncoder();
        for (const [index, source] of [reservoirs[front]!, pickups[front]!, loadedPaint].entries()) {
          encoder.copyTextureToBuffer(
            { texture: root.unwrap(source) },
            { buffer: staging, offset: index * imageBytes, bytesPerRow: 256 * 8 },
            [256, 256]
          );
        }
        root.device.queue.submit([encoder.finish()]);
        await staging.mapAsync(GPUMapMode.READ);
        return { ...metadata, pixels: new Uint8Array(staging.getMappedRange()).slice() };
      } finally {
        staging.destroy();
        snapshotBytes = 0;
      }
    },
    /** Restores a validated handoff before the new renderer accepts input. No preset resources are needed. */
    restore(state: NonNullable<RendererToolState['mixer']>) {
      if (active) throw new Error('Finish or cancel the Mixer Brush stroke before restoring its paint.');
      const imageBytes = 256 * 256 * 8;
      for (const [index, target] of [reservoirs[front]!, pickups[front]!, loadedPaint].entries()) {
        root.device.queue.writeTexture(
          { texture: root.unwrap(target) },
          state.pixels.subarray(index * imageBytes, (index + 1) * imageBytes),
          { bytesPerRow: 256 * 8 },
          [256, 256]
        );
      }
      key = state.key;
      color = state.color;
      remaining = state.remaining;
      settings = { ...state.settings };
    },
    /** Manual commands set preset identity too, so the next begin cannot silently refill a cleaned brush. */
    command(action: 'load' | 'clean', nextKey: string, nextColor: string, next: NonNullable<typeof settings>) {
      if (active) throw new Error('Finish or cancel the Mixer Brush stroke first.');
      settings = loadSettings(next);
      if (key !== nextKey || action === 'clean') clear(pickups[front]!);
      key = nextKey;
      color = nextColor;
      if (action === 'load') foreground();
      else {
        clear(reservoirs[front]!);
        remaining = 0;
      }
    },
    /** Captures a borrowed canvas patch into the refill source before the next canvas capture.
     * Alpha is preserved: sampling empty canvas must never manufacture opaque black pigment.
     */
    loadCanvas(
      patch: Awaited<ReturnType<ReturnType<typeof createCanvasPickup>['capture']>>,
      nextKey: string,
      nextColor: string,
      next: NonNullable<typeof settings>
    ) {
      if (active) throw new Error('Finish or cancel the Mixer Brush stroke first.');
      const encoder = root.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: root.unwrap(loadedPaint).createView(),
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      });
      load
        .with(pass)
        .with(root.createBindGroup(LoadLayout, { image: patch.texture, sampler }))
        .draw(3);
      pass.end();
      root.device.queue.submit([encoder.finish()]);
      if (key !== nextKey) clear(pickups[front]!);
      key = nextKey;
      color = nextColor;
      settings = loadSettings(next);
      fill();
    },
    /** New preset/color loads fresh reservoir paint. Existing settings retain depleted paint across gestures. */
    begin(nextKey: string, nextColor: string, next: NonNullable<typeof settings>) {
      if (active) throw new Error('Finish or cancel the Mixer Brush stroke first.');
      settings = loadSettings(next);
      if (key !== nextKey) {
        clear(pickups[front]!);
        color = nextColor;
        foreground();
      } else if (color !== nextColor) {
        color = nextColor;
        foreground();
      }
      key = nextKey;
      savedRemaining = remaining;
      copy(reservoirs[front]!, savedReservoir);
      copy(pickups[front]!, savedPickup);
      active = true;
    },
    /** Takes up canvas paint, exchanges colors between wells, and emits premultiplied brush paint for one dab.
     * A borrowed batch may span steps: the returned paint is valid until the next step's passes in that batch,
     * and the batch's owner must submit before begin, finish, cancel or any idle command.
     */
    step(
      patch: Awaited<ReturnType<ReturnType<typeof createCanvasPickup>['capture']>>,
      wet: number,
      mix: number,
      flow: number,
      distanceInDiameters: number,
      batch?: ReturnType<typeof commandBatch>,
      /** Adaptive spacing of this dab; see mixerDose. */
      spacing?: Parameters<typeof mixerDose>[3]
    ) {
      if (!active) throw new Error('Begin the Mixer Brush stroke before sampling.');
      const dose = mixerDose(remaining, flow, distanceInDiameters, spacing);
      const { exchange, available } = dose;
      const commands = batch ?? commandBatch(root.device);
      const slot = slots[reserve(commands)]!;
      slot.params.write({
        controls: d.vec4f(wet, wet > 0 ? mix : 0, exchange, flow),
        paint: d.vec4f(available, 0, 0, 0)
      });
      let groups = slot.groups.get(patch.texture);
      if (!groups) {
        slot.groups.set(patch.texture, (groups = [undefined, undefined]));
      }

      const group = (well: number) =>
        (groups[well] ??= root.createBindGroup(Layout, {
          reservoir: reservoirs[well]!,
          pickup: pickups[well]!,
          canvas: patch.texture,
          sampler,
          params: slot.params
        }));
      const back = 1 - front;
      const encoder = commands.encoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          { view: views.reservoirs[back]!, loadOp: 'clear', storeOp: 'store' },
          { view: views.pickups[back]!, loadOp: 'clear', storeOp: 'store' },
          { view: views.output, loadOp: 'clear', storeOp: 'store' }
        ]
      });
      update.with(pass).with(group(front)).draw(3);
      pass.end();
      if (!batch) {
        commands.flush();
      }

      front = back;
      remaining = dose.remaining;
      return { texture: output, region: patch.region, width: 256, height: 256 };
    },
    finish() {
      if (!active) return;
      active = false;
      if (settings!.autoClean) {
        clear(pickups[front]!);
        clear(reservoirs[front]!);
        remaining = 0;
      }
      if (settings!.autoFill) fill();
    },
    cancel() {
      if (!active) return;
      copy(savedReservoir, reservoirs[front]!);
      copy(savedPickup, pickups[front]!);
      remaining = savedRemaining;
      active = false;
    },
    /** Runtime diagnostics; the pigment model stores capacity independently from opacity. */
    state: () => ({ remaining, active }),
    get bytes() {
      return 8 * 256 * 256 * 8 + snapshotBytes;
    },
    destroy() {
      for (const value of [...reservoirs, ...pickups, savedReservoir, savedPickup, loadedPaint, output])
        value.destroy();
      for (const slot of slots) slot.params.destroy();
    }
  };
}
/** Callers may pass a larger raster configuration; retain only owned well settings, never document layers. */
function loadSettings(next: NonNullable<RendererToolState['mixer']>['settings']) {
  return { load: next.load, autoFill: next.autoFill, autoClean: next.autoClean };
}
function texture(root: TgpuRoot) {
  return root.createTexture({ size: [256, 256], format: 'rgba16float' }).$usage('sampled', 'render');
}
const Params = d.struct({ controls: d.vec4f, paint: d.vec4f });
const Layout = tgpu.bindGroupLayout({
  reservoir: { texture: d.texture2d() },
  pickup: { texture: d.texture2d() },
  canvas: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
  params: { uniform: Params }
});
const updateWells = tgpu.fragmentFn({
  in: { position: d.builtin.position },
  out: { reservoir: d.vec4f, pickup: d.vec4f, paint: d.vec4f }
})((input) => {
  'use gpu';
  const uv = std.div(input.position.xy, 256);
  const settings = Layout.$.params.controls;
  const oldReservoir = std.textureSample(Layout.$.reservoir, Layout.$.sampler, uv);
  const oldPickup = std.textureSample(Layout.$.pickup, Layout.$.sampler, uv);
  const canvas = std.textureSample(Layout.$.canvas, Layout.$.sampler, uv);
  const pickup = mixerPickup(oldPickup, canvas, settings);
  const reservoir = mixerReservoir(oldReservoir, pickup, settings);
  // The wells are stored as f16, so paint is mixed from the values as stored, like a separate pass reading them.
  const paint = mixerPaint(asStored(reservoir), asStored(pickup), settings.x, settings.y, Layout.$.params.paint.x);
  return { reservoir, pickup, paint };
});
/**
 * A color as an rgba16float attachment stores it: rounded toward zero to f16 precision, as Metal (Mac) and Adreno
 * (Vulkan) both do. With it, the fused pass paints byte for byte like a separate pass reading the stored wells
 * (`--quality --hashes` of `scripts/megapack-sweep.mjs` over every Mixer preset); a GPU rounding to nearest would differ
 * by at most one level.
 */
const asStored = tgpu.fn(
  [d.vec4f],
  d.vec4f
)((color) => {
  'use gpu';
  return d.vec4f(storedChannel(color.x), storedChannel(color.y), storedChannel(color.z), storedChannel(color.w));
});
const storedChannel = tgpu.fn(
  [d.f32],
  d.f32
)((value) => {
  'use gpu';
  const parts = std.frexp(value);
  // f16 keeps 11 significant bits; below its normal range the step is fixed at 2^-24.
  if (parts.exp < -13) return std.trunc(value * 16777216) / 16777216;
  return std.ldexp(std.trunc(parts.fract * 2048) / 2048, parts.exp);
});
const LoadLayout = tgpu.bindGroupLayout({ image: { texture: d.texture2d() }, sampler: { sampler: 'filtering' } });
const loadPaint = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  return std.textureSample(LoadLayout.$.image, LoadLayout.$.sampler, std.div(input.position.xy, 256));
});
