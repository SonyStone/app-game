import { Euler, Mat4, Vec3 } from 'ogl';

export function makeRotationFromEuler(mat4: Mat4, euler: Euler) {
  const te = mat4;

  const x = euler.x,
    y = euler.y,
    z = euler.z;
  const a = Math.cos(x),
    b = Math.sin(x);
  const c = Math.cos(y),
    d = Math.sin(y);
  const e = Math.cos(z),
    f = Math.sin(z);

  if (euler.order === 'XYZ') {
    const ae = a * e,
      af = a * f,
      be = b * e,
      bf = b * f;

    te[0] = c * e;
    te[4] = -c * f;
    te[8] = d;

    te[1] = af + be * d;
    te[5] = ae - bf * d;
    te[9] = -b * c;

    te[2] = bf - ae * d;
    te[6] = be + af * d;
    te[10] = a * c;
  } else if (euler.order === 'YXZ') {
    const ce = c * e,
      cf = c * f,
      de = d * e,
      df = d * f;

    te[0] = ce + df * b;
    te[4] = de * b - cf;
    te[8] = a * d;

    te[1] = a * f;
    te[5] = a * e;
    te[9] = -b;

    te[2] = cf * b - de;
    te[6] = df + ce * b;
    te[10] = a * c;
  } else if (euler.order === 'ZXY') {
    const ce = c * e,
      cf = c * f,
      de = d * e,
      df = d * f;

    te[0] = ce - df * b;
    te[4] = -a * f;
    te[8] = de + cf * b;

    te[1] = cf + de * b;
    te[5] = a * e;
    te[9] = df - ce * b;

    te[2] = -a * d;
    te[6] = b;
    te[10] = a * c;
  } else if (euler.order === 'ZYX') {
    const ae = a * e,
      af = a * f,
      be = b * e,
      bf = b * f;

    te[0] = c * e;
    te[4] = be * d - af;
    te[8] = ae * d + bf;

    te[1] = c * f;
    te[5] = bf * d + ae;
    te[9] = af * d - be;

    te[2] = -d;
    te[6] = b * c;
    te[10] = a * c;
  } else if (euler.order === 'YZX') {
    const ac = a * c,
      ad = a * d,
      bc = b * c,
      bd = b * d;

    te[0] = c * e;
    te[4] = bd - ac * f;
    te[8] = bc * f + ad;

    te[1] = f;
    te[5] = a * e;
    te[9] = -b * e;

    te[2] = -d * e;
    te[6] = ad * f + bc;
    te[10] = ac - bd * f;
  } else if (euler.order === 'XZY') {
    const ac = a * c,
      ad = a * d,
      bc = b * c,
      bd = b * d;

    te[0] = c * e;
    te[4] = -f;
    te[8] = d * e;

    te[1] = ac * f + bd;
    te[5] = a * e;
    te[9] = ad * f - bc;

    te[2] = bc * f - ad;
    te[6] = b * e;
    te[10] = bd * f + ac;
  }

  // bottom row
  te[3] = 0;
  te[7] = 0;
  te[11] = 0;

  // last column
  te[12] = 0;
  te[13] = 0;
  te[14] = 0;
  te[15] = 1;

  return mat4;
}

export function clone(mat4: Mat4): Mat4 {
  return new Mat4().copy(mat4);
}

const _v1 = /*@__PURE__*/ new Vec3();

export function extractRotation(te: Mat4, me: Mat4) {
  // this method does not support reflection matrices

  const scaleX = 1 / setFromMatrixColumn(_v1, me, 0).len();
  const scaleY = 1 / setFromMatrixColumn(_v1, me, 1).len();
  const scaleZ = 1 / setFromMatrixColumn(_v1, me, 2).len();

  te[0] = me[0] * scaleX;
  te[1] = me[1] * scaleX;
  te[2] = me[2] * scaleX;
  te[3] = 0;

  te[4] = me[4] * scaleY;
  te[5] = me[5] * scaleY;
  te[6] = me[6] * scaleY;
  te[7] = 0;

  te[8] = me[8] * scaleZ;
  te[9] = me[9] * scaleZ;
  te[10] = me[10] * scaleZ;
  te[11] = 0;

  te[12] = 0;
  te[13] = 0;
  te[14] = 0;
  te[15] = 1;

  return te;
}

function setFromMatrixColumn(vec3: Vec3, m: Mat4, index: number) {
  return vec3.fromArray(m, index * 4);
}
