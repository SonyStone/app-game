import type { GpuContext } from '@app-game/solid-gpu/gpu';
import tgpu, { d, std } from 'typegpu';
import type { SceneFrame } from './createFrame';

/**
 * Renders a view that is too slow to draw in one frame exactly, but progressively: `renderBand` draws the next
 * horizontal band of the frame into a pending texture, each band sized from the previous band's cost to take about
 * {@link bandBudgetMs}, so a gesture starting meanwhile waits for one band rather than the whole view. Once every band
 * is drawn, the texture becomes the settled view and `draw` copies it texel for texel, identical to drawing directly,
 * for as long as frames keep its camera and size. GPU resources are created on first use and released by `destroy`.
 */
export function createSettledView({ root, device, format }: Pick<GpuContext, 'root' | 'device' | 'format'>) {
  let pipeline: ReturnType<typeof createPipeline> | undefined;
  let settled: ReturnType<typeof allocate> | undefined;
  let pending: ReturnType<typeof allocate> | undefined;
  let bandRows = 0;

  return {
    /** Copies the settled view into `pass` and returns true when it shows `frame`; otherwise draws nothing. */
    draw(pass: GPURenderPassEncoder, frame: SceneFrame) {
      if (!settled?.frame || !pipeline || !sameView(settled.frame, frame)) {
        return false;
      }

      pipeline.with(pass).with(settled.group).draw(3);
      return true;
    },
    /** Whether bands of a newer rendering of `frame` remain to be drawn. */
    pendingFor(frame: SceneFrame) {
      return pending?.frame !== undefined && sameView(pending.frame, frame) && pending.next < frame.height;
    },
    /**
     * Draws the next band of `frame` with `render`, starting over when the frame or its content changed (`restart`),
     * and submits it. Returns whether the view is now settled; a failed band is returned and abandons the rendering.
     */
    renderBand<R extends { isErr(): boolean } | void>(
      frame: SceneFrame,
      restart: boolean,
      render: (pass: GPURenderPassEncoder) => R
    ): { result: R; settled: boolean } {
      pipeline ??= createPipeline();

      if (restart || !pending?.frame || !sameView(pending.frame, frame)) {
        if (pending?.width !== frame.width || pending.height !== frame.height) {
          pending?.texture.destroy();
          pending = allocate(frame.width, frame.height);
        }

        pending.frame = frame;
        pending.next = 0;
        bandRows ||= Math.ceil(frame.height / initialBands);
      }

      const top = pending.next;
      const rows = Math.min(frame.height - top, Math.max(minimumBandRows, Math.round(bandRows)));
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          { view: pending.view, clearValue: [0, 0, 0, 0], loadOp: top === 0 ? 'clear' : 'load', storeOp: 'store' }
        ]
      });
      pass.setScissorRect(0, top, frame.width, rows);
      const result = render(pass);
      pass.end();

      if (result?.isErr()) {
        pending.frame = undefined;
        return { result, settled: false };
      }

      const started = performance.now();
      device.queue.submit([encoder.finish()]);
      // Pixel work grows with rows; aim the next band at the budget from this one's cost.
      void device.queue.onSubmittedWorkDone().then(() => {
        const elapsed = Math.max(performance.now() - started, 1);
        bandRows = Math.min(frame.height, Math.max(minimumBandRows, (rows * bandBudgetMs) / elapsed));
      });
      pending.next = top + rows;

      if (pending.next < frame.height) {
        return { result, settled: false };
      }

      [settled, pending] = [pending, settled];
      return { result, settled: true };
    },
    /** Forgets the settled and pending views, such as when the view starts moving; keeps the textures. */
    invalidate() {
      if (settled) {
        settled.frame = undefined;
      }

      if (pending) {
        pending.frame = undefined;
      }
    },
    /** Releases the textures. */
    destroy() {
      settled?.texture.destroy();
      pending?.texture.destroy();
      settled = pending = undefined;
    }
  };

  function allocate(width: number, height: number) {
    const texture = root.createTexture({ size: [width, height], format }).$usage('sampled', 'render');

    return {
      width,
      height,
      texture,
      view: root.unwrap(texture).createView(),
      group: root.createBindGroup(layout, { source: texture.createView() }),
      /** The frame this texture shows or is being drawn for; undefined when it holds nothing usable. */
      frame: undefined as SceneFrame | undefined,
      /** First row not yet drawn. */
      next: 0
    };
  }

  function createPipeline() {
    return root.createRenderPipeline({
      vertex,
      fragment,
      targets: {
        format,
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
        }
      }
    });
  }
}

/** Target GPU time of one band. */
const bandBudgetMs = 12;
/** Bands of the first rendering, before any band's cost is known. */
const initialBands = 8;
/** Fewest rows per band, so tiny bands do not multiply per-draw overhead. */
const minimumBandRows = 32;

/** Whether two frames show the same view: equal size and transforms, as frames of one unchanged camera are. */
function sameView(a: SceneFrame, b: SceneFrame) {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.mul[0] === b.mul[0] &&
    a.mul[1] === b.mul[1] &&
    a.add[0] === b.add[0] &&
    a.add[1] === b.add[1] &&
    a.rotation.every((value, index) => value === b.rotation[index]) &&
    a.vectorOnly === b.vectorOnly &&
    a.grids === b.grids
  );
}

const layout = tgpu.bindGroupLayout({ source: { texture: d.texture2d(d.f32) } });

/** One triangle covering clip space. */
const vertex = tgpu.vertexFn({ in: { index: d.builtin.vertexIndex }, out: { position: d.builtin.position } })((
  input
) => {
  'use gpu';
  const corner = d.vec2f(d.f32((input.index << 1) & 2), d.f32(input.index & 2));
  return { position: d.vec4f(corner.x * 2 - 1, corner.y * 2 - 1, 0, 1) };
});

/** Copies the texel under this pixel. */
const fragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  return std.textureLoad(layout.$.source, d.vec2i(std.floor(input.position.xy)), 0);
});
