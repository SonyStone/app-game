// Matrix Helpers (ref: https://github.com/gregtatum/mdn-webgl/blob/master/library/matrices.js)
export class Mat4 {
  static tmpIdentity = Mat4.identity();

  static identity(r?: number[]) {
    r = r || [];
    r[0] = 1;
    r[1] = 0;
    r[2] = 0;
    r[3] = 0;
    r[4] = 0;
    r[5] = 1;
    r[6] = 0;
    r[7] = 0;
    r[8] = 0;
    r[9] = 0;
    r[10] = 1;
    r[11] = 0;
    r[12] = 0;
    r[13] = 0;
    r[14] = 0;
    r[15] = 1;
    return r;
  }

  static copy(m: any, r?: number[]) {
    r = r || [];
    r[0] = m[0];
    r[1] = m[1];
    r[2] = m[2];
    r[3] = m[3];
    r[4] = m[4];
    r[5] = m[5];
    r[6] = m[6];
    r[7] = m[7];
    r[8] = m[8];
    r[9] = m[9];
    r[10] = m[10];
    r[11] = m[11];
    r[12] = m[12];
    r[13] = m[13];
    r[14] = m[14];
    r[15] = m[15];
    return r;
  }

  static translate(x: number, y: number, z: number, r?: number[]) {
    r = r || [];
    r[0] = 1;
    r[1] = 0;
    r[2] = 0;
    r[3] = 0;
    r[4] = 0;
    r[5] = 1;
    r[6] = 0;
    r[7] = 0;
    r[8] = 0;
    r[9] = 0;
    r[10] = 1;
    r[11] = 0;
    r[12] = x;
    r[13] = y;
    r[14] = z;
    r[15] = 1;
    return r;
  }

  static scale(x: number, y: number, z: number, r?: number[]) {
    r = r || [];
    r[0] = x;
    r[1] = 0;
    r[2] = 0;
    r[3] = 0;
    r[4] = 0;
    r[5] = y;
    r[6] = 0;
    r[7] = 0;
    r[8] = 0;
    r[9] = 0;
    r[10] = z;
    r[11] = 0;
    r[12] = 0;
    r[13] = 0;
    r[14] = 0;
    r[15] = 1;
    return r;
  }

  static rotateX(a: number, r?: number[]) {
    r = r || [];
    var c = Math.cos(a),
      s = Math.sin(a);
    r[0] = 1;
    r[1] = 0;
    r[2] = 0;
    r[3] = 0;
    r[4] = 0;
    r[5] = c;
    r[6] = -s;
    r[7] = 0;
    r[8] = 0;
    r[9] = s;
    r[10] = c;
    r[11] = 0;
    r[12] = 0;
    r[13] = 0;
    r[14] = 0;
    r[15] = 1;
    return r;
  }

  static rotateY(a: number, r?: number[]) {
    r = r || [];
    const c = Math.cos(a);
    const s = Math.sin(a);
    r[0] = c;
    r[1] = 0;
    r[2] = s;
    r[3] = 0;
    r[4] = 0;
    r[5] = 1;
    r[6] = 0;
    r[7] = 0;
    r[8] = -s;
    r[9] = 0;
    r[10] = c;
    r[11] = 0;
    r[12] = 0;
    r[13] = 0;
    r[14] = 0;
    r[15] = 1;
    return r;
  }

  static rotateZ(a: number, r?: number[]) {
    r = r || [];
    const c = Math.cos(a);
    const s = Math.sin(a);
    r[0] = c;
    r[1] = -s;
    r[2] = 0;
    r[3] = 0;
    r[4] = s;
    r[5] = c;
    r[6] = 0;
    r[7] = 0;
    r[8] = 0;
    r[9] = 0;
    r[10] = 1;
    r[11] = 0;
    r[12] = 0;
    r[13] = 0;
    r[14] = 0;
    r[15] = 1;
    return r;
  }

