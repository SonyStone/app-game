import { Mesh, OGLRenderingContext, Plane, Program, Texture, Transform } from '@packages/ogl';
import fragment from './view-texture.frag?raw';
import vertex from './view-texture.vert?raw';

export function checkerTexture({ gl, scene }: { gl: OGLRenderingContext; scene: Transform }) {
  const plane = new Plane(gl, { width: 4, height: 4, widthSegments: 1, heightSegments: 1 });
  plane.attributes.uv.data = new Float32Array([0, 4, 4, 4, 0, 0, 4, 0]);
  plane.attributes.uv.needsUpdate = true;

  const texture4colors = new Texture(gl, {
    image: new Uint8Array([191, 25, 54, 255, 96, 18, 54, 255, 96, 18, 54, 255, 37, 13, 53, 255]),
    width: 2,
    height: 2,
    wrapS: gl.REPEAT,
    wrapT: gl.REPEAT,
    magFilter: gl.NEAREST
  });

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
