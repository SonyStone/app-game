import type { d, ValidateUniformSchema } from 'typegpu';
import { createGpuResource } from '../../shared/gpu/createGpuResource';
import { useFrame } from './FrameLoop';

/**
 * Owns a uniform buffer beneath FrameLoop and writes `value` into it in the render phase of every drawn frame,
 * before layers record their draws. Read per-frame state such as the camera inside `value`: reactive reads
 * request a new frame when they change, and non-reactive state is current whenever a frame is drawn.
 * Bind the returned buffer through a bind group, as with `root.createBuffer(schema).$usage('uniform')`.
 */
export function createUniform<TSchema extends d.AnyWgslData>(
  schema: ValidateUniformSchema<TSchema>,
  value: () => d.InferInput<TSchema>
) {
  const buffer = createGpuResource(({ root }) => root.createUniform(schema).buffer);

  useFrame(() => buffer.write(value()));

  return buffer;
}
