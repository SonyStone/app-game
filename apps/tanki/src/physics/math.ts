/**
 * The transcendental functions the match's simulation uses, giving bit for bit the same results in
 * every JavaScript engine, so a match replays the same from its seed and inputs in Chrome, Safari,
 * Firefox and Node.
 *
 * Engines compute `Math.sin`, `Math.atan2`, `Math.exp` and the like their own ways and differ in
 * the last bits: in 2026 Node 22, Chrome 156 and Safari 26 pairwise disagreed on all of them, and
 * Safari even on `Math.hypot`. A difference of one bit in a turret's angle sends a shell a hair
 * aside, and a match apart within seconds. These are ports of fdlibm (as in musl) built only of
 * `+`, `-`, `*`, `/` and `Math.sqrt`, which IEEE 754 and ECMAScript require to be correctly
 * rounded, so every engine computes the same. They are within one unit in the last place of the
 * true value, as fdlibm is.
 *
 * Simulation code uses these instead of `Math`'s (see `math.test.ts`, which lists the modules held
 * to it); code that only draws may use `Math`'s.
 */

/** The sine of `x` radians. Arguments beyond about ±1.6e6 lose accuracy but stay deterministic. */
export function sin(x: number) {
  const magnitude = Math.abs(x);

  if (magnitude <= PIO4) {
    return magnitude < 1.4901161193847656e-8 ? x : kernelSin(x, 0, false);
  }

  if (!(magnitude < Infinity)) {
    return NaN;
  }

  const n = reduce(x);

  switch (n & 3) {
    case 0:
      return kernelSin(reduced[0], reduced[1], true);
    case 1:
      return kernelCos(reduced[0], reduced[1]);
    case 2:
      return -kernelSin(reduced[0], reduced[1], true);
    default:
      return -kernelCos(reduced[0], reduced[1]);
  }
}

/** The cosine of `x` radians. Arguments beyond about ±1.6e6 lose accuracy but stay deterministic. */
export function cos(x: number) {
  const magnitude = Math.abs(x);

  if (magnitude <= PIO4) {
    return magnitude < 7.450580596923828e-9 ? 1 : kernelCos(x, 0);
  }

  if (!(magnitude < Infinity)) {
    return NaN;
  }

  const n = reduce(x);

  switch (n & 3) {
    case 0:
      return kernelCos(reduced[0], reduced[1]);
    case 1:
      return -kernelSin(reduced[0], reduced[1], true);
    case 2:
      return -kernelCos(reduced[0], reduced[1]);
    default:
      return kernelSin(reduced[0], reduced[1], true);
  }
}

/** The angle in radians, from -π to π, of the point `(x, y)`, as `Math.atan2(y, x)`. */
export function atan2(y: number, x: number) {
  if (Number.isNaN(x) || Number.isNaN(y)) {
    return NaN;
  }

  if (x === 1) {
    return atan(y);
  }

  // Bit 0 is y's sign, bit 1 is x's, as fdlibm counts the quadrants; -0 counts as negative.
  const m = (isNegative(y) ? 1 : 0) | (isNegative(x) ? 2 : 0);

  if (y === 0) {
    return m === 0 || m === 1 ? y : m === 2 ? PI : -PI;
  }

  if (x === 0) {
    return m & 1 ? -PIO2 : PIO2;
  }

  if (x === Infinity || x === -Infinity) {
    if (y === Infinity || y === -Infinity) {
      return [PIO4, -PIO4, 3 * PIO4, -3 * PIO4][m];
    }

    return [0, -0, PI, -PI][m];
  }

  if (y === Infinity || y === -Infinity) {
    return m & 1 ? -PIO2 : PIO2;
  }

  const exponents = exponentOf(y) - exponentOf(x);
  let z: number;
  let quadrant = m;

  if (exponents > 60) {
    z = PIO2 + 0.5 * PI_LO;
    quadrant &= 1;
  } else if (m & 2 && exponents < -60) {
    z = 0;
  } else {
    z = atan(Math.abs(y / x));
  }

  switch (quadrant) {
    case 0:
      return z;
    case 1:
      return -z;
    case 2:
      return PI - (z - PI_LO);
    default:
      return z - PI_LO - PI;
  }
}

