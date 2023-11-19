import { Quat } from '../math/quat';
import { Vec3 } from '../math/vec-3';

import type { BoneTransform } from './skin';

const prevPos = /* @__PURE__ */ new Vec3();
const prevRot = /* @__PURE__ */ new Quat();
const prevScl = /* @__PURE__ */ new Vec3();

const nextPos = /* @__PURE__ */ new Vec3();
const nextRot = /* @__PURE__ */ new Quat();
const nextScl = /* @__PURE__ */ new Vec3();

export interface AnimationFrame {
  position: Vec3;
  quaternion: Quat;
  scale: Vec3;
}

export interface AnimationData {
  frames: AnimationFrame[];
}

export interface AnimationOptions {
  objects: BoneTransform[];
  data: AnimationData;
}

/**
 * A class for animation.
 * @see {@link https://github.com/oframe/ogl/blob/master/src/extras/Animation.js | Source}
 */
export class Animation {
  objects: BoneTransform[];
  data: AnimationData;
  elapsed: number;
  weight: number;
  duration: number;

  constructor({ objects, data }: AnimationOptions) {
    this.objects = objects;
    this.data = data;
    this.elapsed = 0;
    this.weight = 1;
    this.duration = data.frames.length - 1;
  }

  update(totalWeight: number = 1, isSet?: boolean): void {
    const weight = isSet ? 1 : this.weight / totalWeight;
    const elapsed = this.elapsed % this.duration;

    const floorFrame = Math.floor(elapsed);
    const blend = elapsed - floorFrame;
    const prevKey = this.data.frames[floorFrame];
    const nextKey = this.data.frames[(floorFrame + 1) % this.duration];

    this.objects.forEach((object, i) => {
      prevPos.fromArray(prevKey.position, i * 3);
      prevRot.fromArray(prevKey.quaternion, i * 4);
      prevScl.fromArray(prevKey.scale, i * 3);

      nextPos.fromArray(nextKey.position, i * 3);
      nextRot.fromArray(nextKey.quaternion, i * 4);
      nextScl.fromArray(nextKey.scale, i * 3);

      prevPos.lerp(nextPos, blend);
      prevRot.slerp(nextRot, blend);
      prevScl.lerp(nextScl, blend);

      object.position.lerp(prevPos, weight);
      object.quaternion.slerp(prevRot, weight);
      object.scale.lerp(prevScl, weight);
    });
  }
}
