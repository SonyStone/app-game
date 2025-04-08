import type { Mat2x3 } from './m2x3';
import * as m2x3 from './m2x3';
import { Radians } from './types';
import type { Vec2 } from './v2';
import * as v2 from './v2';

export class Transform {
  // Underlying components
  private _position: Vec2 = v2.createFVec2();
  private _rotation: Radians = 0 as Radians;
  private _scale: Vec2 = v2.set(1, 1, v2.createFVec2());
  private _matrix: Mat2x3 = m2x3.identity(m2x3.createFMat2x3());
  private _worldMatrix: Mat2x3 = m2x3.identity(m2x3.createFMat2x3());
  private _isDirty: boolean = true;

  // Optional hierarchy
  private _parent: Transform | null = null;
  private _children: Transform[] = [];

  // Getters/setters that automatically mark as dirty
  get position(): Vec2 {
    return this._position;
  }
  set position(v: Vec2) {
    v2.copy(v, this._position);
    this._isDirty = true;
  }

  get rotation(): Radians {
    return this._rotation;
  }
  set rotation(r: Radians) {
    this._rotation = r;
    this._isDirty = true;
  }

  // Methods to manipulate the transform
  translate(dx: number, dy: number): this {
    this._position[0] += dx;
    this._position[1] += dy;
    this._isDirty = true;
    return this;
  }

  // Get the final matrix (calculating only when needed)
  getMatrix(): Mat2x3 {
    if (this._isDirty) {
      m2x3.compose(this._position, this._rotation, this._scale, this._matrix);
      this._isDirty = false;
    }
    return this._matrix;
  }

  // Get world matrix (includes parent transforms)
  getWorldMatrix(): Mat2x3 {
    this.getMatrix(); // Ensure local matrix is updated

    if (this._parent) {
      m2x3.multiply(this._parent.getWorldMatrix(), this._matrix, this._worldMatrix);
    } else {
      m2x3.copy(this._matrix, this._worldMatrix);
    }

    return this._worldMatrix;
  }

  // Transform point from local to world space
  transformPoint(point: Vec2): Vec2 {
    const result = v2.createFVec2();
    return m2x3.transformPoint(this.getWorldMatrix(), point, result);
  }
}
