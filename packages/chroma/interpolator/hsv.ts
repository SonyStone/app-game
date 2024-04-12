require('../io/hsv');
const interpolate_hsx = require('./_hsx');

export const hsv = (col1: number, col2: number, f: number) => {
  return interpolate_hsx(col1, col2, f, 'hsv');
};
