import { Mat4 } from '../math/mat-4';
import { Vec3, Vec3Tuple } from '../math/vec-3';
import { Mesh } from './mesh';
import { Transform } from './transform';

export interface CameraOptions {
  near: number;
  far: number;
  fov: number;
  aspect: number;
  left: number;
  right: number;
  bottom: number;
  top: number;
  zoom: number;
}

export interface PerspectiveOptions extends Pick<CameraOptions, 'near' | 'far' | 'fov' | 'aspect'> {}

export interface OrthographicOptions
  extends Pick<CameraOptions, 'near' | 'far' | 'left' | 'right' | 'bottom' | 'top' | 'zoom'> {}

export type CameraType = 'perspective' | 'orthographic';

const tempMat4 = /* @__PURE__ */ new Mat4();
const tempVec3a = /* @__PURE__ */ new Vec3();
const tempVec3b = /* @__PURE__ */ new Vec3();

export class Camera extends Transform {
  projectionMatrix: Mat4;
  viewMatrix: Mat4;
  projectionViewMatrix: Mat4;
  worldPosition: Vec3;

  type: CameraType;

  near!: number;
  far!: number;
  fov!: number;
  aspect!: number;
  left!: number;
  right!: number;
  bottom!: number;
  top!: number;
  zoom!: number;

  /**
   * An array of 6 vectors representing the camera frustum.
   */
  frustum!: (Vec3 & {
    constant: number;
  })[];

  constructor({
    near = 0.1,
    far = 100,
    fov = 45,
    aspect = 1,
    left,
    right,
    bottom,
    top,
    zoom = 1
  }: Partial<CameraOptions> = {}) {
    super();

    Object.assign(this, { near, far, fov, aspect, left, right, bottom, top, zoom });

    this.projectionMatrix = new Mat4();
    this.viewMatrix = new Mat4();
    this.projectionViewMatrix = new Mat4();
    this.worldPosition = new Vec3();

    // Use orthographic if left/right set, else default to perspective camera
    this.type = left || right ? 'orthographic' : 'perspective';

    console.log('Camera', this.type);

    if (this.type === 'orthographic') {
      this.orthographic();
    } else {
      this.perspective();
    }
  }

  perspective({
    near = this.near,
    far = this.far,
    fov = this.fov,
    aspect = this.aspect
  }: Partial<PerspectiveOptions> = {}): this {
    Object.assign(this, { near, far, fov, aspect });
    this.projectionMatrix.fromPerspective({ fov: fov * (Math.PI / 180), aspect, near, far });
    this.type = 'perspective';
    return this;
  }

  orthographic({
    near = this.near,
    far = this.far,
    left = this.left || -1,
    right = this.right || 1,
    bottom = this.bottom || -1,
    top = this.top || 1,
    zoom = this.zoom
  }: Partial<OrthographicOptions> = {}): this {
    Object.assign(this, { near, far, left, right, bottom, top, zoom });
    left /= zoom;
    right /= zoom;
    bottom /= zoom;
    top /= zoom;
    this.projectionMatrix.fromOrthogonal({ left, right, bottom, top, near, far });
    this.type = 'orthographic';
    return this;
  }

  updateMatrixWorld(): this {
    super.updateMatrixWorld();
    this.viewMatrix.inverse(this.worldMatrix);
    this.worldMatrix.getTranslation(this.worldPosition);

    // used for sorting
    this.projectionViewMatrix.multiply(this.projectionMatrix, this.viewMatrix);
    return this;
  }

  lookAt(target: Vec3Tuple): this {
    super.lookAt(target, true);
    return this;
  }

  // Project 3D coordinate to 2D point
  project(v: Vec3): this {
    v.applyMatrix4(this.viewMatrix);
    v.applyMatrix4(this.projectionMatrix);
    return this;
  }

  // Unproject 2D point to 3D coordinate
  unproject(v: Vec3): this {
    v.applyMatrix4(tempMat4.inverse(this.projectionMatrix));
    v.applyMatrix4(this.worldMatrix);
    return this;
  }

  updateFrustum(): void {
    if (!this.frustum) {
      this.frustum = [
        Object.assign(new Vec3(), {
          constant: 0
        }),
        Object.assign(new Vec3(), {
          constant: 0
        }),
        Object.assign(new Vec3(), {
          constant: 0
        }),
        Object.assign(new Vec3(), {
          constant: 0
        }),
        Object.assign(new Vec3(), {
          constant: 0
        }),
        Object.assign(new Vec3(), {
          constant: 0
        })
      ];
    }

    const m = this.projectionViewMatrix;
    this.frustum[0].set(m[3] - m[0], m[7] - m[4], m[11] - m[8]).constant = m[15] - m[12]; // -x
    this.frustum[1].set(m[3] + m[0], m[7] + m[4], m[11] + m[8]).constant = m[15] + m[12]; // +x
    this.frustum[2].set(m[3] + m[1], m[7] + m[5], m[11] + m[9]).constant = m[15] + m[13]; // +y
    this.frustum[3].set(m[3] - m[1], m[7] - m[5], m[11] - m[9]).constant = m[15] - m[13]; // -y
    this.frustum[4].set(m[3] - m[2], m[7] - m[6], m[11] - m[10]).constant = m[15] - m[14]; // +z (far)
    this.frustum[5].set(m[3] + m[2], m[7] + m[6], m[11] + m[10]).constant = m[15] + m[14]; // -z (near)

    for (let i = 0; i < 6; i++) {
      const invLen = 1.0 / this.frustum[i].distance();
      this.frustum[i].multiply(invLen);
      this.frustum[i].constant *= invLen;
    }
  }

  frustumIntersectsMesh(node: Mesh, worldMatrix: Mat4 = node.worldMatrix): boolean {
    // If no position attribute, treat as frustumCulled false
    if (!node.geometry.attributes.position) {
      return true;
    }

    if (!node.geometry.bounds || node.geometry.bounds.radius === Infinity) {
      node.geometry.computeBoundingSphere();
    }

    if (!node.geometry.bounds) {
      return true;
    }

    const center = tempVec3a;
    center.copy(node.geometry.bounds.center);
    center.applyMatrix4(worldMatrix);

    const radius = node.geometry.bounds.radius * worldMatrix.getMaxScaleOnAxis();

    return this.frustumIntersectsSphere(center, radius);
  }

  frustumIntersectsSphere(center: Vec3, radius: number): boolean {
    const normal = tempVec3b;

    for (let i = 0; i < 6; i++) {
      const plane = this.frustum[i];
      const distance = normal.copy(plane).dot(center) + plane.constant;
      if (distance < -radius) {
        return false;
      }
    }
    return true;
  }
}
