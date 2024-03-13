import { FVec2 } from '@packages/math';
import { AttributeMap, Geometry } from '../core/geometry';
import { Mesh } from '../core/mesh';
import { Program } from '../core/program';
import { OGLRenderingContext } from '../core/renderer';
import { Color } from '../math/color';
import { Vec3 } from '../math/vec-3';

import defaultFragment from './polyline.frag?raw';
import defaultVertex from './polyline.vert?raw';

const tmp = /* @__PURE__ */ new Vec3();

export interface PolylineOptions {
  points: Vec3[];
  vertex?: string;
  fragment?: string;
  uniforms?: Record<string, any>;
  attributes?: AttributeMap;
}

/**
 * A polyline mesh.
 * @see {@link https://github.com/oframe/ogl/blob/master/src/extras/Polyline.js | Source}
 */
export class Polyline {
  gl: OGLRenderingContext;
  points: Vec3[];
  count: number;

  position: Float32Array;
  prev: Float32Array;
  next: Float32Array;

  geometry: Geometry;

  resolution?: { value: FVec2 };
  dpr?: { value: number };
  thickness?: { value: number };
  color?: { value: Color };
  miter?: { value: number };

  program: Program;

  mesh: Mesh;

  constructor(
    gl: OGLRenderingContext,
    {
      points, // Array of Vec3s
      vertex = defaultVertex,
      fragment = defaultFragment,
      uniforms = {},
      attributes = {} // For passing in custom attribs
    }: PolylineOptions
  ) {
    this.gl = gl;
    this.points = points;
    this.count = points.length;

    // Create buffers
    this.position = new Float32Array(this.count * 3 * 2);
    this.prev = new Float32Array(this.count * 3 * 2);
    this.next = new Float32Array(this.count * 3 * 2);
    const side = new Float32Array(this.count * 1 * 2);
    const uv = new Float32Array(this.count * 2 * 2);
    const index = new Uint16Array((this.count - 1) * 3 * 2);

    // Set static buffers
    for (let i = 0; i < this.count; i++) {
      side.set([-1, 1], i * 2);
      const v = i / (this.count - 1);
      uv.set([0, v, 1, v], i * 4);

      if (i === this.count - 1) continue;
      const ind = i * 2;
      index.set([ind + 0, ind + 1, ind + 2], (ind + 0) * 3);
      index.set([ind + 2, ind + 1, ind + 3], (ind + 1) * 3);
    }

    const geometry = (this.geometry = new Geometry(
      gl,
      Object.assign(attributes, {
        position: { size: 3, data: this.position },
        prev: { size: 3, data: this.prev },
        next: { size: 3, data: this.next },
        side: { size: 1, data: side },
        uv: { size: 2, data: uv },
        index: { size: 1, data: index }
      })
    ));

    // Populate dynamic buffers
    this.updateGeometry();

    if (!uniforms.uResolution) this.resolution = uniforms.uResolution = { value: new FVec2() };
    if (!uniforms.uDPR) this.dpr = uniforms.uDPR = { value: 1 };
    if (!uniforms.uThickness) this.thickness = uniforms.uThickness = { value: 1 };
    if (!uniforms.uColor) this.color = uniforms.uColor = { value: new Color('#000') };
    if (!uniforms.uMiter) this.miter = uniforms.uMiter = { value: 1 };

    // Set size uniforms' values
    this.resize();

    const program = (this.program = new Program(gl, {
      vertex,
      fragment,
      uniforms
    }));

    this.mesh = new Mesh(gl, { geometry, program });
  }

  updateGeometry() {
    this.points.forEach((p, i) => {
      p.toArray(this.position, i * 3 * 2);
      p.toArray(this.position, i * 3 * 2 + 3);

      if (!i) {
        // If first point, calculate prev using the distance to 2nd point
        tmp
          .copy(p)
          .sub(this.points[i + 1])
          .add(p);
        tmp.toArray(this.prev, i * 3 * 2);
        tmp.toArray(this.prev, i * 3 * 2 + 3);
      } else {
        p.toArray(this.next, (i - 1) * 3 * 2);
        p.toArray(this.next, (i - 1) * 3 * 2 + 3);
      }

      if (i === this.points.length - 1) {
        // If last point, calculate next using distance to 2nd last point
        tmp
          .copy(p)
          .sub(this.points[i - 1])
          .add(p);
        tmp.toArray(this.next, i * 3 * 2);
        tmp.toArray(this.next, i * 3 * 2 + 3);
      } else {
        p.toArray(this.prev, (i + 1) * 3 * 2);
        p.toArray(this.prev, (i + 1) * 3 * 2 + 3);
      }
    });

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.prev.needsUpdate = true;
    this.geometry.attributes.next.needsUpdate = true;
  }

  // Only need to call if not handling resolution uniforms manually
  resize() {
    // Update automatic uniforms if not overridden
    if (this.resolution) {
      this.resolution.value.set(this.gl.canvas.width, this.gl.canvas.height);
    }
    if (this.dpr) {
      this.dpr.value = this.gl.renderer.dpr;
    }
  }
}
