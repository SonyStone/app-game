import { config } from './config';
import { isNumber, numExp, numWithUnitExp, strictNumExp } from './utils';

/**
 * --------------------------------------------------------------------------------------
 * COLORS
 * --------------------------------------------------------------------------------------
 */

const _255 = 255;

const _colorLookup: { [key: string]: number[] } = {
  aqua: [0, _255, _255],
  lime: [0, _255, 0],
  silver: [192, 192, 192],
  black: [0, 0, 0],
  maroon: [128, 0, 0],
  teal: [0, 128, 128],
  blue: [0, 0, _255],
  navy: [0, 0, 128],
  white: [_255, _255, _255],
  olive: [128, 128, 0],
  yellow: [_255, _255, 0],
  orange: [_255, 165, 0],
  gray: [128, 128, 128],
  purple: [128, 0, 128],
  green: [0, 128, 0],
  red: [_255, 0, 0],
  pink: [_255, 192, 203],
  cyan: [0, _255, _255],
  transparent: [_255, _255, _255, 0],
};
// possible future idea to replace the hard-coded color name values - put this in the ticker.wake() where we set the _doc:
// let ctx = _doc.createElement("canvas").getContext("2d");
// _forEachName("aqua,lime,silver,black,maroon,teal,blue,navy,white,olive,yellow,orange,gray,purple,green,red,pink,cyan", color => {ctx.fillStyle = color; _colorLookup[color] = splitColor(ctx.fillStyle)});

const _hue = (h: number, m1: number, m2: number) => {
  h += h < 0 ? 1 : h > 1 ? -1 : 0;
  return (
    ((h * 6 < 1
      ? m1 + (m2 - m1) * h * 6
      : h < 0.5
      ? m2
      : h * 3 < 2
      ? m1 + (m2 - m1) * (2 / 3 - h) * 6
      : m1) *
      _255 +
      0.5) |
    0
  );
};

export const splitColor = (v: any, toHSL?: boolean, forceAlpha?: any) => {
  let a: any = !v
    ? _colorLookup.black
    : isNumber(v)
    ? [v >> 16, (v >> 8) & _255, v & _255]
    : 0;

  let r: any;
  let g: any;
  let b: any;
  let h: number;
  let s: number;
  let l: number;
  let max: number;
  let min: number;
  let d: number;
  let wasHSL;

  if (!a) {
    if (v.substr(-1) === ',') {
      //sometimes a trailing comma is included and we should chop it off (typically from a comma-delimited list of values like a textShadow:"2px 2px 2px blue, 5px 5px 5px rgb(255,0,0)" - in this example "blue," has a trailing comma. We could strip it out inside parseComplex() but we'd need to do it to the beginning and ending values plus it wouldn't provide protection from other potential scenarios like if the user passes in a similar value.
      v = v.substr(0, v.length - 1);
    }

    if (_colorLookup[v]) {
      a = _colorLookup[v];
    } else if (v.charAt(0) === '#') {
      if (v.length < 6) {
        //for shorthand like #9F0 or #9F0F (could have alpha)
        r = v.charAt(1);
        g = v.charAt(2);
        b = v.charAt(3);
        v =
          '#' +
          r +
          r +
          g +
          g +
          b +
          b +
          (v.length === 5 ? v.charAt(4) + v.charAt(4) : '');
      }

      if (v.length === 9) {
        // hex with alpha, like #fd5e53ff
        a = parseInt(v.substr(1, 6), 16);
        return [
          a >> 16,
          (a >> 8) & _255,
          a & _255,
          parseInt(v.substr(7), 16) / 255,
        ];
      }

      v = parseInt(v.substr(1), 16);
      a = [v >> 16, (v >> 8) & _255, v & _255];
    } else if (v.substr(0, 3) === 'hsl') {
      a = wasHSL = v.match(strictNumExp);
      if (!toHSL) {
        h = (+a[0] % 360) / 360;
        s = +a[1] / 100;
        l = +a[2] / 100;
        g = l <= 0.5 ? l * (s + 1) : l + s - l * s;
        r = l * 2 - g;
        a.length > 3 && (a[3] *= 1); //cast as number
        a[0] = _hue(h + 1 / 3, r, g);
        a[1] = _hue(h, r, g);
        a[2] = _hue(h - 1 / 3, r, g);
      } else if (~v.indexOf('=')) {
        //if relative values are found, just return the raw strings with the relative prefixes in place.
        a = v.match(numExp);
        forceAlpha && a.length < 4 && (a[3] = 1);
        return a;
      }
    } else {
      a = v.match(strictNumExp) || _colorLookup.transparent;
    }
    a = a.map(Number);
  }
  if (toHSL && !wasHSL) {
    r = a[0] / _255;
    g = a[1] / _255;
    b = a[2] / _255;
    max = Math.max(r, g, b);
    min = Math.min(r, g, b);
    l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h =
        max === r
          ? (g - b) / d + (g < b ? 6 : 0)
          : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
      h *= 60;
    }
    a[0] = ~~(h + 0.5);
    a[1] = ~~(s * 100 + 0.5);
    a[2] = ~~(l * 100 + 0.5);
  }
  forceAlpha && a.length < 4 && (a[3] = 1);
  return a;
};

