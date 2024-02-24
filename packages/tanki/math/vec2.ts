export interface Point {
  x: number;
  y: number;
}

export class Vec2 implements Point {
  public x: number;
  public y: number;

  /**
   * Return new vector, from an angle
   */
  public static fromAngle(angle: number): Point {
      return {
          x: Math.cos(angle),
          y: Math.sin(angle)
      };
  }

  /**
   * Return new vector, to angle, maybe?
   */
  public static angleTo(vector1: Point, vector2: Point): number {
      return Math.atan2((vector1.y - vector2.y), (vector1.x - vector2.x));
  }

  /**
   * Return new
   */
  public static clone(vector: Point = {
      x: 0,
      y: 0
  }): Point {
      return {
          x: vector.x,
          y: vector.y
      };
  }

  /**
   * Returns the magnitude (length) of a vector.
   */
  public static magnitude(vector: Point): number {
      return Math.sqrt(
          (vector.x * vector.x) +
          (vector.y * vector.y)
      );
  }

  /**
   * vector + obj
   * @param vector {x, y}
   * @param obj number  {x, y}
   */
  public static sum(vector: Point, obj: number | Point): Point {
      if (typeof obj === 'number') {
          return {
              x: vector.x + obj,
              y: vector.y + obj,
          };
      } else {
          return {
              x: vector.x + obj.x,
              y: vector.y + obj.y,
          };
      }
  }

  /**
   * vector - obj
   * @param vector {x, y}
   * @param obj number  {x, y}
   */
  public static sub(vector: Point, obj: number | Point): Vec2 {
      if (typeof obj === 'number') {
          return new this(vector.x - obj, vector.y - obj);
      } else {
          return new this(vector.x - obj.x, vector.y - obj.y);
      }
  }

  /**
   * vector * obj
   * @param vector {x, y}
   * @param obj number  {x, y}
   */
  public static mult(vector: Point, obj: number | Point): Vec2 {
      if (typeof obj === 'number') {
          return new this(vector.x * obj, vector.y * obj);
      } else {
          return new this(vector.x * obj.x, vector.y * obj.y);
      }
  }

  /**
   * vector / obj
   * @param vector {x, y}
   * @param obj number  {x, y}
   */
  public static div(vector: Point, obj: number | Point): Point {
      if (typeof obj === 'number') {
          return {
              x: vector.x / obj,
              y: vector.y / obj,
          };
      } else {
          return {
              x: vector.x / obj.x,
              y: vector.y / obj.y,
          };
      }
  }

  /**
   * = obj
   * @param vector {x, y}
   */
  public static set(obj: number | Point) {
      const vector = {
          x: 0,
          y: 0
      };
      if (typeof obj === 'number') {
          vector.x = obj;
          vector.y = obj;
      } else {
          vector.x = obj.x;
          vector.y = obj.y;
      }
      return vector;
  }

  /**
   * invert()
   * Modifies, return inverted vector direction
   */
  public static invert(vector): Point {
      return {
          x: -vector.x,
          y: -vector.y
      };
  }

  /**
   * Returns the magnitude (length) of a vector (therefore saving a `sqrt` operation).
   */
  public static magnitudeSquared(vector: Vec2): number {
      return (vector.x * vector.x) + (vector.y * vector.y);
  }

