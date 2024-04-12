import { Geometry, Mesh, OGLRenderingContext, Program, Transform } from '@packages/ogl';
import { Vec3Tuple } from '@packages/ogl/math/vec-3';
import { GL_DRAW_ARRAYS_MODE } from '@packages/webgl/static-variables';
import { GL_CONST } from '@packages/webgl/static-variables/static-variables';
import fragment from './view-uv-map.frag?raw';
import vertex from './view-uv-map.vert?raw';

export function viewUVMap({
  gl,
  scene,
  position,
  uv,
  doubleTexcoord = false,
  index
}: {
  gl: OGLRenderingContext;
  scene: Transform;
  uv: Float32Array;
  doubleTexcoord?: boolean;
  index: Uint32Array;
  position: Vec3Tuple;
}) {
  const geometry = new Geometry(gl, {
    uv: doubleTexcoord
      ? { size: 2, data: uv, stride: 4 * 2, offset: 4, type: GL_CONST.HALF_FLOAT }
      : { size: 2, data: uv, stride: 4 * 5, offset: 4 },
    index: { data: index }
  });

  const program = new Program(gl, {
    vertex: vertex,
    fragment,
    cullFace: null
  });

  const mesh = new Mesh(gl, { mode: GL_DRAW_ARRAYS_MODE.POINTS, geometry: geometry, program });
  mesh.position.set(position);
  mesh.setParent(scene);
}
