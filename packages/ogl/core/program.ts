import { GL_DATA_TYPE } from '@webgl/static-variables';
import type { BlendEquation, BlendFunc, OGLRenderingContext } from './renderer';

// TODO: upload empty texture if null ? maybe not
// TODO: upload identity matrix if null ?
// TODO: sampler Cube

let ID = 1;

export interface ProgramOptions {
  vertex: string;
  fragment: string;
  uniforms: Record<string, any>;
  transparent: boolean;
  cullFace: GLenum | false | null;
  frontFace: GLenum;
  depthTest: boolean;
  depthWrite: boolean;
  depthFunc: GLenum;
}

export interface UniformInfo extends WebGLActiveInfo {
  uniformName: string;
  nameComponents: string[];
  isStruct: boolean;
  isStructArray: boolean;
  structIndex: number;
  structProperty: string;
}

/**
 * A WebGL program.
 * @see {@link https://github.com/oframe/ogl/blob/master/src/core/Program.js | Source}
 */
export class Program {
  gl: OGLRenderingContext;
  uniforms: Record<string, any>;
  id: number;

  transparent: boolean;
  cullFace: GLenum | false | null;
  frontFace: GLenum;
  depthTest: boolean;
  depthWrite: boolean;
  depthFunc: GLenum;
  blendFunc: BlendFunc;
  blendEquation: BlendEquation;

  program: WebGLProgram;
  uniformLocations!: Map<UniformInfo, WebGLUniformLocation>;
  attributeLocations!: Map<WebGLActiveInfo, GLint>;
  attributeOrder!: string;

  constructor(
    gl: OGLRenderingContext,
    {
      vertex,
      fragment,
      uniforms = {},

      transparent = false,
      cullFace = gl.BACK,
      frontFace = gl.CCW,
      depthTest = true,
      depthWrite = true,
      depthFunc = gl.LESS
    }: Partial<ProgramOptions> = {}
  ) {
    if (!gl.canvas) console.error('gl not passed as first argument to Program');
    this.gl = gl;
    this.uniforms = uniforms;
    this.id = ID++;

    if (!vertex) {
      console.warn('vertex shader not supplied');
    }
    if (!fragment) {
      console.warn('fragment shader not supplied');
    }

    // Store program state
    this.transparent = transparent;
    this.cullFace = cullFace;
    this.frontFace = frontFace;
    this.depthTest = depthTest;
    this.depthWrite = depthWrite;
    this.depthFunc = depthFunc;
    this.blendFunc = {} as any;
    this.blendEquation = {} as any;

    // set default blendFunc if transparent flagged
    if (this.transparent && !this.blendFunc.src) {
      if (this.gl.renderer.premultipliedAlpha) this.setBlendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
      else this.setBlendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    }

    // compile vertex shader and log errors
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertexShader, vertex!);
    gl.compileShader(vertexShader);
    if (gl.getShaderInfoLog(vertexShader) !== '') {
      console.warn(`${gl.getShaderInfoLog(vertexShader)}\nVertex Shader\n${addLineNumbers(vertex)}`);
    }

