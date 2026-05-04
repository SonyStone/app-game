/**
 * Expands triangle indices into line indices suitable for wireframe rendering.
 */
export function createWireframeIndex(array: Uint16Array): Uint16Array {
  const indices: number[] = [];

  for (let index = 0; index < array.length; index += 3) {
    const a = array[index];
    const b = array[index + 1];
    const c = array[index + 2];

    indices.push(a, b, b, c, c, a);
  }

  return new Uint16Array(indices);
}