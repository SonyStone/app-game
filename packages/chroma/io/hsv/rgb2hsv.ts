const { min, max } = Math;

/*
 * supported arguments:
 * - rgb2hsv(r,g,b)
 * - rgb2hsv([r,g,b])
 * - rgb2hsv({r,g,b})
 */
export const rgb2hsl = (r: number, g: number, b: number) => {
  const min_ = min(r, g, b);
  const max_ = max(r, g, b);
  const delta = max_ - min_;
  let h = 0;
  let s = 0;
  let v = 0;
  v = max_ / 255.0;
  if (max_ === 0) {
    h = Number.NaN;
    s = 0;
  } else {
    s = delta / max_;
    if (r === max_) {
      h = (g - b) / delta;
    }
    if (g === max_) {
      h = 2 + (b - r) / delta;
    }
    if (b === max_) {
      h = 4 + (r - g) / delta;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  return [h, s, v];
};
