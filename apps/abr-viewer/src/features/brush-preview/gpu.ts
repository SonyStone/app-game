import { createPatternRasterGpu } from '@app-game/abr-brush/patternRasterGpu';
import { affineSecondaryBlend } from '@app-game/abr-brush/secondaryMask';
import { createTipPyramid } from '@app-game/abr-brush/tipPyramid';
import { createTipRasterGpu } from '@app-game/abr-brush/tipRasterGpu';
import { planSampledTip } from '@app-game/abr-brush/sampledTipRaster';
import { maskRasterRects, paintbrushMaskMode } from '@app-game/abr-brush/maskRaster';
import { createMaskRasterGpu } from '@app-game/abr-brush/maskRasterGpu';
import { blockEraserTip, blockEraserValues, isBlockEraser } from '@app-game/abr-brush/blockEraser';
import { paintModes } from '@app-game/abr-brush/paintBlend';
import { usesPencilCoverage } from '@app-game/abr-brush/pencil';
import { d, tgpu } from 'typegpu';
import type { BrushTipImage } from '../../lib/abr';
import { blendModeId } from './effects';
import { preparePreviewResources, type PreviewResources } from './resources';
import { isRetouch } from './retouch';
import { createRetouchPreview } from './retouch-gpu';
import * as shader from './shaders';
import { createPreviewStroke, dualPreviewInput, previewColor, strokeCompositeOpacity, type PreviewInput } from './stroke';

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
          color: { operation: 'max', srcFactor: 'one', dstFactor: 'one' },
          alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' }
        }
      }
    }
  });
  const maskSourcePipeline = root.createRenderPipeline({
    vertex: shader.stampVertex, fragment: shader.maskSourceFragment,
    attribs: shader.stamps.attrib, targets: { format: 'rgba8unorm' }
  });
  const sampledTipPipeline = root.createRenderPipeline({
    vertex: shader.sampledTipVertex, fragment: shader.sampledTipFragment,
    attribs: { dynamics: shader.stamps.attrib.dynamics }, targets: { format: 'rgba8unorm' }
  });
  const sampledSecondaryPipeline = root.createRenderPipeline({
    vertex: shader.sampledTipVertex, fragment: shader.sampledSecondaryFragment,
    attribs: { dynamics: shader.stamps.attrib.dynamics },
    targets: { paint: { format: 'rgba8unorm', blend: affineSecondaryBlend },
      mask: { format: 'rgba8unorm', blend: affineSecondaryBlend } }
  });
  const secondaryPipeline = root.createRenderPipeline({
    vertex: shader.stampVertex,
    fragment: shader.secondaryFragment,
    attribs: shader.stamps.attrib,
    targets: {
      paint: { format: 'rgba8unorm', blend: affineSecondaryBlend },
      mask: { format: 'rgba8unorm', blend: affineSecondaryBlend }
    }
  });
  const composite = root.createRenderPipeline({
    vertex: shader.compositeVertex,
    fragment: shader.compositeFragment,
    targets: { format }
  });
  const params = root.createBuffer(shader.Params).$usage('uniform'),
    background = root.createBuffer(d.vec4f).$usage('uniform');
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  const instances = root.createBuffer(shader.stamps.schemaForCount(16384)).$usage('vertex');
  const textures = new Map<string, ReturnType<typeof upload>>();
  let bytes = 0;
  const neutral = upload({ width: 1, height: 1, depth: 8, data: new Uint8Array([255]) });
  let target: ReturnType<typeof targets> | undefined;
  let retouch: ReturnType<typeof createRetouchPreview> | undefined;
  function upload(tip: BrushTipImage) {
    const texture = root.createTexture({ size: [tip.width, tip.height], format: 'r8unorm' }).$usage('sampled');
    device.queue.writeTexture({ texture: root.unwrap(texture) }, tip.data, { bytesPerRow: tip.width }, [
      tip.width,
      tip.height
    ]);
    const source = { width: tip.width, height: tip.height, data: new Uint8Array(tip.data) };
    let sampled: { levels: ReturnType<typeof createTipPyramid>; gpu: ReturnType<typeof createTipRasterGpu> } | undefined;
    let pattern: {
      gpu: ReturnType<typeof createPatternRasterGpu>;
      region?: ReturnType<ReturnType<typeof createPatternRasterGpu>['rasterize']>;
      width?: number;
      height?: number;
      scale?: number;
    } | undefined;
    const item = { texture, width: tip.width, height: tip.height, bytes: tip.data.byteLength * 2,
      sampled() {
        if (!sampled) {
          const levels = createTipPyramid(source);
          sampled = { levels, gpu: createTipRasterGpu(root, levels) };
          const extraBytes = levels.reduce((sum, level) => sum + level.data.length * 2 + 16, 0);
          item.bytes += extraBytes;
          bytes += extraBytes;
        }
        return sampled;
      },
      /** Cache one prepared viewport while editing tone/depth or drawing retouch dabs. */
      pattern(width: number, height: number, scale: number) {
        if (!pattern) {
          pattern = { gpu: createPatternRasterGpu(root, source) };
          item.bytes += pattern.gpu.bytes;
          bytes += pattern.gpu.bytes;
        }
        if (!pattern.region || pattern.width !== width || pattern.height !== height || pattern.scale !== scale) {
          const region = pattern.gpu.rasterize(scale, { x: 0, y: 0, width, height });
          const delta = region.bytes - (pattern.region?.bytes ?? 0);
          pattern.region?.destroy();
          Object.assign(pattern, { region, width, height, scale });
          item.bytes += delta;
          bytes += delta;
        }
        return pattern.region!.texture;
      },
      destroy() { texture.destroy(); sampled?.gpu.destroy(); pattern?.region?.destroy(); pattern?.gpu.destroy(); }
    };
    return item;
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
    const bytePaint = root.createTexture({ size: [width, height], format: 'rgba8unorm' }).$usage('render', 'sampled');
    const maskRaster = createMaskRasterGpu(root, width, height);
    let maskBatch: ReturnType<typeof maskRaster.createBatch> | undefined;
    let maskCapacity = 0;
    const paint = create(),
      mask = create(),
      dualPaint = root.createTexture({ size: [width, height], format: 'rgba8unorm' }).$usage('render', 'sampled'),
      dualMask = root.createTexture({ size: [width, height], format: 'rgba8unorm' }).$usage('render', 'sampled');
    return {
      width,
      height,
      bytePaint,
      maskRaster,
      maskBatch(capacity: number, mode: 1 | 2) {
        if (capacity > maskCapacity || maskBatch?.mode !== mode) {
          maskBatch?.destroy();
          maskCapacity = capacity;
          maskBatch = maskRaster.createBatch(capacity, mode);
        }
        return maskBatch!;
      },
      paint,
      mask,
      dualPaint,
      dualMask,
      paintAttachment: root.unwrap(paint).createView(),
      maskAttachment: root.unwrap(mask).createView(),
      paintView: paint.createView('render'),
      maskView: mask.createView('render'),
      dualPaintView: dualPaint.createView('render'),
      dualMaskView: dualMask.createView('render'),
      destroy() {
        bytePaint.destroy(); maskBatch?.destroy(); maskRaster.destroy();
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
      colorMixing: [input.colorMixing === 'linear' ? 1 : 0, 0, 0, 0],
      compositeOpacity: strokeCompositeOpacity(input),
      maskAccumulation: paintbrushMaskMode(v, input.stampRole === 'secondary'),
      maskColor: [...previewColor(input.color), 1],
      viewport: [input.width, input.height, input.dpr, v.tool.type === 'ErTl' ? (v.tool.eraseToHistory ? 2 : 1) : 0],
      texture: [pattern.width, pattern.height, (t.scale / 100) * input.dpr, blendModeId(t.mode)],
      tone: [t.invert ? 1 : 0, t.brightness, t.contrast, usesPencilCoverage(v.tool) ? 1 : 0],
      flags: [v.useTexture && pattern !== neutral ? 1 : 0, t.eachTip ? 1 : 0, dual ? 1 : 0, v.useNoise ? 1 : 0],
      extra: [
        t.depth / 100,
        blendModeId(v.dualBrush.mode),
        v.useWetEdges ? 1 : 0,
        Math.max(
          0,
          paintModes.findIndex((mode) => mode === v.tool.mode)
        )
      ]
    });
  }
  return {
    hasTip(key: string) {
      return textures.has(key);
    },
    async render(input: PreviewInput, key: string, tip?: BrushTipImage, resources: PreviewResources = {}, auxKey = '') {
      if (lost) throw new Error(lost);
      if (!input.resourcePreview) resources = preparePreviewResources(input, resources);
      if (isRetouch(input)) input = { ...input, opacity: 1, flow: input.values.tool.type === 'MixB' ? input.flow : 1 };
      if (!input.resourcePreview && isBlockEraser(input.values.tool)) {
        input = { ...input, values: blockEraserValues(input.values), opacity: 1, flow: 1 };
        tip = blockEraserTip();
        key = 'block-eraser-square';
        resources = {};
      }
      const primary = cached(key, tip),
        pattern = resources.pattern ? cached(`pattern:${auxKey}`, resources.pattern) : neutral;
      const dual = resources.dualTip ? cached(resources.dualKey ?? `dual:${auxKey}`, resources.dualTip) : undefined;
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
          sampler
        });
        if (stroke.sampledTips) {
          const source = dual.sampled();
          for (let first = 0; first < Math.max(1, stroke.count); first += shader.sampledTipBatchSize) {
            const tips = stroke.sampledTips.slice(first, first + shader.sampledTipBatchSize);
            const plans = source.gpu.prepare(tips.map(tip => planSampledTip(source.levels, tip,
              input.width, input.height, 0, 0, true)));
            try {
              const encoder = device.createCommandEncoder();
              const pass = encoder.beginRenderPass({ colorAttachments: [target.dualPaint, target.dualMask]
                .map(texture => ({ view: root.unwrap(texture).createView(), loadOp: first === 0 ? 'clear' as const : 'load' as const,
                  storeOp: 'store' as const, clearValue: [0, 0, 0, 0] })) });
              tips.forEach((tip, index) => {
                const left = Math.max(0, tip.bounds.left), top = Math.max(0, tip.bounds.top);
                const right = Math.min(input.width, tip.bounds.right), bottom = Math.min(input.height, tip.bounds.bottom);
                if (right <= left || bottom <= top) return;
                pass.setScissorRect(left, top, right - left, bottom - top);
                sampledSecondaryPipeline.with(pass).with(group).with(plans.group).with(shader.stamps, instances)
                  .draw(3, 1, 0, first + index);
              });
              pass.end(); device.queue.submit([encoder.finish()]);
            } finally { plans.destroy(); }
          }
        } else secondaryPipeline
          .with(group)
          .with(shader.stamps, instances)
          .withColorAttachment({
            paint: { view: target.dualPaintView, clearValue: [0, 0, 0, 0], loadOp: 'clear' },
            mask: { view: target.dualMaskView, clearValue: [0, 0, 0, 0], loadOp: 'clear' }
          })
          .draw(6, stroke.count);
      }
      const patternTexture = input.values.useTexture && pattern !== neutral
        ? pattern.pattern(input.width, input.height, (input.values.texture.scale / 100) * input.dpr)
        : neutral.texture;
      const stroke = createPreviewStroke(input, primary);
      writeParams(input, pattern, !!dual && input.values.useDualBrush);
      instances.write(new Float32Array(stroke.data).buffer);
      const group = root.createBindGroup(shader.brushLayout, {
        params,
        tip: primary.texture,
        pattern: patternTexture,
        sampler
      });
      const byteMask = paintbrushMaskMode(input.values, input.stampRole === 'secondary');
      if (byteMask) {
        const encoder = device.createCommandEncoder();
        const clear = encoder.beginRenderPass({ colorAttachments: [{
          view: root.unwrap(target.bytePaint).createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0]
        }] });
        clear.end();
        device.queue.submit([encoder.finish()]);
        // Each submission owns at most 64 plans. Source/mask textures persist across chunks.
        for (let first = 0; first < stroke.count; first += shader.sampledTipBatchSize) {
          const count = Math.min(shader.sampledTipBatchSize, stroke.count - first);
          const records = Array.from({ length: count }, (_, relative) => {
            const index = first + relative;
            return maskRasterRects(stroke.data, index * 16, input.width, input.height,
              stroke.sampledTips?.[index]?.bounds).map(rect => ({ rect, index }));
          }).flat();
          if (!records.length) continue;
          const source = stroke.sampledTips ? primary.sampled() : undefined;
          const plans = source && stroke.sampledTips ? source.gpu.prepare(stroke.sampledTips.slice(first, first + count)
            .map(tip => planSampledTip(source.levels, tip, input.width, input.height))) : undefined;
          try {
            const encoder = device.createCommandEncoder();
            const batch = target.maskBatch(records.length, byteMask);
            batch.write(records.map(record => record.rect));
            records.forEach((record, index) => {
              const pass = encoder.beginRenderPass({ colorAttachments: [{
                view: target!.maskRaster.sourceView, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0]
              }] });
              if (plans) {
                pass.setScissorRect(record.rect.x, record.rect.y, record.rect.width, record.rect.height);
                sampledTipPipeline.with(pass).with(group).with(plans.group).with(shader.stamps, instances)
                  .draw(3, 1, 0, record.index);
              } else maskSourcePipeline.with(pass).with(group).with(shader.stamps, instances).draw(6, 1, 0, record.index);
              pass.end();
              batch.record(encoder, index, root.unwrap(target!.bytePaint));
            });
            device.queue.submit([encoder.finish()]);
          } finally {
            plans?.destroy();
          }
        }
      } else if (!isRetouch(input))
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
        dual: dual && input.values.useDualBrush ? target.dualPaint : neutral.texture,
        params,
        background,
        mask: target.mask,
        paint: byteMask ? target.bytePaint : target.paint,
        pattern: patternTexture
      });
      if (isRetouch(input)) {
        retouch ??= createRetouchPreview(root, format);
        retouch.render(
          input,
          stroke,
          compositeGroup,
          (encoder, index) => {
            const pass = encoder.beginRenderPass({
              colorAttachments: [
                { view: target!.paintAttachment, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' },
                { view: target!.maskAttachment, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }
              ]
            });
            pipeline.with(pass).with(group).with(shader.stamps, instances).draw(6, 1, 0, index);
            pass.end();
          },
          context.getCurrentTexture().createView()
        );
      } else
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
        item.destroy();
      }
      return canvas.transferToImageBitmap();
    },
    dispose() {
      textures.clear();
      root.destroy();
    }
  };
}
