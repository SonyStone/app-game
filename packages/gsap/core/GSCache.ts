import { isFunction, isUndefined } from './utils';

let gsID = 0;

const getProperty = (target: any, property: string, v: any) =>
  (v = target[property]) && isFunction(v)
    ? target[property]()
    : (isUndefined(v) &&
        target.getAttribute &&
        target.getAttribute(property)) ||
      v;

/**
 * --------------------------------------------------------------------------------------
 * CACHE
 * --------------------------------------------------------------------------------------
 */
export class GSCache {
  id: any;
  target: any;
  harness: any;
  get: any;
  set: any;

  constructor(target: any, harness: any) {
    this.id = gsID++;
    target._gsap = this;
    this.target = target;
    this.harness = harness;
    this.get = harness ? harness.get : getProperty;
    this.set = harness ? harness.getSetter : _getSetter;
  }
}
