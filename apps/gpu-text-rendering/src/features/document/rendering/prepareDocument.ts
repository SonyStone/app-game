import { err, ok } from 'neverthrow';
import { d, type TgpuBindGroup } from 'typegpu';
import type { GpuError } from '../../../shared/errors';
import type { GpuContext } from '../../../shared/gpu/context';
import type { KeepGpuResource } from '../../../shared/gpu/resources';
import { pageVertices, type TextDocument } from '../document';
import { GlyphInstance, glyphInstanceLayout, pageLayout, View, viewLayout } from './bindings';
import { compactGlyphs } from './compactGlyphs';
import type { SceneFrame } from './createFrame';
import { prepareCurveDocument } from './curves/prepareCurveDocument';
import type { DocumentWorkers } from './DocumentWorkers';
import { createGlyphAtlas } from './glyphAtlas';
import { glyphFragment, glyphInstanceVertex } from './glyphShader';
import { pageFragment, pageVertex } from './pageShader';
import { uploadBuffer } from './uploadBuffer';

/** Selects a profile renderer, uploads geometry and builds its pipelines. The renderer boundary captures TypeGPU exceptions. */
export async function prepareDocument(
  gpu: GpuContext,
  document: TextDocument,
  keep: KeepGpuResource,
  workers: DocumentWorkers,
  initialFrame?: SceneFrame
) {
  if (document.kind === 'curves') {
    return prepareCurveDocument(gpu, document, keep, workers, initialFrame);
  }

  const { root, device, format } = gpu;

  const glyphData =
    document.glyphEncoding === 'instances'
      ? document.glyphVertices
      : compactGlyphs(document.glyphVertices, document.pages);
  const glyphCount = glyphData.byteLength / 28;
  const batchSize = Math.floor(Math.min(device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize) / 28);
  const glyphBatches: { first: number; end: number; group: TgpuBindGroup }[] = [];
  for (let first = 0; first < Math.max(1, glyphCount); first += batchSize) {
    const count = Math.min(batchSize, glyphCount - first);
    const buffer = keep(root.createBuffer(d.arrayOf(GlyphInstance, Math.max(1, count)))).$usage('storage');
    await uploadBuffer(gpu, buffer.buffer, glyphData, first * 28, count * 28);
    glyphBatches.push({
      first,
      end: first + count,
      group: root.createBindGroup(glyphInstanceLayout, { glyphs: buffer })
    });
  }

  const pageData = pageVertices(document);
  const pages = keep(
    root.createBuffer(pageLayout.schemaForCount(pageData.length / 2), (buffer) => buffer.write(pageData.buffer))
  ).$usage('vertex');

  const offsets = keep(
    root.createBuffer(
      d.arrayOf(d.vec2f, document.pages.length),
      document.pages.map((page) => d.vec2f(page.x, page.y))
    )
  ).$usage('storage');

  const view = keep(root.createBuffer(View)).$usage('uniform');
  const frameGroup = root.createBindGroup(viewLayout, { view, pages: offsets });

  const blend: GPUBlendState = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }
  };

  const { atlasGroup, rasterSize, resourceBytes: atlasBytes } = await createGlyphAtlas(gpu, document, blend, keep);

  const active = gpu.checkActive();
  if (active.isErr()) {
    return err(active.error);
  }

  const glyphPipeline = root
    .createRenderPipeline({
      vertex: glyphInstanceVertex,
      fragment: glyphFragment,
      targets: { format, blend },
      primitive: { topology: 'triangle-list' }
    })
    .with(frameGroup)
    .with(atlasGroup);

  const pagePipeline = root
    .createRenderPipeline({
      attribs: { position: pageLayout.attrib },
      vertex: pageVertex,
      fragment: pageFragment,
      targets: { format },
      primitive: { topology: 'triangle-strip' }
    })
    .with(frameGroup)
    .with(pageLayout, pages);

  // Compile every pipeline before exposing the first frame.
  root.unwrap(glyphPipeline);
  root.unwrap(pagePipeline);
  await device.queue.onSubmittedWorkDone();

  const resourceBytes =
    Math.max(28, glyphData.byteLength) + pageData.byteLength + document.pages.length * 8 + 48 + atlasBytes;

  return ok({
    events: new EventTarget(),
    settle: async () => {},
    failure: undefined as GpuError | undefined,
    resourceBytes,
    draw(pass: GPURenderPassEncoder, frame: SceneFrame) {
      view.write({
        mul: frame.mul,
        add: frame.add,
        rotation: frame.rotation,
        rasterTexel: [1 / rasterSize[0], 1 / rasterSize[1]],
        debug: Number(frame.grids),
        vectorOnly: Number(frame.vectorOnly)
      });

      pagePipeline.with(pass).draw(document.pages.length * 6);

      const glyphs = glyphPipeline.with(pass);

      for (const item of frame.visible) {
        for (const batch of glyphBatches) {
          const first = Math.max(batch.first, item.page.beginVertex / 6);
          const end = Math.min(batch.end, item.page.endVertex / 6);
          if (first < end) {
            glyphs.with(batch.group).draw((end - first) * 6, 1, (first - batch.first) * 6);
          }
        }
      }
    }
  });
}
