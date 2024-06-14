// attribute params
// {
//     data - typed array eg UInt16Array for indices, Float32Array
//     size - int default 1
//     instanced - default null. Pass divisor amount
//     type - gl enum default gl.UNSIGNED_SHORT for 'index', gl.FLOAT for others
//     normalized - boolean default false

//     buffer - gl buffer, if buffer exists, don't need to provide data - although needs position data for bounds calculation
//     stride - default 0 - for when passing in buffer
//     offset - default 0 - for when passing in buffer
//     count - default null - for when passing in buffer
//     min - array - for when passing in buffer
//     max - array - for when passing in buffer
// }

// TODO: fit in transform feedback

import { Vec3 } from '../math/vec-3';

import type { Program } from './program';
import type { OGLRenderingContext, RenderState } from './renderer';

const tempVec3 = /* @__PURE__ */ new Vec3();

let ID = 1;
let ATTR_ID = 1;

// To stop inifinite warnings
let isBoundsWarned = false;

export type AttributeMap = Record<string, Partial<Attribute>>;

export type AttributeData = Float32Array | Uint32Array | Uint16Array;

export interface Attribute {
  data: AttributeData;
  size: number;
  instanced: null | number | boolean;
  type: GLenum;
  normalized: boolean;

  buffer: WebGLBuffer;
  stride: number;
  offset: number;
  count: number;
  target: number;
  id: number;
  divisor: number;
  needsUpdate: boolean;
  usage: number;
  location: number;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  scale: Vec3;
  radius: number;
}

export type GeometryRaycast = 'sphere' | 'box';

/**
 * A mesh, line, or point geometry.
 */
export class Geometry {
  id: number = ID++;

  // Store one VAO per program attribute locations order
  VAOs: {
    [programKey: string]: WebGLVertexArrayObject;
  } = {};

  drawRange: {
    start: number;
    count: number;
  } = { start: 0, count: 0 };
  instancedCount: number = 0;

  // Alias for state store to avoid redundant calls for global state
  glState: RenderState = this.gl.renderer.state;

  isInstanced!: boolean;
  bounds!: Bounds;

  raycast?: GeometryRaycast; // User defined

  constructor(
    readonly gl: OGLRenderingContext,
    readonly attributes: AttributeMap = {}
  ) {
    if (!gl.canvas) {
      console.error('gl not passed as first argument to Geometry');
    }

    // Unbind current VAO so that new buffers don't get added to active mesh
    this.gl.bindVertexArray!(null);
    this.gl.renderer.currentGeometry = null;

    // create the buffers
    for (let key in attributes) {
      this.addAttribute(key, attributes[key]);
    }
  }

  addAttribute(key: string, attr: Partial<Attribute>): number | undefined {
    this.attributes[key] = attr;

    // Set options
    attr.id = ATTR_ID++; // TODO: currently unused, remove?
    attr.size = attr.size || 1;
    attr.type =
      attr.type ||
      (attr.data?.constructor === Float32Array
        ? this.gl.FLOAT
        : attr.data?.constructor === Uint16Array
        ? this.gl.UNSIGNED_SHORT
        : this.gl.UNSIGNED_INT); // Uint32Array

    attr.target = key === 'index' ? this.gl.ELEMENT_ARRAY_BUFFER : this.gl.ARRAY_BUFFER;
    attr.normalized = attr.normalized || false;
    attr.stride = attr.stride || 0;
    attr.offset = attr.offset || 0;
    attr.count = attr.count || (attr.stride ? attr.data!.byteLength / attr.stride : attr.data!.length / attr.size);
    attr.divisor = (attr.instanced as number) || 0;
    attr.needsUpdate = false;
    attr.usage = attr.usage || this.gl.STATIC_DRAW;

    if (!attr.buffer) {
      // Push data to buffer
      this.updateAttribute(attr);
    }

    // Update geometry counts. If indexed, ignore regular attributes
    if (attr.divisor) {
      this.isInstanced = true;
      if (this.instancedCount && this.instancedCount !== attr.count * attr.divisor) {
        console.warn('geometry has multiple instanced buffers of different length');
        return (this.instancedCount = Math.min(this.instancedCount, attr.count * attr.divisor));
      }
      this.instancedCount = attr.count * attr.divisor;
    } else if (key === 'index') {
      this.drawRange.count = attr.count;
    } else if (!this.attributes.index) {
      this.drawRange.count = Math.max(this.drawRange.count, attr.count);
    }
  }

