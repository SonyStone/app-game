/**
 * Will make a 5x7 texel F
 */
export const createTestTexture = () => {
  const width = 5;
  const height = 7;
  const _ = [255, 0, 0, 255]; // red
  const y = [255, 255, 0, 255]; // yellow
  const b = [0, 0, 255, 255]; // blue
  // prettier-ignore
  const data = new Uint8Array([
    b, _, _, _, _,
    _, y, y, y, _,
    _, y, _, _, _,
    _, y, y, _, _,
    _, y, _, _, _,
    _, y, _, _, _,
    _, _, _, _, _,
  ].flat());

  return { data, width, height };
};
