import type { GpuDevice, KeepGpuResource } from '@app-game/solid-gpu/gpu';
import { d } from 'typegpu';
import { pageVertices, type TextDocument } from '../document';
import { pageLayout, View, viewLayout } from './bindings';
import type { SceneFrame } from './createFrame';
import { pageFragment, pageVertex } from './pageShader';

/**
 * Allocates the per-document view uniform, static page offsets and white page paper shared by both renderers.
 * Buffers are released through `keep`'s owner. The pipeline compiles lazily; call `compile` before exposing
 * the first frame.
 */
export function createPageBackground(gpu: GpuDevice, document: TextDocument, keep: KeepGpuResource) {
  const { root, format } = gpu;
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
  const group = root.createBindGroup(viewLayout, { view, pages: offsets });
  const pipeline = root
    .createRenderPipeline({
      attribs: { position: pageLayout.attrib },
      vertex: pageVertex,
      fragment: pageFragment,
      targets: { format },
      primitive: { topology: 'triangle-strip' }
    })
    .with(group)
    .with(pageLayout, pages);

  return {
    /** Frame transform uniform bound through `group`. */
    view,
    /** Static page offsets; also bound by cropped compositing views. */
    offsets,
    /** View and page-offset bindings shared by every document pipeline. */
    group,
    /** Vertex, offset and view bytes. */
    resourceBytes: pageData.byteLength + document.pages.length * 8 + d.sizeOf(View),
    /** Compiles the page pipeline so the first frame does not stall. */
    compile() {
      root.unwrap(pipeline);
    },
    /** Draws every page's paper into `pass`; pages outside the view are clipped by the rasterizer. */
    draw(pass: GPURenderPassEncoder) {
      pipeline.with(pass).draw(document.pages.length * 6);
    },
    /**
     * Queues the frame's transform with a renderer-specific raster texel size and debug flag.
     * Queue writes land before the next submission, so a pass sees the last write made before it is submitted.
     */
    writeView(frame: SceneFrame, rasterTexel: [number, number], debug: number) {
      view.write({
        mul: frame.mul,
        add: frame.add,
        rotation: frame.rotation,
        rasterTexel,
        debug,
        vectorOnly: frame.vectorOnly ? 1 : 0
      });
    }
  };
}
