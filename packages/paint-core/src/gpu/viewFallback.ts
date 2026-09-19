import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import { screenToWorld, worldToScreen, type Camera, type ViewSize } from '../camera';
import { fullscreenVertex } from './shaders';

/** Reprojects the last complete viewport during cold page loading, without reading pixels back.
 * Capture only when a transition needs it; normal navigation does not copy or mipmap the viewport.
 */
export function createViewFallback(root: TgpuRoot) {
  const settings = root.createBuffer(layout.entries.transform.uniform).$usage('uniform');
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear' });
  const pipeline = root.createRenderPipeline({
    vertex: fullscreenVertex,
    fragment: fallbackFragment,
    targets: { format: 'rgba8unorm' }
  });
  const targets = new WeakMap<GPUTexture, GPUTextureView>();
  let saved:
    | {
        image: ReturnType<typeof makeImage>;
        group: ReturnType<typeof root.createBindGroup<typeof layout.entries>>;
        camera: Camera;
        size: ViewSize;
      }
    | undefined;
  const clear = () => {
    saved?.image.destroy();
    saved = undefined;
  };
  return {
    /** The source must contain a complete, current document view, never a previous reprojection. */
    capture(source: GPUTexture, camera: Camera, size: ViewSize) {
      clear();
      const image = makeImage(root, source.width, source.height);
      const encoder = root.device.createCommandEncoder();
      encoder.copyTextureToTexture({ texture: source }, { texture: root.unwrap(image) }, [source.width, source.height]);
      root.device.queue.submit([encoder.finish()]);
      image.generateMipmaps();
      saved = {
        image,
        group: root.createBindGroup(layout, { image, sampler, transform: settings }),
        camera: { ...camera },
        size: { ...size }
      };
    },
    /** Replaces pixels within the saved viewport, preserving newly visible pixels outside it. */
    draw(target: GPUTexture, camera: Camera, size: ViewSize) {
      if (!saved) return;
      const project = (x: number, y: number) => {
        const point = worldToScreen(screenToWorld({ x, y }, camera, size), saved!.camera, saved!.size);
        return d.vec2f(point.x / saved!.size.width, point.y / saved!.size.height);
      };
      const origin = project(0, 0),
        right = project(size.width, 0),
        bottom = project(0, size.height);
      settings.write({
        origin,
        axisX: d.vec2f(right.x - origin.x, right.y - origin.y),
        axisY: d.vec2f(bottom.x - origin.x, bottom.y - origin.y),
        targetSize: d.vec2f(target.width, target.height),
        lod: Math.max(
          0,
          Math.log2(
            ((saved.camera.zoom / camera.zoom) * saved.image.props.size[0]) /
              saved.size.width /
              (target.width / size.width)
          )
        ),
        padding: 0
      });
      let view = targets.get(target);
      if (!view) {
        view = target.createView();
        targets.set(target, view);
      }
      pipeline.with(saved.group).withColorAttachment({ view, loadOp: 'load' }).draw(3);
    },
    clear,
    bytes: () => (saved ? (saved.image.props.size[0] * saved.image.props.size[1] * 4 * 4) / 3 : 0),
    destroy() {
      clear();
      settings.destroy();
    }
  };
}

const layout = tgpu.bindGroupLayout({
  image: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
  transform: {
    uniform: d.struct({
      origin: d.vec2f,
      axisX: d.vec2f,
      axisY: d.vec2f,
      targetSize: d.vec2f,
      lod: d.f32,
      padding: d.f32
    })
  }
});
/** Samples the saved image only inside its original bounds; premultiplied alpha is overwritten, not blended. */
export const fallbackFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const p = std.div(input.position.xy, layout.$.transform.targetSize);
  const uv = std.add(
    layout.$.transform.origin,
    std.add(std.mul(layout.$.transform.axisX, p.x), std.mul(layout.$.transform.axisY, p.y))
  );
  if (uv.x < 0 || uv.y < 0 || uv.x > 1 || uv.y > 1) std.discard();
  return std.textureSampleLevel(layout.$.image, layout.$.sampler, uv, layout.$.transform.lod);
});
function makeImage(root: TgpuRoot, width: number, height: number) {
  return root
    .createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      mipLevelCount: Math.floor(Math.log2(Math.max(width, height))) + 1
    })
    .$usage('sampled', 'render');
}