  updateAttribute(attr: Partial<Attribute>): void {
    const isNewBuffer = !attr.buffer;
    if (isNewBuffer) {
      attr.buffer = this.gl.createBuffer()!;
    }
    if (this.glState.boundBuffer !== attr.buffer) {
      this.gl.bindBuffer(attr.target!, attr.buffer!);
      this.glState.boundBuffer = attr.buffer;

      // TODO
      // ! I added it here to set new Buffer
      // ! Without it the buffer is not set
      {
        this.gl.vertexAttribPointer(
          attr.location!,
          attr.size!,
          attr.type!,
          attr.normalized!,
          attr.stride!,
          attr.offset!
        );
      }
    }
    if (isNewBuffer) {
      this.gl.bufferData(attr.target!, attr.data!, attr.usage!);
    } else {
      this.gl.bufferSubData(attr.target!, 0, attr.data!);
    }
    attr.needsUpdate = false;
  }

  setIndex(value: Attribute): void {
    this.addAttribute('index', value);
  }

  setDrawRange(start: number, count: number): void {
    this.drawRange.start = start;
    this.drawRange.count = count;
  }

  setInstancedCount(value: number): void {
    this.instancedCount = value;
  }

  createVAO(program: Program): void {
    this.VAOs[program.attributeOrder] = this.gl.createVertexArray()!;
    this.gl.bindVertexArray!(this.VAOs[program.attributeOrder]);
    this.bindAttributes(program);
  }

