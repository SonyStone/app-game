export class Vector2d {

  constructor(x ?: number, y ?: number) {
    this.x = x || 0;
    this.y = y || 0;
  }

  public x: number;
  public y: number;

  /**
   * Return new vector, from an angle
   */
  public static fromAngle(angle: number) {
    return new Vector2d(Math.cos(angle), Math.sin(angle));
  }
  /**
   * Return new vector, to angle, maybe?
   */
  public static angleTo(vec1: any, vec2: any) {
    return Math.atan2((vec1.y - vec2.y), (vec1.x - vec2.x));
  }

  /**
   * Return new vector, to angle, maybe?
   */
  public static clone(vec: Vector2d) {
    return new Vector2d(vec.x, vec.y);
  }

  /**
   * Returns the magnitude (length) of a vector.
   */
  public static magnitude(vector: Vector2d): number {
    return (Math.sqrt(
      (vector.getX() * vector.getX()) +
      (vector.getY() * vector.getY()),
    ));
  }

  /**
   * Returns the magnitude (length) of a vector (therefore saving a `sqrt` operation).
   */
  public static magnitudeSquared(vector: Vector2d): number {
    return (
      (vector.getX() * vector.getX()) +
      (vector.getY() * vector.getY())
    );
  }

  /**
   * Rotate a vector by an angle
   */
  public static rotate(vector: Vector2d, angle: number): Vector2d {
    return new Vector2d(
      (vector.getX() * Math.cos(angle)) - (vector.getY() * Math.sin(angle)),
      (vector.getX() * Math.sin(angle)) + (vector.getY() * Math.cos(angle)),
    );
  }

  /**
   * Rotates the vector about a specified point by specified angle.
   */
  public static rotateAbout(vectorA: Vector2d, angle: number, vectorB: Vector2d): Vector2d {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = vectorB.x + ((vectorA.x - vectorB.x) * cos - (vectorA.y - vectorB.y) * sin);
    const y = vectorB.y + ((vectorA.x - vectorB.x) * sin + (vectorA.y - vectorB.y) * cos);
    return new Vector2d(x, y);
  }

  public static isLessOrEqual(vectorA: Vector2d, vectorB: Vector2d) {
    return (
      (vectorA.getX() <= vectorB.getX()) &&
      (vectorA.getY() <= vectorB.getY())
    );
  }

  public static isGreaterOrEqual(vectorA: Vector2d, vectorB: Vector2d) {
    return (
      (vectorA.getX() >= vectorB.getX()) &&
      (vectorA.getY() >= vectorB.getY())
    );
  }

  public static isLess(vectorA: Vector2d, vectorB: Vector2d) {
    return (
      (vectorA.getX() < vectorB.getX()) &&
      (vectorA.getY() < vectorB.getY())
    );
  }

  public static isGreater(vectorA: Vector2d, vectorB: Vector2d) {
    return (
      (vectorA.getX() > vectorB.getX()) &&
      (vectorA.getY() > vectorB.getY())
    );
  }

  public getX(): number {
    return this.x;
  }

  public getY(): number {
    return this.y;
  }

  /**
   * Modifies, return set the components of the vector
   * with black magic
   */
  public set(vec: Vector2d): Vector2d;
  public set(x: number, y: number): Vector2d;

  public set(xOrVec: any, y ?: number): any {
    if (typeof xOrVec === 'object') {
      this.x = xOrVec.x;
      this.y = xOrVec.y;
    } else if (typeof xOrVec === 'number' && typeof y === 'number') {
      this.x = xOrVec;
      this.y = y;
    }
    return this;
  }

  public setX(x: number): Vector2d {
    this.x = x;
    return this;
  }

  public setY(y: number): Vector2d {
    this.y = y;
    return this;
  }
  /**
   * Modifies, return vector with zero coordinates
   */
  public setZero(): Vector2d {
    this.x = 0;
    this.y = 0;
    return this;
  }

  /**
   * Return new vector, copy of the vector
   */
  public copy(): Vector2d {
    return new Vector2d(this.x, this.y);
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
   * Return scalar, the magnitude of the vector, squared
   */
  public magSq(): number {
    return ((this.x * this.x) + (this.y * this.y));
  }

  /**
   * Modifies, return adds one vector to another
   */
  public add(vec: Vector2d): Vector2d {
    return new Vector2d(
      (this.x + vec.x),
      (this.y + vec.y),
    );
  }

  /**
   * Modifies, return subs one vector from another
   */
  public sub(vec: Vector2d): Vector2d {
    return new Vector2d(
      (this.x - vec.x),
      (this.y - vec.y),
    );
  }

  /**
   * Modifies, return multiplies a vector by a scalar
   */
  public mult(scalar: number): Vector2d {
    return new Vector2d(
      (this.x * scalar),
      (this.y * scalar),
    );
  }

  /**
   * Modifies, return divide a vector by a scalar
   */
  public div(scalar: number): Vector2d {
    return new Vector2d(
      (this.x / scalar),
      (this.y / scalar),
    );
  }

  /**
   * Return scalar, the distance between two points
   */
  public dist(vec: Vector2d): number {
    return Math.sqrt(
      Math.pow(this.x - vec.x, 2) +
      Math.pow(this.y - vec.y, 2),
    );
  }

  /**
   * Return scalar, the dot product of two vectors
   */
  public dot(vec: Vector2d): number {
    return (this.x * vec.x) + (this.y * vec.y);
  }

  /**
   * Modifies, return normalize the vector to a length of 1
   */
  public normalize(): Vector2d {
    return this.div(this.mag());
  }

  /**
   * Modifies, return limit the magnitude of the vector
   */
  public limit(scalar: number): Vector2d {
    if (this.magSq() > scalar * scalar) {
      this.normalize().mult(scalar);
    }
    return this;
  }

  /**
   * Modifies, return set the magnitude of the vector
   */
  public setMag(scalar: number): Vector2d {
    return this.normalize().mult(scalar);
  }

  /**
   * Return angle of rotation for this vector
   */
  public heading(): number {
    return Math.atan2(this.y, this.x);
  }

  /**
   * Modifies, return rotate the vector by an angle
   */
  public rotate(angle: number): Vector2d {
    return new Vector2d(
      (this.x * Math.cos(angle)) - (this.y * Math.sin(angle)),
      (this.x * Math.sin(angle)) + (this.y * Math.cos(angle)),
    );
  }

  /**
   * Modifies, return linear interpolate the vector to another vector
   */
  public lerp(vec: Vector2d, amount: number): Vector2d {
    if (amount > 1) { amount = 1; }
    if (amount < 0) { amount = 0; }
    return this.mult(amount).add(vec.copy().mult(1 - amount));
  }

  /**
   * Modifies, return inverted vector direction
   */
  public invert(): Vector2d {
    const x = this.x * -1;
    const y = this.y * -1;
    return new Vector2d(x, y);
  }

  /**
   * positioning
   * something to do with the camera
   */
  public positioning(camera: any): Vector2d {
    return this.invert().rotate(camera.rotation).mult(camera.zoom).add(camera.focus);
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
      ' ';
  }
}
