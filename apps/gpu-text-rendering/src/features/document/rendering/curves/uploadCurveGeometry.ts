import { d } from 'typegpu';
import type { GpuDevice } from '../../../../shared/gpu/context';
import type { KeepGpuResource } from '../../../../shared/gpu/resources';
import type { TextDocument } from '../../document';
import type { buildCurvePreparation } from '../../plan/buildCurvePreparation';
import { imageCount } from '../../plan/imageRecord';
import { uploadBuffer } from '../uploadBuffer';
import { Cubic, CurveInstance, curveLayout } from './curveBindings';
import { RadialGradient, radialLayout } from './radialGradient';

/**
 * Uploads the document's reusable cubic outlines, bin-indexed DRAW/CLIP records, curve bins and radial
 * gradient geometry, in chunks that yield to the event loop. Buffers are released through `keep`'s owner.
 * `indexed` supplies the DRAW/CLIP copies with curve-bin offsets filled in; the source records stay untouched.
 * Throws if the GPU context becomes inactive between chunks.
 */
export async function uploadCurveGeometry(
  gpu: GpuDevice,
  document: Extract<TextDocument, { kind: 'curves' }>,
  indexed: ReturnType<typeof buildCurvePreparation>['indexed'],
  keep: KeepGpuResource
) {
  const { root } = gpu;
  const curves = keep(root.createBuffer(d.arrayOf(Cubic, count(document.curves, Cubic)))).$usage('storage');
  await uploadBuffer(gpu, curves.buffer, document.curves);
  const instances = keep(root.createBuffer(d.arrayOf(CurveInstance, count(document.instances, CurveInstance)))).$usage(
    'storage'
  );
  await uploadBuffer(gpu, instances.buffer, indexed.instances);
  const clips = keep(root.createBuffer(d.arrayOf(CurveInstance, count(document.clips, CurveInstance)))).$usage(
    'storage'
  );
  await uploadBuffer(gpu, clips.buffer, indexed.clips);
  const bins = keep(root.createBuffer(d.arrayOf(d.u32, count(indexed.bins, d.u32)))).$usage('storage');
  await uploadBuffer(gpu, bins.buffer, indexed.bins);
  // One gradient slot per IMAG record: image draws index both tables with the same id.
  const gradients = Math.max(1, imageCount(document.rasterImages.table));
  const radialData = keep(
    root.createBuffer(d.arrayOf(RadialGradient, gradients), (buffer) => buffer.write(document.radialGradients))
  ).$usage('storage');
  const quadIndices = keep(root.createBuffer(d.arrayOf(d.u16, 6), [0, 1, 2, 2, 1, 5])).$usage('index');

  return {
    /** Curves, DRAW instances, CLIP chains and bins, shared by every curve and image pipeline. */
    group: root.createBindGroup(curveLayout, { curves, instances, clips, bins }),
    /** Image-indexed radial gradient geometry for the image pipelines. */
    radial: root.createBindGroup(radialLayout, { gradients: radialData }),
    /** Six indices expanding one instance into its quad. */
    quadIndices,
    /** Allocated bytes; empty sections still occupy one record. */
    resourceBytes:
      bytes(document.curves, Cubic) +
      bytes(document.instances, CurveInstance) +
      bytes(document.clips, CurveInstance) +
      bytes(indexed.bins, d.u32) +
      gradients * d.sizeOf(RadialGradient) +
      6 * d.sizeOf(d.u16)
  };
}

/** Elements of `schema` in `data`, at least one: WebGPU rejects zero-sized bindings. */
function count(data: ArrayBuffer, schema: d.AnyWgslData) {
  return Math.max(1, data.byteLength / d.sizeOf(schema));
}

/** Allocated bytes of a buffer sized by {@link count}. */
function bytes(data: ArrayBuffer, schema: d.AnyWgslData) {
  return Math.max(d.sizeOf(schema), data.byteLength);
}
