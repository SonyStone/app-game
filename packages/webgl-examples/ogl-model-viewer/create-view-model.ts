import { Geometry, Mesh, OGLRenderingContext, Program, Texture, Transform } from '@packages/ogl';
import { CompressedImage } from '@packages/ogl/core/texture';
import { GL_CONST } from '@packages/webgl/static-variables/static-variables';
import fragment from './create-view-model.frag?raw';
import vertex from './create-view-model.vert?raw';
import { loadDDSLevels } from './dds';

const Byte = 4;

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
  uv: Float32Array | Uint16Array;
  doubleTexcoord?: boolean;
  index: Uint32Array;
  diffuse: ArrayBuffer;
}) {
  const geometry = new Geometry(gl, {
    position: { size: 3, data, stride: Byte * (3 + 3 + 4), offset: Byte * 0 },
    normal: { size: 3, data, stride: Byte * (3 + 3 + 4), offset: Byte * 3 },
    tangent: { size: 4, data, stride: Byte * (3 + 3 + 4), offset: Byte * (3 + 3) },
    uv: doubleTexcoord
      ? { size: 2, data: uv, stride: Byte * 2, offset: Byte, type: GL_CONST.HALF_FLOAT }
      : { size: 2, data: uv, stride: Byte * (2 + 3), offset: Byte },
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
