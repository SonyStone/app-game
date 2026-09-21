import { d } from 'typegpu';
import type { GpuContext } from '../../../shared/gpu/context';
import type { KeepGpuResource } from '../../../shared/gpu/resources';
import type { TextDocument } from '../document';
import { View, atlasLayout, glyphLayout, viewLayout } from './bindings';
import { glyphFragment, glyphVertex } from './glyphShader';

/** Uploads curve metadata and prerenders mipmapped glyph coverage for small text. */
export async function createGlyphAtlas(
  gpu: GpuContext,
  document: TextDocument,
  blend: GPUBlendState,
  keep: KeepGpuResource
) {
  const { root, device } = gpu;

  const atlas = keep(
    root.createTexture({ size: [document.atlas.width, document.atlas.height], format: 'rgba8unorm' })
  ).$usage('sampled');

  device.queue.writeTexture(
    { texture: root.unwrap(atlas) },
    document.atlas.buf,
    { bytesPerRow: document.atlas.width * 4 },
    [document.atlas.width, document.atlas.height]
  );

  const rasterSize: [number, number] = [document.atlasVertices.width, document.atlasVertices.height];
  const raster = keep(
    root.createTexture({
      size: rasterSize,
      format: 'rgba8unorm',
      mipLevelCount: 1 + Math.floor(Math.log2(Math.max(...rasterSize)))
    })
  ).$usage('sampled', 'render');

  const sampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'nearest' });
  const curvesView = atlas.createView();
  const rasterView = raster.createView();
  const atlasGroup = root.createBindGroup(atlasLayout, { curves: curvesView, raster: rasterView, sampler });

  // A distinct dummy sampled texture avoids binding the render target as both input and output.
  const dummy = keep(root.createTexture({ size: [1, 1], format: 'rgba8unorm' })).$usage('sampled');
  const preGroup = root.createBindGroup(atlasLayout, { curves: curvesView, raster: dummy.createView(), sampler });

  const preVertices = keep(
    root.createBuffer(glyphLayout.schemaForCount(document.atlasVertices.buf.byteLength / 12), (buffer) =>
      buffer.write(document.atlasVertices.buf)
    )
  ).$usage('vertex');

  const preView = keep(
    root.createBuffer(View, {
      mul: [2, 2],
      add: [-1, -1],
      rotation: [1, 0, 0, 1],
      rasterTexel: [1 / rasterSize[0], 1 / rasterSize[1]],
      debug: 0,
      vectorOnly: 1
    })
  ).$usage('uniform');

  const offsets = keep(root.createBuffer(d.arrayOf(d.vec2f, 1), [[0, 0]])).$usage('storage');
  const preFrameGroup = root.createBindGroup(viewLayout, { view: preView, pages: offsets });

  const prePipeline = root
    .createRenderPipeline({
      attribs: glyphLayout.attrib,
      vertex: glyphVertex,
      fragment: glyphFragment,
      targets: { format: 'rgba8unorm', blend },
      primitive: { topology: 'triangle-list' }
    })
    .with(preFrameGroup)
    .with(preGroup)
    .with(glyphLayout, preVertices);

  root.unwrap(prePipeline);
  prePipeline
    .withColorAttachment({
      view: raster.createView('render', { mipLevelCount: 1 }),
      clearValue: [0, 0, 0, 1],
      loadOp: 'clear',
      storeOp: 'store'
    })
    .draw(document.atlasVertices.buf.byteLength / 12);

  raster.generateMipmaps();
  await device.queue.onSubmittedWorkDone();

  preVertices.destroy();
  preView.destroy();
  dummy.destroy();
  offsets.destroy();

  return {
    atlasGroup,
    rasterSize,
    resourceBytes: document.atlas.buf.byteLength + Math.ceil((rasterSize[0] * rasterSize[1] * 4 * 4) / 3)
  };
}
