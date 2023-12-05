import { Euler } from '../math/euler';
import { Mat4 } from '../math/mat-4';
import { Quat } from '../math/quat';
import { Vec3, Vec3Tuple } from '../math/vec-3';
import { Mesh } from './mesh';

/**
 * The base class for most objects and provides a set of properties and methods for manipulating
 * objects in 3D space.
 */
export class Transform {
  /**
   * The parent.
   * @see {@link https://en.wikipedia.org/wiki/Scene_graph | scene graph}.
   */
  parent: Transform | null = null;

  /**
   * An array with the children.
   */
  children: Transform[] = [];

  /**
   * The visibility.
   */
  visible: boolean = true;

  /**
   * The local transform matrix.
   */
  matrix: Mat4 = new Mat4();

  /**
   * The world transform matrix.
   */
  worldMatrix: Mat4 = new Mat4();

  /**
   * When set, it updates the local transform matrix every frame and also updates the worldMatrix
   * property.
   * @defaultValue `true`
   */
  matrixAutoUpdate: boolean = true;

  /**
   * When set, it updates the world transform matrix in that frame and resets this property to
   * false.
   * @defaultValue `false`
   */
  worldMatrixNeedsUpdate: boolean = false;

  /**
   * The local position.
   */
  position: Vec3 = new Vec3();

  /**
   * The local rotation as a {@link Quat | Quaternion}.
   */
  quaternion: Quat = new Quat();

  /**
   * The local scale.
   * @defaultValue `new Vec3(1)`
   */
  scale: Vec3 = new Vec3(1);

  /**
   * The local rotation as {@link Euler | Euler angles}.
   */
  rotation: Euler = new Euler();

  /**
   * Up vector used by the {@link lookAt | lookAt} method.
   * @defaultValue `new Vec3(0, 1, 0)`
   */
  up: Vec3 = new Vec3(0, 1, 0);

  /**
   * Creates a new transform object.
   */
  constructor() {
    this.rotation.onChange = () => this.quaternion.fromEuler(this.rotation);
    this.quaternion.onChange = () => this.rotation.fromQuaternion(this.quaternion);
  }

  /**
   * Sets the parent.
   * @param {Transform | null} parent The parent.
   * @param {boolean} [notifyParent=true] Adds this as a child of the parent.
   */
  setParent(parent: Transform | null, notifyParent: boolean = true): void {
    if (this.parent && parent !== this.parent) this.parent.removeChild(this, false);
    this.parent = parent;
    if (notifyParent && parent) parent.addChild(this, false);
  }

  /**
   * Adds a child.
   * @param {Transform} child The child.
   * @param {boolean} [notifyChild=true] Sets the parent of the child to this.
   */
  addChild(child: Transform, notifyChild: boolean = true): void {
    if (!~this.children.indexOf(child)) this.children.push(child);
    if (notifyChild) child.setParent(this, false);
  }

  /**
   * Removes a child.
   * @param {Transform} child The child.
   * @param {boolean} [notifyChild=true] Sets the parent of the child to null.
   */
  removeChild(child: Transform, notifyChild: boolean = true): void {
    if (!!~this.children.indexOf(child)) this.children.splice(this.children.indexOf(child), 1);
    if (notifyChild) child.setParent(null, false);
  }

  /**
   * Updates the world transform matrix.
   */
  updateMatrixWorld(force?: boolean): void {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.worldMatrixNeedsUpdate || force) {
      if (this.parent === null) this.worldMatrix.copy(this.matrix);
      else this.worldMatrix.multiply(this.parent.worldMatrix, this.matrix);
      this.worldMatrixNeedsUpdate = false;
      force = true;
    }

    for (let i = 0, l = this.children.length; i < l; i++) {
      this.children[i].updateMatrixWorld(force);
    }
  }

  /**
   * Updates the local transform matrix.
   */
  updateMatrix(): void {
    this.matrix.compose(this.quaternion, this.position, this.scale);
    this.worldMatrixNeedsUpdate = true;
  }

  /**
   * Executes the callback on this transform object and all descendants.
   * @param {Function} callback The callback.
   */
  traverse(callback: (node: Transform | Mesh) => boolean | void): void {
    // Return true in callback to stop traversing children
    if (callback(this)) return;
    for (let i = 0, l = this.children.length; i < l; i++) {
      this.children[i].traverse(callback);
    }
  }

  /**
   * Decomposes this transform object into it's position, quaternion and scale components.
   */
  decompose(): void {
    this.matrix.getTranslation(this.position);
    this.matrix.getRotation(this.quaternion);
    this.matrix.getScaling(this.scale);
    this.rotation.fromQuaternion(this.quaternion);
  }

  /**
   * Rotates this transform object to face a target vector.
   * @param {Vec3 | Vec3Tuple} target A target vector to look at.
   * @param {boolean} [invert=false] Invert the local position and target vector.
   */
  lookAt(target: Vec3 | Vec3Tuple, invert: boolean = false): void {
    if (invert) this.matrix.lookAt(this.position, target, this.up);
    else this.matrix.lookAt(target, this.position, this.up);
    this.matrix.getRotation(this.quaternion);
    this.rotation.fromQuaternion(this.quaternion);
  }
}
