import * as m4 from './mut-m4';

export class Mat4 {
  constructor(public m: m4.Mat4 = m4.identity()) {}

  negate(): this {
    m4.negate(this.m);
    return this;
  }

  copy(b: m4.Mat4): this {
    m4.copy(this.m, b);
    return this;
  }

  inverse(): this {
    m4.inverse(this.m);
    return this;
  }
}
