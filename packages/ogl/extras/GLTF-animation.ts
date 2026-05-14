import type { AttributeData } from '../core/geometry';
import { Quat } from '../math/quat';
import { Vec3 } from '../math/vec-3';

const tmpVec3A = /* @__PURE__ */ new Vec3();
const tmpVec3B = /* @__PURE__ */ new Vec3();
const tmpVec3C = /* @__PURE__ */ new Vec3();
const tmpVec3D = /* @__PURE__ */ new Vec3();

const tmpQuatA = /* @__PURE__ */ new Quat();
const tmpQuatB = /* @__PURE__ */ new Quat();
const tmpQuatC = /* @__PURE__ */ new Quat();
const tmpQuatD = /* @__PURE__ */ new Quat();

type GLTFAnimationTransform = 'quaternion' | 'position' | 'scale';

type GLTFAnimationChannel = {
  node: Record<GLTFAnimationTransform, Vec3 | Quat>;
  transform: GLTFAnimationTransform;
  interpolation: 'CUBICSPLINE' | 'STEP' | string;
  times: number[];
  values: number[] | AttributeData;
};

type GLTFAnimationValue = Vec3 | Quat;

export class GLTFAnimation {
  data: GLTFAnimationChannel[];
  elapsed: number;
  weight: number;
  loop: boolean;
  startTime: number;
  endTime: number;
  duration: number;

  constructor(data: GLTFAnimationChannel[], weight = 1) {
    this.data = data;
    this.elapsed = 0;
    this.weight = weight;

    // Set to false to not apply modulo to elapsed against duration
    this.loop = true;

    // Find starting time as exports from blender (perhaps others too) don't always start from 0
    this.startTime = data.reduce((a: number, { times }: GLTFAnimationChannel) => Math.min(a, times[0]), Infinity);
    // Get largest final time in all channels to calculate duration
    this.endTime = data.reduce(
      (a: number, { times }: GLTFAnimationChannel) => Math.max(a, times[times.length - 1]),
      0
    );
    this.duration = this.endTime - this.startTime;
  }

  update(totalWeight = 1, isSet?: boolean) {
    const weight = isSet ? 1 : this.weight / totalWeight;
    const elapsed = !this.duration
      ? 0
      : (this.loop ? this.elapsed % this.duration : Math.min(this.elapsed, this.duration - 0.001)) + this.startTime;

    this.data.forEach(({ node, transform, interpolation, times, values }: GLTFAnimationChannel) => {
      const isQuaternion = transform === 'quaternion';
      if (!this.duration) {
        const val: GLTFAnimationValue = isQuaternion ? tmpQuatA : tmpVec3A;
        const size = isQuaternion ? 4 : 3;
        val.fromArray(values, 0);
        if (isQuaternion) (node[transform] as Quat).slerp(val as Quat, weight);
        else (node[transform] as Vec3).lerp(val as Vec3, weight);
        return;
      }

      // Get index of two time values elapsed is between
      const prevIndex =
        Math.max(
          1,
          times.findIndex((t) => t > elapsed)
        ) - 1;
      const nextIndex = prevIndex + 1;

      // Get linear blend/alpha between the two
      let alpha = (elapsed - times[prevIndex]) / (times[nextIndex] - times[prevIndex]);
      if (interpolation === 'STEP') alpha = 0;

      let prevVal = tmpVec3A;
      let prevTan = tmpVec3B;
      let nextTan = tmpVec3C;
      let nextVal = tmpVec3D;
      let size = 3;

      if (isQuaternion) {
        prevVal = tmpQuatA as unknown as Vec3;
        prevTan = tmpQuatB as unknown as Vec3;
        nextTan = tmpQuatC as unknown as Vec3;
        nextVal = tmpQuatD as unknown as Vec3;
        size = 4;
      }

      if (interpolation === 'CUBICSPLINE') {
        // Get the prev and next values from the indices
        prevVal.fromArray(values, prevIndex * size * 3 + size * 1);
        prevTan.fromArray(values, prevIndex * size * 3 + size * 2);
        nextTan.fromArray(values, nextIndex * size * 3 + size * 0);
        nextVal.fromArray(values, nextIndex * size * 3 + size * 1);

        // interpolate for final value
        prevVal = this.cubicSplineInterpolate(alpha, prevVal, prevTan, nextTan, nextVal);
        if (size === 4) prevVal.normalize();
      } else {
        // Get the prev and next values from the indices
        prevVal.fromArray(values, prevIndex * size);
        nextVal.fromArray(values, nextIndex * size);

        // interpolate for final value
        if (isQuaternion) (prevVal as unknown as Quat).slerp(nextVal as unknown as Quat, alpha);
        else prevVal.lerp(nextVal, alpha);
      }

      // interpolate between multiple possible animations
      if (isQuaternion) (node[transform] as Quat).slerp(prevVal as unknown as Quat, weight);
      else (node[transform] as Vec3).lerp(prevVal, weight);
    });
  }

  cubicSplineInterpolate<T extends GLTFAnimationValue>(t: number, prevVal: T, prevTan: T, nextTan: T, nextVal: T): T {
    const t2 = t * t;
    const t3 = t2 * t;

    const s2 = 3 * t2 - 2 * t3;
    const s3 = t3 - t2;
    const s0 = 1 - s2;
    const s1 = s3 - t2 + t;

    for (let i = 0; i < prevVal.length; i++) {
      prevVal[i] = s0 * prevVal[i] + s1 * (1 - t) * prevTan[i] + s2 * nextVal[i] + s3 * t * nextTan[i];
    }

    return prevVal;
  }
}
