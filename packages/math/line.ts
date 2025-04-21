import { Radians } from './types';
import { NumberArray } from './utils/typed-array';
import { Vec2 } from './v2';
import * as v2 from './v2-functions';

const atan2 = Math.atan2 as (x: number, y: number) => Radians;
const PI = Math.PI as Radians;

export class Line<T extends NumberArray = Float32Array> {
  constructor(
    public start: Vec2<T>,
    public end: Vec2<T>
  ) {}

  length(): number {
    return v2.distance(this.start.value, this.end.value);
  }

  direction(out: Vec2<T>): Vec2<T> {
    return out.subFrom(this.end, this.start).normalize();
  }

  normal(out: Vec2<T>): Vec2<T> {
    return this.direction(out).perpendicular();
  }

  angle(): Radians {
    const x = this.end.x - this.start.x;
    const y = this.end.y - this.start.y;
    if (x === 0 && y === 0) return 0 as Radians; // Avoid division by zero
    if (x === 0) return (y > 0 ? PI / 2 : -PI / 2) as Radians; // Vertical line
    if (y === 0) return (x > 0 ? 0 : PI) as Radians; // Horizontal line
    if (x < 0) return (atan2(y, x) + PI) as Radians; // Adjust for negative x
    if (y < 0) return (atan2(y, x) + 2 * PI) as Radians; // Adjust for negative y
    return atan2(y, x); // Normal case
  }

  setStart(x: number, y: number): this {
    this.start.set(x, y);
    return this;
  }

  setEnd(x: number, y: number): this {
    this.end.set(x, y);
    return this;
  }

  setStartPoint(point: Vec2<T>): this {
    this.start.copy(point);
    return this;
  }

  setEndPoint(point: Vec2<T>): this {
    this.end.copy(point);
    return this;
  }

  copy(line: Line<T>): this {
    this.start.copy(line.start);
    this.end.copy(line.end);
    return this;
  }

  equals(other: Line<T>): boolean {
    return this.start.isEqual(other.start) && this.end.isEqual(other.end);
  }

  toString(): string {
    return `Line(${this.start.toString()}, ${this.end.toString()})`;
  }

  toArray(): number[] {
    return [this.start.x, this.start.y, this.end.x, this.end.y];
  }
}