    // compile fragment shader and log errors
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragmentShader, fragment!);
    gl.compileShader(fragmentShader);
    if (gl.getShaderInfoLog(fragmentShader) !== '') {
      console.warn(`${gl.getShaderInfoLog(fragmentShader)}\nFragment Shader\n${addLineNumbers(fragment)}`);
    }

    // compile program and log errors
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(this.program));
      return;
    }

    // Remove shader once linked
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    // Get active uniform locations
    this.uniformLocations = new Map();
    let numUniforms = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
    for (let uIndex = 0; uIndex < numUniforms; uIndex++) {
      let uniform = gl.getActiveUniform(this.program, uIndex)! as UniformInfo;
      this.uniformLocations.set(uniform, gl.getUniformLocation(this.program, uniform.name)!);

      // split uniforms' names to separate array and struct declarations
      const split = uniform!.name.match(/(\w+)/g)!;

      uniform.uniformName = split[0];
      uniform.nameComponents = split.slice(1);
    }

    // Get active attribute locations
    this.attributeLocations = new Map();
    const locations = [];
    const numAttribs = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);
    for (let aIndex = 0; aIndex < numAttribs; aIndex++) {
      const attribute = gl.getActiveAttrib(this.program, aIndex)!;
      const location = gl.getAttribLocation(this.program, attribute.name);
      // Ignore special built-in inputs. eg gl_VertexID, gl_InstanceID
      if (location === -1) continue;
      locations[location] = attribute.name;
      this.attributeLocations.set(attribute, location);
    }
    this.attributeOrder = locations.join('');
  }

  setBlendFunc(src: GLenum, dst: GLenum, srcAlpha?: GLenum, dstAlpha?: GLenum): void {
    this.blendFunc.src = src;
    this.blendFunc.dst = dst;
    this.blendFunc.srcAlpha = srcAlpha;
    this.blendFunc.dstAlpha = dstAlpha;
    if (src) this.transparent = true;
  }

  setBlendEquation(modeRGB: GLenum, modeAlpha: GLenum): void {
    this.blendEquation.modeRGB = modeRGB;
    this.blendEquation.modeAlpha = modeAlpha;
  }

  applyState(): void {
    if (this.depthTest) this.gl.renderer.enable(this.gl.DEPTH_TEST);
    else this.gl.renderer.disable(this.gl.DEPTH_TEST);

    if (this.cullFace) this.gl.renderer.enable(this.gl.CULL_FACE);
    else this.gl.renderer.disable(this.gl.CULL_FACE);

    if (this.blendFunc.src) this.gl.renderer.enable(this.gl.BLEND);
    else this.gl.renderer.disable(this.gl.BLEND);

    if (this.cullFace) this.gl.renderer.setCullFace(this.cullFace);
    this.gl.renderer.setFrontFace(this.frontFace);
    this.gl.renderer.setDepthMask(this.depthWrite);
    this.gl.renderer.setDepthFunc(this.depthFunc);
    if (this.blendFunc.src)
      this.gl.renderer.setBlendFunc(
        this.blendFunc.src,
        this.blendFunc.dst,
        this.blendFunc.srcAlpha!,
        this.blendFunc.dstAlpha!
      );
    this.gl.renderer.setBlendEquation(this.blendEquation.modeRGB, this.blendEquation.modeAlpha!);
  }

  use({ flipFaces = false }: { flipFaces?: boolean } = {}): void {
    let textureUnit = -1;
    const programActive = this.gl.renderer.state.currentProgram === this.id;

    // Avoid gl call if program already in use
    if (!programActive) {
      this.gl.useProgram(this.program);
      this.gl.renderer.state.currentProgram = this.id;
    }

    // Set only the active uniforms found in the shader
    this.uniformLocations.forEach((location, activeUniform) => {
      let uniform = this.uniforms[activeUniform.uniformName];

      for (const component of activeUniform.nameComponents) {
        if (!uniform) break;

        if (component in uniform) {
          uniform = uniform[component];
        } else if (Array.isArray(uniform.value)) {
          break;
        } else {
          uniform = undefined;
          break;
        }
      }

      if (!uniform) {
        warn(`Active uniform ${activeUniform.name} has not been supplied`);
        return;
      }

      if (uniform && uniform.value === undefined) {
        warn(`${activeUniform.name} uniform is missing a value parameter`);
        return;
      }

      if (uniform.value.texture) {
        textureUnit = textureUnit + 1;

        // Check if texture needs to be updated
        uniform.value.update(textureUnit);
        return setUniform(this.gl, activeUniform.type, location, textureUnit);
      }

      // For texture arrays, set uniform as an array of texture units instead of just one
      if (uniform.value.length && uniform.value[0].texture) {
        const textureUnits: number[] = [];
        uniform.value.forEach((value: any) => {
          textureUnit = textureUnit + 1;
          value.update(textureUnit);
          textureUnits.push(textureUnit);
        });

        return setUniform(this.gl, activeUniform.type, location, textureUnits);
      }

      setUniform(this.gl, activeUniform.type, location, uniform.value);
    });

    this.applyState();
    if (flipFaces) this.gl.renderer.setFrontFace(this.frontFace === this.gl.CCW ? this.gl.CW : this.gl.CCW);
  }

  remove(): void {
    this.gl.deleteProgram(this.program);
  }
}