const _colorOrderData = (v: any) => {
  // strips out the colors from the string, finds all the numeric slots (with units) and returns an array of those. The Array also has a "c" property which is an Array of the index values where the colors belong. This is to help work around issues where there's a mis-matched order of color/numeric data like drop-shadow(#f00 0px 1px 2px) and drop-shadow(0x 1px 2px #f00). This is basically a helper function used in _formatColors()
  let values: any = [];
  let c: any[] = [];
  let i = -1;

  v.split(_colorExp).forEach((v: any) => {
    let a = v.match(numWithUnitExp) || [];
    values.push(...a);
    c.push((i += a.length + 1));
  });

  values.c = c;

  return values;
};

const _formatColors = (s: any, toHSL?: any, orderMatchData?: any) => {
  let result = '';
  let colors = (s + result).match(_colorExp)!;
  let type = toHSL ? 'hsla(' : 'rgba(';
  let i = 0;
  let c: any;
  let shell: any;
  let d: any;
  let l: any;

  if (!colors) {
    return s;
  }

  colors = colors.map(
    (color) =>
      (color = splitColor(color, toHSL, 1)) &&
      type +
        (toHSL
          ? color[0] + ',' + color[1] + '%,' + color[2] + '%,' + color[3]
          : (color as any).join(',')) +
        ')'
  );
  if (orderMatchData) {
    d = _colorOrderData(s);
    c = orderMatchData.c;
    if (c.join(result) !== d.c.join(result)) {
      shell = s.replace(_colorExp, '1').split(numWithUnitExp);
      l = shell.length - 1;
      for (; i < l; i++) {
        result +=
          shell[i] +
          (~c.indexOf(i)
            ? colors.shift() || type + '0,0,0,0)'
            : (d.length ? d : colors.length ? colors : orderMatchData).shift());
      }
    }
  }
  if (!shell) {
    shell = s.split(_colorExp);
    l = shell.length - 1;
    for (; i < l; i++) {
      result += shell[i] + colors[i];
    }
  }
  return result + shell[l];
};

const _colorExp = (function () {
  let s =
      '(?:\\b(?:(?:rgb|rgba|hsl|hsla)\\(.+?\\))|\\B#(?:[0-9a-f]{3,4}){1,2}\\b', //we'll dynamically build this Regular Expression to conserve file size. After building it, it will be able to find rgb(), rgba(), # (hexadecimal), and named color values like red, blue, purple, etc.,
    p;
  for (p in _colorLookup) {
    s += '|' + p + '\\b';
  }
  return new RegExp(s + ')', 'gi');
})();
const _hslExp = /hsl[a]?\(/;

export const colorStringFilter = (a: any) => {
  let combined = a.join(' '),
    toHSL;
  _colorExp.lastIndex = 0;
  if (_colorExp.test(combined)) {
    toHSL = _hslExp.test(combined);
    a[1] = _formatColors(a[1], toHSL);
    a[0] = _formatColors(a[0], toHSL, _colorOrderData(a[1])); // make sure the order of numbers/colors match with the END value.
    return true;
  }
};