  static inverse(m: any, r?: number[]) {
    r = r || [];
    const m00 = m[0 * 4 + 0];
    const m01 = m[0 * 4 + 1];
    const m02 = m[0 * 4 + 2];
    const m03 = m[0 * 4 + 3];
    const m10 = m[1 * 4 + 0];
    const m11 = m[1 * 4 + 1];
    const m12 = m[1 * 4 + 2];
    const m13 = m[1 * 4 + 3];
    const m20 = m[2 * 4 + 0];
    const m21 = m[2 * 4 + 1];
    const m22 = m[2 * 4 + 2];
    const m23 = m[2 * 4 + 3];
    const m30 = m[3 * 4 + 0];
    const m31 = m[3 * 4 + 1];
    const m32 = m[3 * 4 + 2];
    const m33 = m[3 * 4 + 3];
    const tmp_0 = m22 * m33;
    const tmp_1 = m32 * m23;
    const tmp_2 = m12 * m33;
    const tmp_3 = m32 * m13;
    const tmp_4 = m12 * m23;
    const tmp_5 = m22 * m13;
    const tmp_6 = m02 * m33;
    const tmp_7 = m32 * m03;
    const tmp_8 = m02 * m23;
    const tmp_9 = m22 * m03;
    const tmp_10 = m02 * m13;
    const tmp_11 = m12 * m03;
    const tmp_12 = m20 * m31;
    const tmp_13 = m30 * m21;
    const tmp_14 = m10 * m31;
    const tmp_15 = m30 * m11;
    const tmp_16 = m10 * m21;
    const tmp_17 = m20 * m11;
    const tmp_18 = m00 * m31;
    const tmp_19 = m30 * m01;
    const tmp_20 = m00 * m21;
    const tmp_21 = m20 * m01;
    const tmp_22 = m00 * m11;
    const tmp_23 = m10 * m01;
    const t0 =
      tmp_0 * m11 +
      tmp_3 * m21 +
      tmp_4 * m31 -
      (tmp_1 * m11 + tmp_2 * m21 + tmp_5 * m31);
    const t1 =
      tmp_1 * m01 +
      tmp_6 * m21 +
      tmp_9 * m31 -
      (tmp_0 * m01 + tmp_7 * m21 + tmp_8 * m31);
    const t2 =
      tmp_2 * m01 +
      tmp_7 * m11 +
      tmp_10 * m31 -
      (tmp_3 * m01 + tmp_6 * m11 + tmp_11 * m31);
    const t3 =
      tmp_5 * m01 +
      tmp_8 * m11 +
      tmp_11 * m21 -
      (tmp_4 * m01 + tmp_9 * m11 + tmp_10 * m21);
    const d = 1.0 / (m00 * t0 + m10 * t1 + m20 * t2 + m30 * t3);
    r[0] = d * t0;
    r[1] = d * t1;
    r[2] = d * t2;
    r[3] = d * t3;
    r[4] =
      d *
      (tmp_1 * m10 +
        tmp_2 * m20 +
        tmp_5 * m30 -
        (tmp_0 * m10 + tmp_3 * m20 + tmp_4 * m30));
    r[5] =
      d *
      (tmp_0 * m00 +
        tmp_7 * m20 +
        tmp_8 * m30 -
        (tmp_1 * m00 + tmp_6 * m20 + tmp_9 * m30));
    r[6] =
      d *
      (tmp_3 * m00 +
        tmp_6 * m10 +
        tmp_11 * m30 -
        (tmp_2 * m00 + tmp_7 * m10 + tmp_10 * m30));
    r[7] =
      d *
      (tmp_4 * m00 +
        tmp_9 * m10 +
        tmp_10 * m20 -
        (tmp_5 * m00 + tmp_8 * m10 + tmp_11 * m20));
    r[8] =
      d *
      (tmp_12 * m13 +
        tmp_15 * m23 +
        tmp_16 * m33 -
        (tmp_13 * m13 + tmp_14 * m23 + tmp_17 * m33));
    r[9] =
      d *
      (tmp_13 * m03 +
        tmp_18 * m23 +
        tmp_21 * m33 -
        (tmp_12 * m03 + tmp_19 * m23 + tmp_20 * m33));
    r[10] =
      d *
      (tmp_14 * m03 +
        tmp_19 * m13 +
        tmp_22 * m33 -
        (tmp_15 * m03 + tmp_18 * m13 + tmp_23 * m33));
    r[11] =
      d *
      (tmp_17 * m03 +
        tmp_20 * m13 +
        tmp_23 * m23 -
        (tmp_16 * m03 + tmp_21 * m13 + tmp_22 * m23));
    r[12] =
      d *
      (tmp_14 * m22 +
        tmp_17 * m32 +
        tmp_13 * m12 -
        (tmp_16 * m32 + tmp_12 * m12 + tmp_15 * m22));
    r[13] =
      d *
      (tmp_20 * m32 +
        tmp_12 * m02 +
        tmp_19 * m22 -
        (tmp_18 * m22 + tmp_21 * m32 + tmp_13 * m02));
    r[14] =
      d *
      (tmp_18 * m12 +
        tmp_23 * m32 +
        tmp_15 * m02 -
        (tmp_22 * m32 + tmp_14 * m02 + tmp_19 * m12));
    r[15] =
      d *
      (tmp_22 * m22 +
        tmp_16 * m02 +
        tmp_21 * m12 -
        (tmp_20 * m12 + tmp_23 * m22 + tmp_17 * m02));

    return r;
  }

