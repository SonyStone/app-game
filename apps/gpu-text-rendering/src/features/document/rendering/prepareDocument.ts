import { err, ok } from 'neverthrow';
import { d, type TgpuBindGroup } from 'typegpu';
import { documentError } from '../../../shared/errors';
import type { GpuContext } from '../../../shared/gpu/context';
import type { KeepGpuResource } from '../../../shared/gpu/resources';
import { pageVertices, type TextDocument } from '../document';
import { View, glyphLayout, imageLayout, imageTextureLayout, pageLayout, viewLayout } from './bindings';
import { createGlyphAtlas } from './glyphAtlas';
import { glyphFragment, glyphVertex } from './glyphShader';
import { imageFragment, imageVertex, pageFragment, pageVertex } from './pageShader';

/** Uploads geometry, builds pipelines and prerenders the atlas. The renderer boundary captures TypeGPU exceptions. */
export async function prepareDocument(gpu: GpuContext, document: TextDocument, keep: KeepGpuResource) {
  if (document.imageVertices.byteLength % 10 !== 0) {
    return err(documentError('invalid-data', 'Invalid image vertex length'));
  }

  const { root, device, format } = gpu;

  const glyphs = keep(
    root.createBuffer(glyphLayout.schemaForCount(document.glyphVertices.byteLength / 12), (buffer) =>
      buffer.write(document.glyphVertices)
    )
  ).$usage('vertex');

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
      attribs: glyphLayout.attrib,
      vertex: glyphVertex,
      fragment: glyphFragment,
      targets: { format, blend },
      primitive: { topology: 'triangle-list' }
    })
    .with(frameGroup)
    .with(atlasGroup)
    .with(glyphLayout, glyphs);

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

  const images = keep(
    root.createBuffer(imageLayout.schemaForCount(Math.max(1, document.imageVertices.byteLength / 10)), (buffer) =>
      buffer.write(padImageVertices(document.imageVertices).buffer)
    )
  ).$usage('vertex');

  const imagePipeline = root
    .createRenderPipeline({
      attribs: imageLayout.attrib,
      vertex: imageVertex,
      fragment: imageFragment,
      targets: { format, blend },
      primitive: { topology: 'triangle-strip' }
    })
    .with(frameGroup)
    .with(imageLayout, images);

  const imageSampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const imageGroups = new Map<string, TgpuBindGroup>();

  for (const [name, bitmap] of document.images) {
    const texture = keep(root.createTexture({ size: [bitmap.width, bitmap.height], format: 'rgba8unorm' })).$usage(
      'sampled',
      'render'
    );

    texture.write(bitmap);
    imageGroups.set(
      name,
      root.createBindGroup(imageTextureLayout, { image: texture.createView(), sampler: imageSampler })
    );
  }

  // Compile every pipeline before exposing the first frame.
  root.unwrap(glyphPipeline);
  root.unwrap(pagePipeline);
  root.unwrap(imagePipeline);
  await device.queue.onSubmittedWorkDone();

  const resourceBytes =
    document.glyphVertices.byteLength +
    pageData.byteLength +
    document.pages.length * 8 +
    48 +
    Math.max(12, (document.imageVertices.byteLength / 10) * 12) +
    atlasBytes +
    [...document.images.values()].reduce((n, b) => n + b.width * b.height * 4, 0);

  return ok({ view, rasterSize, glyphPipeline, pagePipeline, imagePipeline, imageGroups, resourceBytes });
}

/** Copies ten-byte legacy image vertices into WebGPU's four-byte-aligned stride. */
function padImageVertices(source: ArrayBuffer) {
  const result = new Uint8Array(Math.max(12, (source.byteLength / 10) * 12));
  const bytes = new Uint8Array(source);

  for (let i = 0; i < source.byteLength / 10; i++) result.set(bytes.subarray(i * 10, i * 10 + 10), i * 12);

  return result;
}
