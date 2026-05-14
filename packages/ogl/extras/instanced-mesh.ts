import { Mesh } from '../core/mesh';
import type { MeshOptions, MeshRenderCallback } from '../core/mesh';
import type { OGLRenderingContext } from '../core/renderer';
import { Transform } from '../core/transform';
import { Vec4 } from '../math/vec-4';

type InstancedTransform = Transform & {
  index: number;
  lightmapData?: Vec4;
};

export class InstancedMesh extends Mesh {
  isInstancedMesh: boolean;
  instanceTransforms: InstancedTransform[] | null = null;
  instanceLightmapScaleOffset: Float32Array | Uint16Array | Uint32Array | null = null;
  totalInstanceCount = 0;
  frustumCullFunction: MeshRenderCallback | null = null;
  instanceRenderList: InstancedTransform[] | null = null;
  name?: string;

  constructor(gl: OGLRenderingContext, options?: Partial<MeshOptions>) {
    super(gl, options);

    // Skip renderer frustum culling
    this.frustumCulled = false;
    this.isInstancedMesh = true;
  }

  addFrustumCull(): void {
    this.instanceTransforms = null;
    this.instanceLightmapScaleOffset = null;
    this.totalInstanceCount = 0;
    this.frustumCullFunction = null;
    this.instanceRenderList = null;

    // Get instanced mesh
    if (!this.geometry.attributes.instanceMatrix) {
      console.error(
        `mesh ${this.name ? `"${this.name}" ` : ``}missing instanceMatrix attribute; unable to frustum cull`
      );
      return;
    }

    // Make list of transforms from instanceMatrix
    const matrixData = this.geometry.attributes.instanceMatrix.data;
    if (!matrixData) {
      return;
    }

    this.instanceTransforms = [];
    for (let i = 0, j = 0; i < matrixData.length; i += 16, j++) {
      const transform = new Transform() as InstancedTransform;
      transform.index = j;
      transform.matrix.fromArray(matrixData, i);
      transform.decompose();
      this.instanceTransforms.push(transform);
      // Add transforms to parent to update world matrices
      transform.setParent(this.parent);
    }
    this.totalInstanceCount = this.instanceTransforms.length;

    // Check for lightmap attributes - attach to transform
    if (!!this.geometry.attributes.lightmapScaleOffset) {
      const lightmapData = this.geometry.attributes.lightmapScaleOffset.data;
      if (!lightmapData) {
        return;
      }

      this.instanceLightmapScaleOffset = lightmapData;
      for (let i = 0, j = 0; i < lightmapData.length; i += 4, j++) {
        this.instanceTransforms[j]!.lightmapData = new Vec4().fromArray(lightmapData, i);
      }
    }

    this.frustumCullFunction = ({ camera }: { camera?: any }) => {
      if (!camera || !this.instanceTransforms) {
        return;
      }

      // frustum cull transforms each frame - pass world matrix
      const instanceRenderList: InstancedTransform[] = [];
      this.instanceRenderList = instanceRenderList;
      this.instanceTransforms.forEach((transform: InstancedTransform) => {
        if (!camera.frustumIntersectsMesh(this, transform.worldMatrix)) return;
        instanceRenderList.push(transform);
      });

      // update instanceMatrix and instancedCount with visible
      instanceRenderList.forEach((transform: InstancedTransform, i: number) => {
        this.geometry.attributes.instanceMatrix.data?.set(transform.matrix, i * 16);

        // Update lightmap attr
        if (transform.lightmapData && this.geometry.attributes.lightmapScaleOffset.data) {
          transform.lightmapData.toArray(this.geometry.attributes.lightmapScaleOffset.data, i * 4);
          this.geometry.attributes.lightmapScaleOffset.needsUpdate = true;
        }
      });
      this.geometry.instancedCount = instanceRenderList.length;
      this.geometry.attributes.instanceMatrix.needsUpdate = true;
    };

    this.onBeforeRender(this.frustumCullFunction);
  }

  removeFrustumCull(): void {
    if (this.frustumCullFunction) {
      this.beforeRenderCallbacks = this.beforeRenderCallbacks.filter((callback) => callback !== this.frustumCullFunction);
    }

    this.geometry.instancedCount = this.totalInstanceCount;
    this.instanceTransforms?.forEach((transform: InstancedTransform, i: number) => {
      this.geometry.attributes.instanceMatrix.data?.set(transform.matrix, i * 16);

      // Update lightmap attr
      if (transform.lightmapData && this.geometry.attributes.lightmapScaleOffset.data) {
        transform.lightmapData.toArray(this.geometry.attributes.lightmapScaleOffset.data, i * 4);
        this.geometry.attributes.lightmapScaleOffset.needsUpdate = true;
      }
    });
    this.geometry.attributes.instanceMatrix.needsUpdate = true;
  }
}