  public static rotate(vector: Point, angle: number): Point {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
          x: (vector.x * cos) - (vector.y * sin),
          y: (vector.x * sin) + (vector.y * cos),
      };
  }

  public static isLessOrEqual(vectorA: Point, vectorB: Point) {
      return (
          (vectorA.x <= vectorB.x) &&
          (vectorA.y <= vectorB.y)
      );
  }

  public static isGreaterOrEqual(vectorA: Point, vectorB: Point) {
      return (
          (vectorA.x >= vectorB.x) &&
          (vectorA.y >= vectorB.y)
      );
  }

  public static isLess(vectorA: Point, vectorB: Point) {
      return (
          (vectorA.x < vectorB.x) &&
          (vectorA.y < vectorB.y)
      );
  }

  public static isGreater(vectorA: Point, vectorB: Point) {
      return (
          (vectorA.x > vectorB.x) &&
          (vectorA.y > vectorB.y)
      );
  }

  public static getScalar(vector: Point): number {
      return vector.x > vector.y ? vector.x : vector.y;
  }

  public static smaller(vectorA: Point, vectorB: Point) {
      return {
          x: (vectorA.x < vectorB.x ? vectorA.x : vectorB.x),
          y: (vectorA.y < vectorB.y ? vectorA.y : vectorB.y),
      };
  }

  public static larger(vectorA: Point, vectorB: Point) {
      return {
          x: (vectorA.x > vectorB.x ? vectorA.x : vectorB.x),
          y: (vectorA.y > vectorB.y ? vectorA.y : vectorB.y),
      };
  }

  public static small(vector: Point) {
      if (vector.x > vector.y) {
          return {x: vector.x, y: vector.x};
      } else {
          return {x: vector.y, y: vector.y};
      }
  }

  public static large(vector: Point) {
      if (vector.x < vector.y) {
          return {x: vector.x, y: vector.x};
      } else {
          return {x: vector.y, y: vector.y};
      }
  }


  constructor(x ? , y ? ) {
      /**
       * @member {number}
       * @default 0
       */
      this.x = x || 0;

      /**
       * @member {number}
       * @default 0
       */
      this.y = y || 0;
  }

  /**
   * Modifies, return set the components of the vector
   * with black magic
   */
  public set(vec: Vec2 | Point): Vec2 {
      this.x = vec.x; // || this.x; guards makes gliches
      this.y = vec.y;
      return this;
  }

  /**
   * Modifies, return vector with zero coordinates
   */
  public zero(): Vec2 {
      this.x = 0;
      this.y = 0;
      return this;
  }

  public setX(x: number): Vec2 {
      this.x = x;
      return this;
  }

  public setY(y: number): Vec2 {
      this.y = y;
      return this;
  }

  public getX(): number {
      return this.x;
  }

  public getY(): number {
      return this.y;
  }

  /**
   * Return new vector, copy of the vector
   * @return {Vec2} copy of the vector
   */
  public clone(): Vec2 {
      return new Vec2(this.x, this.y);
  }

  /**
   * Return new vector, copy of the vector
   * @return {Vec2} copy of the vector
   */
  public copy(vec: Vec2): Vec2 {
      return this.set(vec);
  }

  /**
   * Return scalar, the magnitude of the vector
   */
  public mag(): number {
      return (Math.sqrt(
          (this.x * this.x) +
          (this.y * this.y),
      ));
  }

  /**
   * .magSq()
   * Return scalar, the magnitude of the vector, squared
   */
  public magSq(): number {
      return ((this.x * this.x) + (this.y * this.y));
  }

  /**
   * .add(vec)
   * Modifies, return adds one vector to another
   */
  public add(vec: number | Vec2 | Point);
  public add(obj: any): Vec2 {
      if (typeof obj === 'number') {
          this.x += obj;
          this.y += obj;
      } else {
          this.x += obj.x;
          this.y += obj.y;
      }
      return this;
  }

  /**
   * .sub(vec)
   * Modifies, return subtract one vector from another
   */
  public sub(vec: number | Vec2 | Point);
  public sub(obj: any): Vec2 {
      if (typeof obj === 'number') {
          this.x -= obj;
          this.y -= obj;
      } else {
          this.x -= obj.x;
          this.y -= obj.y;
      }
      return this;
  }

  public subX(x: number): Vec2 {
      this.x -= x;
      return this;
  }
  public subY(y: number): Vec2 {
      this.y -= y;
      return this;
  }

  /**
   * .mult()
   * Modifies, return multiplies a vector by a scalar
   */
  public mult(vec: number | Vec2 | Point);
  public mult(obj: any): Vec2 {
      if (typeof obj === 'number') {
          this.x *= obj;
          this.y *= obj;
      } else {
          this.x *= obj.x;
          this.y *= obj.y;
      }
      return this;
  }

  /**
   * .div()
   * Modifies, return divide a vector by a scalar
   */
  public div(vec: number | Vec2 | Point);
  public div(obj: any): Vec2 {
      if (typeof obj === 'number') {
          this.x /= obj;
          this.y /= obj;
      } else {
          this.x /= obj.x;
          this.y /= obj.y;
      }
      return this;
  }

  /**
   * .dist()
   * Return scalar, the distance between two points
   */
  public dist(vec: Vec2 | Point): number {
      return Math.sqrt(
          Math.pow(this.x - vec.x, 2) +
          Math.pow(this.y - vec.y, 2),
      );
  }

  /**
   * .dot()
   * Return scalar, the dot product of two vectors
   */
  public dot(vec: Vec2 | Point): number {
      return (this.x * vec.x) + (this.y * vec.y);
  }

  /**
   * .normalize()
   * Modifies, return normalize the vector to a length of 1
   */
  public normalize(): Vec2 {
      return this.div(this.mag());
  }

  /**
   * .limit()
   * Modifies, return limit the magnitude of the vector
   */
  public limit(scalar: number): Vec2 {
      if (this.magSq() > scalar * scalar) {
          this.normalize().mult(scalar);
      }
      return this;
  }

  /**
   * .setMag()
   * Modifies, return set the magnitude of the vector
   */
  public setMag(scalar: number): Vec2 {
      return this.normalize().mult(scalar);
  }

  /**
   * .heading()
   * Return angle of rotation for this vector
   */
  public heading(): number {
      return Math.atan2(this.y, this.x);
  }

  /**
   * .rotate()
   * Modifies, return rotate the vector by an angle
   */
  public rotate(angle: number): Vec2 {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return new Vec2(
          (this.x * cos) - (this.y * sin),
          (this.x * sin) + (this.y * cos),
      );
  }

  /**
   * .lerp()
   * Modifies, return linear interpolate the vector to another vector
   */
  public lerp(vec: Vec2, amount: number): Vec2 {
      if (amount > 1) {
          amount = 1;
      }
      if (amount < 0) {
          amount = 0;
      }
      return this.mult(amount).add(vec.clone().mult(1 - amount));
  }

  /**
   * invert()
   * Modifies, return inverted vector direction
   */
  public invert(): Vec2 {
      this.x *= -1;
      this.y *= -1;
      return this;
  }

  /**
   * positioning
   * something to do with the camera
   */
  public positioning(camera): Vec2 {
      return this.invert().rotate(camera.rotation).mult(camera.zoom).add(camera.focus);
  }

  public getScalar(): number {
      return this.x > this.y ? this.x : this.y;
  }

  /**
   * toArray
   */
  public toArray(): number[] {
      return [this.x, this.y];
  }

  /**
   * toString
   */
  public toString(): string {
      return 'x:' +
          this.x.toFixed(2) +
          ', y:' +
          this.y.toFixed(2) +
          '\n';
  }
}
