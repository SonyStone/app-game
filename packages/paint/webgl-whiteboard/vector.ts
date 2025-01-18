export class Vector {
  x: number;
  y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  toArray() {
    return [this.x, this.y];
  }

  length() {
    const x = Math.pow(this.x, 2);
    const y = Math.pow(this.y, 2);

    return Math.sqrt(x + y);
  }

  equals(a: Vector) {
    return this.x === a.x && this.y === a.y;
  }

  update(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  clone() {
    return new Vector(this.x, this.y);
  }

  rotate(angle: number) {
    const x = this.x * Math.cos(angle) - this.y * Math.sin(angle);
    const y = this.x * Math.sin(angle) + this.y * Math.cos(angle);

    this.x = x;
    this.y = y;
  }

  subtract(a: Vector) {
    const x = this.x - a.x;
    const y = this.y - a.y;

    return new Vector(x, y);
  }
}
