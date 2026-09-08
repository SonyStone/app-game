import { decodePremultiplied, encodePremultiplied, retouchColor } from '@app-game/abr-brush/effects';
import { common, d, std, tgpu, type TgpuRoot } from 'typegpu';
import type { createCanvasPickup } from './canvasPickup';

/** Full-resolution one-pixel retouch filter. Leased outputs let adjacent tiles finish reading
 * their original halos before any result is applied. Strength/blend/brush coverage are applied
 * by the ABR compositor, independently of this kernel. Native Photoshop kernel parity is unverified.
 */
export function createCanvasFilter(root: TgpuRoot) {
  const settings = root.createBuffer(d.vec4u).$usage('uniform');
  const pipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: filter,
    targets: { format: 'rgba8unorm' }
  });
  const free: ReturnType<typeof texture>[] = [];
  const all: ReturnType<typeof texture>[] = [];
  return {
    /** Requires an exact 258² capture around a 256² tile. Submit every consumer before releasing. */
    render(
      patch: Awaited<ReturnType<ReturnType<typeof createCanvasPickup>['capture']>>,
      sharpen: boolean,
      protect: boolean,
      linear = false
    ) {
      if (patch.width !== 258 || patch.height !== 258) throw new Error('Retouch requires a full-resolution tile halo.');
      let output = free.pop();
      if (!output) {
        output = texture(root);
        all.push(output);
      }
      settings.write(d.vec4u(Number(sharpen), Number(protect), Number(linear), 0));
      const encoder = root.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: root.unwrap(output).createView(),
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      });
      pipeline
        .with(pass)
        .with(root.createBindGroup(layout, { image: patch.texture, settings }))
        .draw(3);
      pass.end();
      root.device.queue.submit([encoder.finish()]);
      let released = false;
      return {
        texture: output,
        width: 256,
        height: 256,
        region: { x: patch.region.x + 1, y: patch.region.y + 1, width: 256, height: 256 },
        release() {
          if (!released) {
            released = true;
            free.push(output!);
          }
        }
      };
    },
    bytes: () => all.length * 256 * 256 * 4,
    destroy() {
      for (const value of all) value.destroy();
      settings.destroy();
    }
  };
}
function texture(root: TgpuRoot) {
  return root.createTexture({ size: [256, 256], format: 'rgba8unorm' }).$usage('render', 'sampled');
}
const layout = tgpu.bindGroupLayout({ image: { texture: d.texture2d() }, settings: { uniform: d.vec4u } });
const filter = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const xy = std.add(d.vec2i(input.position.xy), d.vec2i(1));
  const center = filterPixel(xy);
  let blurred = d.vec4f(0);
  let low = d.vec3f(1);
  let high = d.vec3f(0);
  for (const y of tgpu.unroll([-1, 0, 1])) {
    for (const x of tgpu.unroll([-1, 0, 1])) {
      const pixel = filterPixel(std.add(xy, d.vec2i(x, y)));
      const weight = (std.select(1, 2, x === 0) * std.select(1, 2, y === 0)) / 16;
      blurred = std.add(blurred, std.mul(pixel, weight));
      const rgb = std.div(pixel.rgb, std.max(0.00001, pixel.a));
      low = std.min(low, rgb);
      high = std.max(high, rgb);
    }
  }
  const result = retouchColor(center, blurred, low, high, layout.$.settings.x > 0, layout.$.settings.y > 0);
  if (layout.$.settings.z > 0) return encodePremultiplied(result);
  return result;
});

function filterPixel(xy: d.v2i) {
  'use gpu';
  const pixel = std.textureLoad(layout.$.image, xy, 0);
  if (layout.$.settings.z > 0) return decodePremultiplied(pixel);
  return pixel;
}