  static perspective(
    fov: number,
    aspect: number,
    near: number,
    far: number,
    r?: number[]
  ) {
    r = r || [];
    const f = Math.tan(Math.PI * 0.5 - 0.5 * fov);
    const rangeInv = 1.0 / (near - far);
    const a = f / aspect;
    const b = (near + far) * rangeInv;
    const c = near * far * rangeInv * 2;
    r[0] = a;
    r[1] = 0;
    r[2] = 0;
    r[3] = 0;
    r[4] = 0;
    r[5] = f;
    r[6] = 0;
    r[7] = 0;
    r[8] = 0;
    r[9] = 0;
    r[10] = b;
    r[11] = -1;
    r[12] = 0;
    r[13] = 0;
    r[14] = c;
    r[15] = 0;
    return r;
  }

  static projection(w: number, h: number, d: number, r?: number[]) {
    r = r || [];
    // Note: This matrix flips the Y axis so 0 is at the top.
    r[0] = 2 / w;
    r[1] = 0;
    r[2] = 0;
    r[3] = 0;
    r[4] = 0;
    r[5] = -2 / h;
    r[6] = 0;
    r[7] = 0;
    r[8] = 0;
    r[9] = 0;
    r[10] = 2 / d;
    r[11] = 0;
    r[12] = -1;
    r[13] = 1;
    r[14] = 0;
    r[15] = 1;
    return r;
  }

  static multiply(a: number[], b: number[], r?: number[]) {
    r = r || [];
    let a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
    let a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
    let a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
    let a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];
    let b0 = b[0],
      b1 = b[1],
      b2 = b[2],
      b3 = b[3];
    r[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    r[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    r[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    r[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[4];
    b1 = b[5];
    b2 = b[6];
    b3 = b[7];
    r[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    r[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    r[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    r[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[8];
    b1 = b[9];
    b2 = b[10];
    b3 = b[11];
    r[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    r[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    r[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    r[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[12];
    b1 = b[13];
    b2 = b[14];
    b3 = b[15];
    r[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    r[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    r[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    r[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return r;
  }

  static applyVec3(m: number[], v: number[], r?: number[]) {
    r = r || [];
    var x = v[0],
      y = v[1],
      z = v[2];
    var w = m[3] * x + m[7] * y + m[11] * z + m[15];
    w = w || 1.0;
    r[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    r[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    r[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return r;
  }

  static multiplyArray(arr: number[][], r?: number[]) {
    r = r || [];
    let input = Mat4.tmpIdentity;
    for (let i = 0; i < arr.length; i++) {
      input = Mat4.multiply(input, arr[i], r);
    }
    return r;
  }
}