function setUniform(
  gl: OGLRenderingContext,
  type: number,
  location: WebGLUniformLocation,
  value: Float32Array[] | Float32Array
) {
  value = value.length ? flatten(value) : value;
  const setValue = gl.renderer.state.uniformLocations.get(location);

  // Avoid redundant uniform commands
  if (value.length) {
    if (setValue === undefined || setValue.length !== value.length) {
      // clone array to store as cache
      gl.renderer.state.uniformLocations.set(location, value.slice(0));
    } else {
      if (arraysEqual(setValue, value)) {
        return;
      }

      // Update cached array values
      setValue.set ? setValue.set(value) : setArray(setValue, value);
      gl.renderer.state.uniformLocations.set(location, setValue);
    }
  } else {
    if (setValue === value) {
      return;
    }
    gl.renderer.state.uniformLocations.set(location, value);
  }

  switch (type) {
    case GL_DATA_TYPE.FLOAT:
      return value.length ? gl.uniform1fv(location, value) : gl.uniform1f(location, value); // FLOAT
    case GL_DATA_TYPE.FLOAT_VEC2:
      return gl.uniform2fv(location, value);
    case GL_DATA_TYPE.FLOAT_VEC3:
      return gl.uniform3fv(location, value);
    case GL_DATA_TYPE.FLOAT_VEC4:
      return gl.uniform4fv(location, value);
    case GL_DATA_TYPE.BOOL:
    case GL_DATA_TYPE.INT:
    case GL_DATA_TYPE.SAMPLER_2D:
    case GL_DATA_TYPE.SAMPLER_CUBE:
      return value.length ? gl.uniform1iv(location, value) : gl.uniform1i(location, value); // SAMPLER_CUBE
    case GL_DATA_TYPE.BOOL_VEC2: // BOOL_VEC2
    case GL_DATA_TYPE.INT_VEC2:
      return gl.uniform2iv(location, value); // INT_VEC2
    case GL_DATA_TYPE.BOOL_VEC3: // BOOL_VEC3
    case GL_DATA_TYPE.INT_VEC3:
      return gl.uniform3iv(location, value); // INT_VEC3
    case GL_DATA_TYPE.BOOL_VEC4: // BOOL_VEC4
    case GL_DATA_TYPE.INT_VEC4:
      return gl.uniform4iv(location, value); // INT_VEC4
    case GL_DATA_TYPE.FLOAT_MAT2:
      return gl.uniformMatrix2fv(location, false, value); // FLOAT_MAT2
    case GL_DATA_TYPE.FLOAT_MAT3:
      return gl.uniformMatrix3fv(location, false, value); // FLOAT_MAT3
    case GL_DATA_TYPE.FLOAT_MAT4:
      return gl.uniformMatrix4fv(location, false, value); // FLOAT_MAT4
  }
}

function addLineNumbers(string?: string) {
  if (!string) {
    return;
  }

  let lines = string.split('\n');
  for (let i = 0; i < lines.length; i++) {
    lines[i] = i + 1 + ': ' + lines[i];
  }
  return lines.join('\n');
}

// cache of typed arrays used to flatten uniform arrays
const arrayCacheF32: { [key: number]: Float32Array } = {};

function flatten(a: Float32Array[] | Float32Array): Float32Array {
  const arrayLen = a.length;
  const valueLen = (a[0] as Float32Array).length;
  if (valueLen === undefined) {
    return a as Float32Array;
  }
  const length = arrayLen * valueLen;
  let value = arrayCacheF32[length];
  if (!value) arrayCacheF32[length] = value = new Float32Array(length);
  for (let i = 0; i < arrayLen; i++) value.set(a[i], i * valueLen);
  return value;
}

function arraysEqual(a: Float32Array, b: Float32Array) {
  if (a.length !== b.length) return false;
  for (let i = 0, l = a.length; i < l; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function setArray(a: Float32Array, b: Float32Array) {
  for (let i = 0, l = a.length; i < l; i++) {
    a[i] = b[i];
  }
}

let warnCount = 0;
function warn(message: string): void {
  if (warnCount > 100) {
    return;
  }
  console.warn(message);
  warnCount++;
  if (warnCount > 100) {
    console.warn('More than 100 program warnings - stopping logs.');
  }
}