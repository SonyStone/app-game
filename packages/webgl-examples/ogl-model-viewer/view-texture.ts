import { Mesh, OGLRenderingContext, Plane, Program, Texture, Transform } from '@packages/ogl';
import { CompressedImage } from '@packages/ogl/core/texture';
import { Vec3Tuple } from '@packages/ogl/math/vec-3';
import { loadDDSLevels } from './dds';
import fragment from './view-texture.frag?raw';
import vertex from './view-texture.vert?raw';

export function viewTexture({
  gl,
  scene,
  diffuse,
  position
}: {
  gl: OGLRenderingContext;
  scene: Transform;
  diffuse: ArrayBuffer;
  position: Vec3Tuple;
}) {
  const plane = new Plane(gl, { width: 1, height: 1, widthSegments: 1, heightSegments: 1 });

  const ddsLevels = loadDDSLevels(gl, diffuse)!;
  const compressedImage: CompressedImage = ddsLevels.mipmaps;
  compressedImage.isCompressedTexture = true;

  const texture = new Texture(gl, {
    image: compressedImage,
    width: ddsLevels.width,
    height: ddsLevels.height,
    internalFormat: ddsLevels.format,
    magFilter: gl.NEAREST,
    generateMipmaps: false
  });

  const program = new Program(gl, {
    vertex,
    fragment,
    cullFace: null,
    uniforms: {
      map: { value: texture }
    }
  });

  const mesh = new Mesh(gl, { mode: gl.TRIANGLES, geometry: plane, program });
  mesh.position.set(position);
  mesh.setParent(scene);
}