  bindAttributes(program: Program): void {
    // Link all attributes to program using gl.vertexAttribPointer
    program.attributeLocations.forEach((location, { name, type }) => {
      // If geometry missing a required shader attribute
      if (!this.attributes[name]) {
        console.warn(`active attribute ${name} not being supplied`);
        return;
      }

      const attr = this.attributes[name];

      this.gl.bindBuffer(attr.target!, attr.buffer!);
      this.glState.boundBuffer = attr.buffer;

      // For matrix attributes, buffer needs to be defined per column
      let numLoc = 1;
      if (type === 35674) numLoc = 2; // mat2
      if (type === 35675) numLoc = 3; // mat3
      if (type === 35676) numLoc = 4; // mat4

      const size = attr.size! / numLoc;
      const stride = numLoc === 1 ? 0 : numLoc * numLoc * 4;
      const offset = numLoc === 1 ? 0 : numLoc * 4;

      for (let i = 0; i < numLoc; i++) {
        attr.location = location + i;
        this.gl.vertexAttribPointer(
          location + i,
          size,
          attr.type!,
          attr.normalized!,
          attr.stride! + stride,
          attr.offset! + i * offset
        );
        this.gl.enableVertexAttribArray(location + i);

        // For instanced attributes, divisor needs to be set.
        // For firefox, need to set back to 0 if non-instanced drawn after instanced. Else won't render
        this.gl.vertexAttribDivisor!(location + i, attr.divisor!);
      }
    });

    // Bind indices if geometry indexed
    if (this.attributes.index) this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.attributes.index.buffer!);
  }

  draw({ program, mode = this.gl.TRIANGLES }: { program: Program; mode?: number }): void {
    if (this.gl.renderer.currentGeometry !== `${this.id}_${program.attributeOrder}`) {
      if (!this.VAOs[program.attributeOrder]) {
        this.createVAO(program);
      }
      this.gl.bindVertexArray!(this.VAOs[program.attributeOrder]);
      this.gl.renderer.currentGeometry = `${this.id}_${program.attributeOrder}`;
    }

    // Check if any attributes need updating
    for (const [{ name }, location] of program.attributeLocations) {
      const attr = this.attributes[name];
      if (attr.needsUpdate) {
        this.updateAttribute(attr);
      }
    }

    // For drawElements, offset needs to be multiple of type size
    let indexBytesPerElement = 2;
    if (this.attributes.index?.type === this.gl.UNSIGNED_INT) {
      indexBytesPerElement = 4;
    }

    if (this.isInstanced) {
      if (this.attributes.index) {
        this.gl.drawElementsInstanced(
          mode,
          this.drawRange.count,
          this.attributes.index.type!,
          this.attributes.index.offset! + this.drawRange.start * indexBytesPerElement,
          this.instancedCount
        );
      } else {
        this.gl.drawArraysInstanced!(mode, this.drawRange.start, this.drawRange.count, this.instancedCount);
      }
    } else {
      if (this.attributes.index) {
        this.gl.drawElements(
          mode,
          this.drawRange.count,
          this.attributes.index.type!,
          this.attributes.index.offset! + this.drawRange.start * indexBytesPerElement
        );
      } else {
        this.gl.drawArrays(mode, this.drawRange.start, this.drawRange.count);
      }
    }
  }

  getPosition(): Partial<Attribute> | undefined {
    // Use position buffer, or min/max if available
    const attr = this.attributes.position;
    // if (attr.min) return [...attr.min, ...attr.max];
    if (attr.data) {
      return attr;
    }
    if (isBoundsWarned) {
      return;
    }
    console.warn('No position buffer data found to compute bounds');
    isBoundsWarned = true;
    return;
  }

  computeBoundingBox(attr: Partial<Attribute>): void {
    if (!attr) {
      attr = this.getPosition()!;
    }
    const array = attr.data!;
    // Data loaded shouldn't haave stride, only buffers
    // const stride = attr.stride ? attr.stride / array.BYTES_PER_ELEMENT : attr.size;
    const stride = attr.size!;

    if (!this.bounds) {
      this.bounds = {
        min: new Vec3(),
        max: new Vec3(),
        center: new Vec3(),
        scale: new Vec3(),
        radius: Infinity
      };
    }

    const min = this.bounds.min;
    const max = this.bounds.max;
    const center = this.bounds.center;
    const scale = this.bounds.scale;

    min.set(+Infinity);
    max.set(-Infinity);

    // TODO: check size of position (eg triangle with Vec2)
    for (let i = 0, l = array.length; i < l; i += stride) {
      const x = array[i];
      const y = array[i + 1];
      const z = array[i + 2];

      min.x = Math.min(x, min.x);
      min.y = Math.min(y, min.y);
      min.z = Math.min(z, min.z);

      max.x = Math.max(x, max.x);
      max.y = Math.max(y, max.y);
      max.z = Math.max(z, max.z);
    }

    scale.sub(max, min);
    center.add(min, max).divide(2);
  }

  computeBoundingSphere(attr?: Partial<Attribute>): void {
    if (!attr) attr = this.getPosition();
    const array = attr!.data!;
    // Data loaded shouldn't haave stride, only buffers
    // const stride = attr.stride ? attr.stride / array.BYTES_PER_ELEMENT : attr.size;
    const stride = attr!.size!;

    if (!this.bounds) {
      this.computeBoundingBox(attr!);
    }

    let maxRadiusSq = 0;
    for (let i = 0, l = array.length; i < l; i += stride) {
      tempVec3.fromArray(array, i);
      maxRadiusSq = Math.max(maxRadiusSq, this.bounds.center.squaredDistance(tempVec3));
    }

    this.bounds.radius = Math.sqrt(maxRadiusSq);
  }

  remove(): void {
    for (let key in this.VAOs) {
      this.gl.deleteVertexArray!(this.VAOs[key]);
      delete this.VAOs[key];
    }
    for (let key in this.attributes) {
      this.gl.deleteBuffer(this.attributes[key].buffer!);
      delete this.attributes[key];
    }
  }
}
