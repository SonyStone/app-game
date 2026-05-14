import { Mat2x3 } from '../m2x3';
import { Mat3 } from '../m3';
import { Vec1 } from '../v1';
import { Vec2 } from '../v2';
import { TypedArrayConstructor } from './typed-array';

type DataConstructor = typeof Mat2x3 | typeof Mat3 | typeof Vec1 | typeof Vec2;

// Type mapping that converts constructor types to their instance types
type StructItem<C extends DataConstructor, T extends TypedArrayConstructor> = C extends typeof Mat2x3
  ? Mat2x3<InstanceType<T>>
  : C extends typeof Mat3
  ? Mat3<InstanceType<T>>
  : C extends typeof Vec1
  ? Vec1<InstanceType<T>>
  : C extends typeof Vec2
  ? Vec2<InstanceType<T>>
  : never;

/**
 * @example
 * ```ts
 * const [struct, buffer] = createStruct({
 *   pos: [Vec2, Int32Array],
 *   scale: [Vec2, Float32Array],
 *   rotation: [Vec1, Float32Array],
 *   mat: [Mat2x3, Float32Array],
 * })
 * ```
 * that will create a struct with the following layout:
 * ```ts
 * const buffer = new ArrayBuffer(44);
 * const struct = {
 *  pos: new Vec2(new Int32Array(buffer, 0, 2)),
 *  scale: new Vec2(new Float32Array(buffer, 8, 2)),
 *  rotation: new Vec1(new Float32Array(buffer, 16, 1)),
 *  mat: new Mat2x3(buffer, new Float32Array(buffer, 20, 6)),
 * }
 * ```
 */
export function createStruct<S extends Record<string, [DataConstructor, TypedArrayConstructor]>>(
  schema: S
): [{ [K in keyof S]: StructItem<S[K][0], S[K][1]> }, ArrayBuffer] {
  let byteLength = 0;
  const schemaEntries = Object.entries(schema);

  for (const [, [Item, Type]] of schemaEntries) {
    byteLength += Item.ELEMENTS * Type.BYTES_PER_ELEMENT;
  }

  const buffer = new ArrayBuffer(byteLength);
  let offset = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const struct: any = {};
  for (const [key, [Item, Type]] of schemaEntries) {
    struct[key] = new Item(new Type(buffer, offset, Item.ELEMENTS));
    offset += Item.ELEMENTS * Type.BYTES_PER_ELEMENT;
  }

  return [struct, buffer] as const;
}
