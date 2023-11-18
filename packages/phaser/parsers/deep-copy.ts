/**
 * Deep Copy the given object or array.
 *
 * @function Phaser.Utils.Objects.DeepCopy
 *
 * @param {object} obj - The object to deep copy.
 *
 * @return {object} A deep copy of the original object.
 */
export function deepCopy<T>(inObject: T): T {
  let outObject: T;
  let value;
  let key;

  if (typeof inObject !== 'object' || inObject === null) {
    //  inObject is not an object
    return inObject;
  }

  //  Create an array or object to hold the values
  outObject = (Array.isArray(inObject) ? [] : {}) as T;

  for (key in inObject) {
    value = (inObject as any)[key];

    //  Recursively (deep) copy for nested objects, including arrays
    (outObject as any)[key] = deepCopy(value);
  }

  return outObject;
}
