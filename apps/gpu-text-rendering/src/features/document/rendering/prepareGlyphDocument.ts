import { err, ok } from 'neverthrow';
import { d, type TgpuBindGroup } from 'typegpu';
import type { GpuContext } from '../../../shared/gpu/context';
import type { KeepGpuResource } from '../../../shared/gpu/resources';
import type { TextDocument } from '../document';
import { compactGlyphs } from '../format/compactGlyphs';
import { GlyphInstance, glyphInstanceLayout } from './bindings';
import type { SceneFrame } from './createFrame';
import { createPageBackground } from './createPageBackground';
import { createGlyphAtlas } from './glyphAtlas';
import { glyphFragment, glyphInstanceVertex } from './glyphShader';
import type { PreparedDocument } from './preparedDocument';
import { uploadBuffer } from './uploadBuffer';

/**
 * Prepares a profile-1 glyph document: uploads packed glyph instances in storage-sized batches, the glyph atlas
 * and page backgrounds, and compiles their pipelines. Legacy six-vertex (72-byte) glyph streams are packed here;
 * loader-supplied 28-byte instances upload unchanged. Resolves a typed error when the GPU context became
 * inactive; TypeGPU exceptions propagate to the renderer boundary.
 */
export async function prepareGlyphDocument(
  gpu: GpuContext,
  document: Extract<TextDocument, { kind: 'glyphs' }>,
  keep: KeepGpuResource
) {
  const { root, device, format } = gpu;

  const glyphData =
    document.glyphEncoding === 'instances'
      ? document.glyphVertices
      : compactGlyphs(document.glyphVertices, document.pages);
  const glyphBytes = d.sizeOf(GlyphInstance);
  const glyphCount = glyphData.byteLength / glyphBytes;
  const batchSize = Math.floor(
    Math.min(device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize) / glyphBytes
  );
  const glyphBatches: { first: number; end: number; group: TgpuBindGroup }[] = [];
  for (let first = 0; first < Math.max(1, glyphCount); first += batchSize) {
    const count = Math.min(batchSize, glyphCount - first);
    const buffer = keep(root.createBuffer(d.arrayOf(GlyphInstance, Math.max(1, count)))).$usage('storage');
    await uploadBuffer(gpu, buffer.buffer, glyphData, first * glyphBytes, count * glyphBytes);
    glyphBatches.push({
      first,
      end: first + count,
      group: root.createBindGroup(glyphInstanceLayout, { glyphs: buffer })
    });
  }

  const background = createPageBackground(gpu, document, keep);

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
    .with(background.group)
    .with(atlasGroup);

  // Compile every pipeline before exposing the first frame.
  root.unwrap(glyphPipeline);
  background.compile();
  await device.queue.onSubmittedWorkDone();

  const resourceBytes = Math.max(glyphBytes, glyphData.byteLength) + background.resourceBytes + atlasBytes;

  return ok<PreparedDocument>({
    events: new EventTarget(),
    settle: async () => {},
    failure: undefined,
    refinement: undefined,
    resourceBytes,
    draw(pass: GPURenderPassEncoder, frame: SceneFrame) {
      background.writeView(frame, [1 / rasterSize[0], 1 / rasterSize[1]], Number(frame.grids));
      background.draw(pass);

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
