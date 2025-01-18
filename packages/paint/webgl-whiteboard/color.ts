export class Color {
  r: number;
  g: number;
  b: number;
  a: number;

  constructor(r = 255, g = 255, b = 255, a = 255) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }

  toArray() {
    return [this.r, this.g, this.b, this.a];
  }
}