/** The arctangent of `x`, in radians from -π/2 to π/2. */
export function atan(x: number) {
  if (Number.isNaN(x)) {
    return x;
  }

  const negative = x < 0;
  let t = Math.abs(x);

  if (t >= 7.378697629483821e19) {
    return negative ? -(ATAN_HI[3] + ATAN_LO[3]) : ATAN_HI[3] + ATAN_LO[3];
  }

  let id: number;

  if (t < 0.4375) {
    if (t < 7.450580596923828e-9) {
      return x;
    }

    id = -1;
    t = x;
  } else if (t < 1.1875) {
    if (t < 0.6875) {
      id = 0;
      t = (2 * t - 1) / (2 + t);
    } else {
      id = 1;
      t = (t - 1) / (t + 1);
    }
  } else if (t < 2.4375) {
    id = 2;
    t = (t - 1.5) / (1 + 1.5 * t);
  } else {
    id = 3;
    t = -1 / t;
  }

  const z = t * t;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));

  if (id < 0) {
    return t - t * (s1 + s2);
  }

  const result = ATAN_HI[id] - (t * (s1 + s2) - ATAN_LO[id] - t);
  return negative ? -result : result;
}

/** e to the power of `x`. */
export function exp(x: number) {
  if (Number.isNaN(x)) {
    return x;
  }

  if (x > 709.782712893384) {
    return Infinity;
  }

  if (x < -745.1332191019411) {
    return 0;
  }

  const magnitude = Math.abs(x);
  let hi: number;
  let lo = 0;
  let k = 0;
  let t = x;

  if (magnitude > 0.5 * LN2) {
    k = magnitude >= 1.5 * LN2 ? Math.trunc(INV_LN2 * x + (x < 0 ? -0.5 : 0.5)) : x < 0 ? -1 : 1;
    hi = x - k * LN2_HI;
    lo = k * LN2_LO;
    t = hi - lo;
  } else if (magnitude > 3.725290298461914e-9) {
    hi = x;
  } else {
    return 1 + x;
  }

  const tt = t * t;
  const c = t - tt * (P1 + tt * (P2 + tt * (P3 + tt * (P4 + tt * P5))));
  const y = 1 + ((t * c) / (2 - c) - lo + hi);
  return k === 0 ? y : scale(y, k);
}

/** The natural logarithm of `x`. */
export function log(x: number) {
  bits.setFloat64(0, x, true);
  let high = bits.getUint32(4, true);
  let k = 0;

  if (high < 0x00100000 || high >>> 31) {
    if (x === 0) {
      return -Infinity;
    }

    if (x < 0 || Number.isNaN(x)) {
      return NaN;
    }

    // Subnormal: scale it up into the normal range.
    k -= 54;
    bits.setFloat64(0, x * 18014398509481984, true);
    high = bits.getUint32(4, true);
  } else if (high >= 0x7ff00000) {
    return x;
  } else if (x === 1) {
    return 0;
  }

  // Splits x into 2^k times a number between √2/2 and √2.
  high += 0x3ff00000 - 0x3fe6a09e;
  k += (high >>> 20) - 0x3ff;
  high = (high & 0x000fffff) + 0x3fe6a09e;
  bits.setUint32(4, high, true);
  const f = bits.getFloat64(0, true) - 1;
  const hfsq = 0.5 * f * f;
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  return s * (hfsq + (t2 + t1)) + k * LN2_LO - hfsq + f + k * LN2_HI;
}

/**
 * The length of the vector `(x, y)`. Unlike `Math.hypot` it squares and adds, so lengths beyond
 * about 1e154 overflow, far beyond any on the map.
 */
export function hypot(x: number, y: number) {
  return Math.sqrt(x * x + y * y);
}

