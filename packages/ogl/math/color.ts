import * as ColorFunc from './functions/color-func';

// Color stored as an array of RGB decimal values (between 0 > 1)
// Constructor and set method accept following formats:
// new Color() - Empty (defaults to black)
// new Color([0.2, 0.4, 1.0]) - Decimal Array (or another Color instance)
// new Color(0.7, 0.0, 0.1) - Decimal RGB values
// new Color('#ff0000') - Hex string
// new Color('#ccc') - Short-hand Hex string
// new Color(0x4f27e8) - Number
// new Color('red') - Color name string (short list in ColorFunc.js)

export type ColorTuple = [r: number, g: number, b: number];

export type ColorRepresentation = number | ColorFunc.ColorsNames | string | ColorTuple;

// @ts-ignore
export class Color extends Array implements ColorTuple {
  constructor(color?: number | Color | ColorRepresentation, g?: number, b?: number) {
    if (Array.isArray(color)) {
      // @ts-ignore
      return super(...color);
    }
    // @ts-ignore
    return super(...ColorFunc.parseColor(...arguments));
  }

  get r(): number {
    return this[0];
  }

  get g(): number {
    return this[1];
  }

  get b(): number {
    return this[2];
  }

  set r(v: number) {
    this[0] = v;
  }

  set g(v: number) {
    this[1] = v;
  }

  set b(v: number) {
    this[2] = v;
  }

  set(color?: number | Color | ColorTuple | ColorRepresentation, g?: number, b?: number): this {
    if (Array.isArray(color)) {
      return this.copy(color);
    }
    return this.copy(ColorFunc.parseColor(...arguments));
  }

  copy(v: Color | ColorTuple): this {
    this[0] = v[0];
    this[1] = v[1];
    this[2] = v[2];
    return this;
  }
}
