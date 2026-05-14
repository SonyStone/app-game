import { Mesh } from '../core/mesh';
import type { Camera } from '../core/camera';
import type { Geometry } from '../core/geometry';
import type { Program } from '../core/program';
import type { OGLRenderingContext } from '../core/renderer';
import { Texture } from '../core/texture';
import type { Transform } from '../core/transform';
import { Mat4 } from '../math/mat-4';

const tempMat4 = /* @__PURE__ */ new Mat4();
const identity = /* @__PURE__ */ new Mat4();

type GLTFJoint = Transform & {
  bindInverse: Mat4;
};

type GLTFSkeleton = {
  joints: GLTFJoint[];
};

type GLTFSkinOptions = {
  skeleton: GLTFSkeleton;
  geometry: Geometry;
  program: Program;
  mode: GLenum;
};

export class GLTFSkin extends Mesh {
  skeleton!: GLTFSkeleton;
  boneMatrices!: Float32Array;
  boneTextureSize!: number;
  boneTexture!: Texture;

  constructor(gl: OGLRenderingContext, { skeleton, geometry, program, mode = gl.TRIANGLES }: Partial<GLTFSkinOptions> = {}) {
    super(gl, { geometry, program, mode });
    this.skeleton = skeleton!;
    this.createBoneTexture();
  }

  createBoneTexture(): void {
    if (!this.skeleton.joints.length) return;
    const size = Math.max(4, Math.pow(2, Math.ceil(Math.log(Math.sqrt(this.skeleton.joints.length * 4)) / Math.LN2)));
    this.boneMatrices = new Float32Array(size * size * 4);
    this.boneTextureSize = size;
    this.boneTexture = new Texture(this.gl, {
      image: this.boneMatrices,
      generateMipmaps: false,
      type: this.gl.FLOAT,
      internalFormat: this.gl.RGBA32F,
      minFilter: this.gl.NEAREST,
      magFilter: this.gl.NEAREST,
      flipY: false,
      width: size
    });
  }

  updateUniforms(): void {
    // Update bone texture
    this.skeleton.joints.forEach((bone: GLTFJoint, i: number) => {
      // Find difference between current and bind pose
      tempMat4.multiply(bone.worldMatrix, bone.bindInverse);
      this.boneMatrices.set(tempMat4, i * 16);
    });
    this.boneTexture.needsUpdate = true;
    // Reset for programs shared between multiple skins
    this.program.uniforms.boneTexture.value = this.boneTexture;
    this.program.uniforms.boneTextureSize.value = this.boneTextureSize;
  }

  draw({ camera }: { camera?: Camera } = {}): void {
    if (!this.program.uniforms.boneTexture) {
      Object.assign(this.program.uniforms, {
        boneTexture: { value: this.boneTexture },
        boneTextureSize: { value: this.boneTextureSize }
      });
    }

    this.updateUniforms();

    // Switch the world matrix with identity to ignore any transforms
    // on the mesh itself - only use skeleton's transforms
    const _worldMatrix = this.worldMatrix;
    this.worldMatrix = identity;

    super.draw({ camera });

    // Switch back to leave identity untouched
    this.worldMatrix = _worldMatrix;
  }
}