const PI = 3.141592653589793;
const PIO2 = 1.5707963267948966;
const PIO4 = 0.7853981633974483;
const PI_LO = 1.2246467991473532e-16;

/** The two parts of the last argument `reduce` brought into [-π/4, π/4], its value and what rounding left of it. */
const reduced = new Float64Array(2);
const bits = new DataView(new ArrayBuffer(8));

/**
 * Subtracts the multiple of π/2 nearest to `x` from it, in up to three rounds of ever finer parts
 * of π/2 when the subtraction cancels many bits (fdlibm's medium case), leaving the rest in
 * `reduced`; returns the multiple. fdlibm reduces arguments beyond 2^20·π/2 with a long table of
 * π's bits instead; the match never meets such angles, so they go the same way, less accurately.
 */
function reduce(x: number) {
  const fn = x * INV_PIO2 + TO_INT - TO_INT;
  const exponent = exponentOf(x);
  let r = x - fn * PIO2_1;
  let w = fn * PIO2_1T;
  let y = r - w;

  if (exponent - exponentOf(y) > 16) {
    let t = r;
    w = fn * PIO2_2;
    r = t - w;
    w = fn * PIO2_2T - (t - r - w);
    y = r - w;

    if (exponent - exponentOf(y) > 49) {
      t = r;
      w = fn * PIO2_3;
      r = t - w;
      w = fn * PIO2_3T - (t - r - w);
      y = r - w;
    }
  }

  reduced[0] = y;
  reduced[1] = r - y - w;
  return fn | 0;
}

const TO_INT = 1.5 / Number.EPSILON;
const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21;
const PIO2_3T = 8.47842766036889956997e-32;

/** The biased binary exponent of `x`, read from its bits. */
function exponentOf(x: number) {
  bits.setFloat64(0, x, true);
  return (bits.getUint32(4, true) >>> 20) & 0x7ff;
}

/** Whether `x` has its sign bit set, -0 included. */
function isNegative(x: number) {
  return x < 0 || Object.is(x, -0);
}

/** fdlibm's sine on [-π/4, π/4] of `x + tail`; `withTail` says whether `tail` is to be used. */
function kernelSin(x: number, tail: number, withTail: boolean) {
  const z = x * x;
  const w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;

  if (!withTail) {
    return x + v * (S1 + z * r);
  }

  return x - (z * (0.5 * tail - v * r) - tail - v * S1);
}

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

/** fdlibm's cosine on [-π/4, π/4] of `x + tail`. */
function kernelCos(x: number, tail: number) {
  const z = x * x;
  const w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  const rest = 1 - hz;
  return rest + (1 - rest - hz + (z * r - x * tail));
}

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

const ATAN_HI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800];
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.11111104054623557880e-1,
  9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2,
  4.97687799461593236017e-2, -3.65315727442169155270e-2, 1.62858201153657823623e-2
];

const LN2 = 0.6931471805599453;
const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.65339022054652515390e-6;
const P5 = 4.13813679705723846039e-8;

/** `y` times 2^`k`, exactly as long as the result is normal, as C's `scalbn`. */
function scale(y: number, k: number) {
  let result = y;
  let n = k;

  if (n > 1023) {
    result *= 8.98846567431158e307;
    n -= 1023;

    if (n > 1023) {
      result *= 8.98846567431158e307;
      n = Math.min(n - 1023, 1023);
    }
  } else if (n < -1022) {
    // Two steps keep the rounding of a subnormal result to one, as scalbn does.
    result *= 2.2250738585072014e-308 * 9007199254740992;
    n += 1022 - 53;

    if (n < -1022) {
      result *= 2.2250738585072014e-308 * 9007199254740992;
      n = Math.max(n + 1022 - 53, -1022);
    }
  }

  bits.setUint32(4, (0x3ff + n) << 20, true);
  bits.setUint32(0, 0, true);
  return result * bits.getFloat64(0, true);
}

const LG1 = 6.666666666666735130e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;
