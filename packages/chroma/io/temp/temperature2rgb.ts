const { log } = Math;

/**
 * Converts a color temperature in Kelvin into an approximate RGB color.
 */
export function temperature2rgb(kelvin: number): [number, number, number, number] {
  const temp = kelvin / 100;
  let r: number;
  let g: number;
  let b: number;
  if (temp < 66) {
    r = 255;
    if (temp < 6) {
      g = 0;
    } else {
      const greenBase = temp - 2;
      g = -155.25485562709179 - 0.44596950469579133 * greenBase + 104.49216199393888 * log(greenBase);
    }
    if (temp < 20) {
      b = 0;
    } else {
      const blueBase = temp - 10;
      b = -254.76935184120902 + 0.8274096064007395 * blueBase + 115.67994401066147 * log(blueBase);
    }
  } else {
    const redBase = temp - 55;
    const greenBase = temp - 50;
    r = 351.97690566805693 + 0.114206453784165 * redBase - 40.25366309332127 * log(redBase);
    g = 325.4494125711974 + 0.07943456536662342 * greenBase - 28.0852963507957 * log(greenBase);
    b = 255;
  }
  return [r, g, b, 1];
}
