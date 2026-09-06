import { d, tgpu } from 'typegpu';
import type { BrushTipImage } from '../../lib/abr';
import { blendModeId } from './effects';
import type { PreviewResources } from './resources';
import * as shader from './shaders';
import { createPreviewStroke, dualPreviewInput, previewColor, type PreviewInput } from './stroke';

/** Owns one device and offscreen canvas, with bounded source textures and reusable render targets. */
export async function createPreviewGpu(options: { device?: GPUDevice } = {}) {
  const adapter = options.device ? undefined : await navigator.gpu?.requestAdapter();
  if (!options.device && !adapter) throw new Error('WebGPU adapter unavailable');
  const device = options.device ?? (await adapter!.requestDevice()),
    root = tgpu.initFromDevice({ device });
  const canvas = new OffscreenCanvas(1, 1),
    context = canvas.getContext('webgpu');
  if (!context) {
    root.destroy();
    throw new Error('WebGPU canvas unavailable');
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  let lost: string | undefined;
  void device.lost.then((info) => {
    lost = info.message || 'GPU device lost';
  });
  device.addEventListener('uncapturederror', (event) => {
    lost = event.error.message;
  });
  const pipeline = root.createRenderPipeline({
    vertex: shader.stampVertex,
    fragment: shader.stampFragment,
    attribs: shader.stamps.attrib,
    targets: {
      paint: {
        format: 'rgba16float',
        blend: {
          color: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
        }
      },
      mask: {
        format: 'rgba16float',
        blend: {
          color: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src' },
          alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' }
        }
      }
    }
  });
  const composite = root.createRenderPipeline({
    vertex: shader.compositeVertex,
    fragment: shader.compositeFragment,
    targets: { format }
  });
  const params = root.createBuffer(shader.Params).$usage('uniform'),
    background = root.createBuffer(d.vec4f).$usage('uniform');
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear' }),
    repeat = root.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat'
    });
  const instances = root.createBuffer(shader.stamps.schemaForCount(16384)).$usage('vertex');
  const textures = new Map<string, ReturnType<typeof upload>>();
  let bytes = 0;
  const neutral = upload({ width: 1, height: 1, depth: 8, data: new Uint8Array([255]) });
  let target: ReturnType<typeof targets> | undefined;
  function upload(tip: BrushTipImage) {
    const texture = root.createTexture({ size: [tip.width, tip.height], format: 'r8unorm' }).$usage('sampled');
    device.queue.writeTexture({ texture: root.unwrap(texture) }, tip.data, { bytesPerRow: tip.width }, [
      tip.width,
      tip.height
    ]);
    return { texture, width: tip.width, height: tip.height, bytes: tip.data.byteLength };
  }
  function cached(key: string, tip?: BrushTipImage) {
    let item = textures.get(key);
    if (!item) {
      if (!tip) throw new Error('Missing brush texture');
      item = upload(tip);
      bytes += item.bytes;
    }
    textures.delete(key);
    textures.set(key, item);
    return item;
  }
  function targets(width: number, height: number) {
    canvas.width = width;
    canvas.height = height;
    const create = () =>
      root.createTexture({ size: [width, height], format: 'rgba16float' }).$usage('render', 'sampled');
    const paint = create(),
      mask = create(),
      dualPaint = create(),
      dualMask = create();
    return {
      width,
      height,
      paint,
      mask,
      dualPaint,
      dualMask,
      paintView: paint.createView('render'),
      maskView: mask.createView('render'),
      dualPaintView: dualPaint.createView('render'),
      dualMaskView: dualMask.createView('render'),
      destroy() {
        paint.destroy();
        mask.destroy();
        dualPaint.destroy();
        dualMask.destroy();
      }
    };
  }
  function writeParams(input: PreviewInput, pattern: ReturnType<typeof upload>, dual: boolean) {
    const v = input.values,
      t = v.texture;
    params.write({
      viewport: [input.width, input.height, 0, 0],
      texture: [pattern.width, pattern.height, (t.scale / 100) * input.dpr, blendModeId(t.mode)],
      tone: [t.invert ? 1 : 0, t.brightness, t.contrast, 0],
      flags: [v.useTexture && pattern !== neutral ? 1 : 0, t.eachTip ? 1 : 0, dual ? 1 : 0, v.useNoise ? 1 : 0],
      extra: [t.depth / 100, blendModeId(v.dualBrush.mode), v.useWetEdges ? 1 : 0, 0]
    });
  }
  return {
    hasTip(key: string) {
      return textures.has(key);
    },
    async render(input: PreviewInput, key: string, tip?: BrushTipImage, resources: PreviewResources = {}, auxKey = '') {
      if (lost) throw new Error(lost);
      const primary = cached(key, tip),
        pattern = resources.pattern ? cached(`pattern:${auxKey}`, resources.pattern) : neutral;
      const dual = resources.dualTip ? cached(`dual:${auxKey}`, resources.dualTip) : undefined;
      if (!target || target.width !== input.width || target.height !== input.height) {
        target?.destroy();
        target = targets(input.width, input.height);
      }
      device.pushErrorScope('validation');
      if (input.values.useDualBrush && dual) {
        const secondary = dualPreviewInput(input),
          stroke = createPreviewStroke(secondary, dual);
        writeParams(secondary, neutral, false);
        instances.write(new Float32Array(stroke.data).buffer);
        const group = root.createBindGroup(shader.brushLayout, {
          params,
          tip: dual.texture,
          pattern: neutral.texture,
          dual: neutral.texture,
          sampler,
          repeat
        });
        pipeline
          .with(group)
          .with(shader.stamps, instances)
          .withColorAttachment({
            paint: { view: target.dualPaintView, clearValue: [0, 0, 0, 0], loadOp: 'clear' },
            mask: { view: target.dualMaskView, clearValue: [0, 0, 0, 0], loadOp: 'clear' }
          })
          .draw(6, stroke.count);
      }
      const stroke = createPreviewStroke(input, primary);
      writeParams(input, pattern, !!dual && input.values.useDualBrush);
      instances.write(new Float32Array(stroke.data).buffer);
      const group = root.createBindGroup(shader.brushLayout, {
        params,
        tip: primary.texture,
        pattern: pattern.texture,
        dual: dual && input.values.useDualBrush ? target.dualMask : neutral.texture,
        sampler,
        repeat
      });
      pipeline
        .with(group)
        .with(shader.stamps, instances)
        .withColorAttachment({
          paint: { view: target.paintView, clearValue: [0, 0, 0, 0], loadOp: 'clear' },
          mask: { view: target.maskView, clearValue: [0, 0, 0, 0], loadOp: 'clear' }
        })
        .draw(6, stroke.count);
      background.write([...previewColor(input.background), 1]);
      const compositeGroup = root.createBindGroup(shader.compositeLayout, {
        params,
        background,
        mask: target.mask,
        paint: target.paint,
        pattern: pattern.texture,
        repeat
      });
      composite
        .with(compositeGroup)
        .withColorAttachment({ view: context.getCurrentTexture().createView(), loadOp: 'clear' })
        .draw(3);
      const error = await device.popErrorScope();
      if (error) throw new Error(error.message);
      await device.queue.onSubmittedWorkDone();
      if (lost) throw new Error(lost);
      while (bytes > 48 * 1024 * 1024 && textures.size > 3) {
        const [id, item] = textures.entries().next().value!;
        textures.delete(id);
        bytes -= item.bytes;
        item.texture.destroy();
      }
      return canvas.transferToImageBitmap();
    },
    dispose() {
      root.destroy();
    }
  };
}
