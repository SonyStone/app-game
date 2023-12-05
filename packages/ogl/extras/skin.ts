import { Mesh } from '../core/mesh';
import { Texture } from '../core/texture';
import { Transform } from '../core/transform';
import { Mat4 } from '../math/mat-4';
import { Animation } from './animation';

const tempMat4 = /* @__PURE__ */ new Mat4();

import { GL_STATIC_VARIABLES } from '@webgl/static-variables';
import type { Camera } from '../core/camera';
import type { Geometry } from '../core/geometry';
import type { Program } from '../core/program';
import type { OGLRenderingContext } from '../core/renderer';
import type { Quat } from '../math/quat';
import type { Vec3 } from '../math/vec-3';

export interface SkinRig {
  bindPose: { position: Vec3; quaternion: Quat; scale: Vec3 };
  bones: { name: string; parent: Transform }[];
}

export interface SkinOptions {
  rig: SkinRig;
  geometry: Geometry;
  program: Program;
  mode: GLenum;
}

export interface BoneTransform extends Transform {
  name: string;
  bindInverse: Mat4;
}

/**
 * A mesh with a skeleton and bones for animation.
 * @see {@link https://github.com/oframe/ogl/blob/master/src/extras/Skin.js | Source}
 */
export class Skin extends Mesh {
  root!: Transform;

  bones!: BoneTransform[];

  boneMatrices!: Float32Array;
  boneTextureSize!: number;
  boneTexture!: Texture;
  animations: Animation[];

  constructor(gl: OGLRenderingContext, { rig, geometry, program, mode = gl.TRIANGLES }: Partial<SkinOptions> = {}) {
    super(gl, { geometry, program, mode });

    this.createBones(rig!);
    this.createBoneTexture();
    this.animations = [];

    Object.assign(this.program.uniforms, {
      boneTexture: { value: this.boneTexture },
      boneTextureSize: { value: this.boneTextureSize }
    });
  }

  createBones(rig: SkinRig): void {
    // Create root so that can simply update world matrix of whole skeleton
    this.root = new Transform();

    // Create bones
    this.bones = [];
    if (!rig.bones || !rig.bones.length) {
      return;
    }
    for (let i = 0; i < rig.bones.length; i++) {
      const bone = new Transform();

      // Set initial values (bind pose)
      bone.position.fromArray(rig.bindPose.position, i * 3);
      bone.quaternion.fromArray(rig.bindPose.quaternion, i * 4);
      bone.scale.fromArray(rig.bindPose.scale, i * 3);

      this.bones.push(bone as any);
    }

    // Once created, set the hierarchy
    rig.bones.forEach((data, i) => {
      this.bones[i].name = data.name;
      if ((data.parent as any) === -1) {
        return this.bones[i].setParent(this.root);
      }
      this.bones[i].setParent(this.bones[data.parent as any]);
    });

    // Then update to calculate world matrices
    this.root.updateMatrixWorld(true);

    // Store inverse of bind pose to calculate differences
    this.bones.forEach((bone) => {
      bone.bindInverse = new Mat4(...bone.worldMatrix).inverse();
    });
  }

  createBoneTexture(): void {
    if (!this.bones.length) return;
    const size = Math.max(4, Math.pow(2, Math.ceil(Math.log(Math.sqrt(this.bones.length * 4)) / Math.LN2)));
    this.boneMatrices = new Float32Array(size * size * 4);
    this.boneTextureSize = size;
    this.boneTexture = new Texture(this.gl, {
      image: this.boneMatrices,
      generateMipmaps: false,
      type: this.gl.FLOAT,
      internalFormat: this.gl.renderer.isWebgl2 ? GL_STATIC_VARIABLES.RGBA32F : GL_STATIC_VARIABLES.RGBA,
      minFilter: this.gl.NEAREST,
      magFilter: this.gl.NEAREST,
      flipY: false,
      width: size
    });
  }

  addAnimation(data: Animation['data']): Animation {
    const animation = new Animation({ objects: this.bones, data });
    this.animations.push(animation);
    return animation;
  }

  update(): void {
    // Calculate combined animation weight
    let total = 0;
    this.animations.forEach((animation) => (total += animation.weight));

    this.animations.forEach((animation, i) => {
      // force first animation to set in order to reset frame
      animation.update(total, i === 0);
    });
  }

  draw({ camera }: { camera?: Camera } = {}): void {
    // Update world matrices manually, as not part of scene graph
    this.root.updateMatrixWorld(true);

    // Update bone texture
    this.bones.forEach((bone, i) => {
      // Find difference between current and bind pose
      tempMat4.multiply(bone.worldMatrix, bone.bindInverse);
      this.boneMatrices.set(tempMat4, i * 16);
    });
    if (this.boneTexture) this.boneTexture.needsUpdate = true;

    super.draw({ camera });
  }
}
