import tgpu, { d, std } from 'typegpu';
import { viewLayout } from './bindings';

/** Maps page coordinates into clip space with rotation corrected for viewport aspect. */
export function project(position: d.v2f, page: number) {
  'use gpu';
  const local = std.sub(position, viewLayout.$.pages[page]!);

  return projectGlobal(local);
}

/** Projects coordinates that already include page placement. */
export function projectGlobal(position: d.v2f) {
  'use gpu';
  const p = std.add(std.mul(position, viewLayout.$.view.mul), viewLayout.$.view.add);
  const r = viewLayout.$.view.rotation;

  return d.vec4f(r.x * p.x + r.z * p.y, r.y * p.x + r.w * p.y, 0, 1);
}

/** Background shader shared with the frame's global transform. */
export const pageVertex = tgpu.vertexFn({ in: { position: d.vec2f }, out: { position: d.builtin.position } })((
  input
) => {
  'use gpu';
  return { position: projectGlobal(d.vec2f(input.position.x, 1 - input.position.y)) };
});

/** Opaque white paper. */
export const pageFragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
  'use gpu';
  return d.vec4f(1);
});
