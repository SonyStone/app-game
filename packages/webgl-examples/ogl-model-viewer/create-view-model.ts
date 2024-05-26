import { Geometry, Mesh, OGLRenderingContext, Program, Texture, Transform } from '@packages/ogl';
import { CompressedImage } from '@packages/ogl/core/texture';
import { GL_CONST } from '@packages/webgl/static-variables/static-variables';
import fragment from './create-view-model.frag?raw';
import vertex from './create-view-model.vert?raw';
import { loadDDSLevels } from './dds';

export async function loadModel({
  gl,
  scene,
  data,
  uv,
  doubleTexcoord = false,
  index,
  diffuse
}: {
  gl: OGLRenderingContext;
  scene: Transform;
  data: Float32Array;
  uv: Float32Array;
  doubleTexcoord?: boolean;
  index: Uint32Array;
  diffuse: ArrayBuffer;
}) {
  const geometry = new Geometry(gl, {
    position: { size: 3, data, stride: 4 * 10, offset: 0 },
    normal: { size: 3, data, stride: 4 * 10, offset: 12 },
    tangent: { size: 4, data, stride: 4 * 10, offset: 12 + 12 },
    uv: doubleTexcoord
      ? { size: 2, data: uv, stride: 4 * 2, offset: 4, type: GL_CONST.HALF_FLOAT }
      : { size: 2, data: uv, stride: 4 * 5, offset: 4 },
    index: { data: index }
  });

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

  {
    const mesh = new Mesh(gl, { mode: gl.TRIANGLES, geometry: geometry, program });
    mesh.position.set(0, 0, 0);
    mesh.setParent(scene);
  }
}
