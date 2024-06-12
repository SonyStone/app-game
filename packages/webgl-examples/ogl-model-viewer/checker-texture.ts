import { Mesh, OGLRenderingContext, Plane, Program, Transform } from '@packages/ogl';
import { createTexture4colors } from './texture-4-colors';
import fragment from './view-texture.frag?raw';
import vertex from './view-texture.vert?raw';

export function checkerTexture({ gl, scene }: { gl: OGLRenderingContext; scene: Transform }) {
  const plane = new Plane(gl, { width: 4, height: 4, widthSegments: 1, heightSegments: 1 });
  plane.attributes.uv.data = new Float32Array([0, 4, 4, 4, 0, 0, 4, 0]);
  plane.attributes.uv.needsUpdate = true;

  const texture4colors = createTexture4colors(gl);

  const program = new Program(gl, {
    vertex,
    fragment,
    cullFace: null,
    uniforms: {
      map: { value: texture4colors }
    }
  });

  const mesh = new Mesh(gl, { mode: gl.TRIANGLES, geometry: plane, program });
  mesh.position.set(0, 0, 0);
  mesh.rotation.x = Math.PI / 2;
  mesh.setParent(scene);
}
