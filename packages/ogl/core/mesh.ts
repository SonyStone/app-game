import { GL_DRAW_ARRAYS_MODE } from '@packages/webgl/static-variables';
import { Mat3 } from '../math/mat-3';
import { Mat4 } from '../math/mat-4';
import type { Vec2 } from '../math/vec-2';
import type { Vec3 } from '../math/vec-3.js';
import type { Camera } from './camera';
import type { Geometry } from './geometry';
import type { Program } from './program';
import type { OGLRenderingContext } from './renderer';
import { Transform } from './transform';

let ID = 0;

export interface MeshOptions<TGeometry extends Geometry = Geometry, TProgram extends Program = Program> {
  geometry: TGeometry;
  program: TProgram;
  mode: GLenum;
  frustumCulled: boolean;
  renderOrder: number;
}

export type MeshRenderCallback = (renderInfo: { mesh: Mesh; camera?: Camera }) => any;

export interface RaycastHit {
  localPoint: Vec3;
  distance: number;
  point: Vec3;
  faceNormal: Vec3;
  localFaceNormal: Vec3;
  uv: Vec2;
  localNormal: Vec3;
  normal: Vec3;
}

/**
 * Represents a {@link https://en.wikipedia.org/wiki/Polygon_mesh | polygon mesh}.
 */
export class Mesh<TGeometry extends Geometry = Geometry, TProgram extends Program = Program> extends Transform {
  id: number = ID++;
  geometry: TGeometry;
  program: TProgram;
  mode: GLenum;

  frustumCulled: boolean;

  renderOrder: number;
  modelViewMatrix: Mat4 = new Mat4();
  normalMatrix: Mat3 = new Mat3();
  beforeRenderCallbacks: MeshRenderCallback[] = [];
  afterRenderCallbacks: MeshRenderCallback[] = [];

  hit?: Partial<RaycastHit>; // Set from raycaster

  zDepth?: number;

  constructor(
    readonly gl: OGLRenderingContext,
    {
      geometry,
      program,
      mode = GL_DRAW_ARRAYS_MODE.TRIANGLES,
      frustumCulled = true,
      renderOrder = 0
    }: Partial<MeshOptions> = {}
  ) {
    super();
    if (!gl.canvas) console.error('gl not passed as first argument to Mesh');
    this.geometry = geometry as TGeometry;
    this.program = program as TProgram;
    this.mode = mode;

    // Used to skip frustum culling
    this.frustumCulled = frustumCulled;

    // Override sorting to force an order
    this.renderOrder = renderOrder;
  }

  onBeforeRender(f: MeshRenderCallback): this {
    this.beforeRenderCallbacks.push(f);
    return this;
  }

  onAfterRender(f: MeshRenderCallback): this {
    this.afterRenderCallbacks.push(f);
    return this;
  }

  draw({ camera }: { camera?: Camera } = {}): void {
    if (camera) {
      // Add empty matrix uniforms to program if unset
      if (!this.program.uniforms.modelMatrix) {
        Object.assign(this.program.uniforms, {
          modelMatrix: { value: null },
          viewMatrix: { value: null },
          modelViewMatrix: { value: null },
          normalMatrix: { value: null },
          projectionMatrix: { value: null },
          cameraPosition: { value: null }
        });
      }

      // Set the matrix uniforms
      this.program.uniforms.projectionMatrix.value = camera.projectionMatrix;
      this.program.uniforms.cameraPosition.value = camera.worldPosition;
      this.program.uniforms.viewMatrix.value = camera.viewMatrix;
      this.modelViewMatrix.multiply(camera.viewMatrix, this.worldMatrix);
      this.normalMatrix.getNormalMatrix(this.modelViewMatrix);
      this.program.uniforms.modelMatrix.value = this.worldMatrix;
      this.program.uniforms.modelViewMatrix.value = this.modelViewMatrix;
      this.program.uniforms.normalMatrix.value = this.normalMatrix;
    }
    this.beforeRenderCallbacks.forEach((f) => f && f({ mesh: this, camera }));

    // determine if faces need to be flipped - when mesh scaled negatively
    let flipFaces = !!(this.program.cullFace && this.worldMatrix.determinant() < 0);
    this.program.use({ flipFaces });
    this.geometry.draw({ mode: this.mode, program: this.program });
    this.afterRenderCallbacks.forEach((f) => f && f({ mesh: this, camera }));
  }
}
