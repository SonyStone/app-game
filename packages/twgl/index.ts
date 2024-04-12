import * as m4 from './m4.js';
import * as primitives from './primitives.js';
import * as v3 from './v3.js';

export * from './twgl.js';
export { m4, v3, primitives };

export interface Arrays {
  [key: string]: number[] | ArrayBuffer | FullArraySpec;
}

export type ArraySpec = number[] | ArrayBuffer | FullArraySpec;

export interface AttachmentOptions extends TextureOptions {
  attach?: number;
  format?: number;
  type?: number;
  target?: number;
  level?: number;
  attachment?: WebGLObject;
}

export interface AttribInfo {
  numComponents?: number;
  size?: number;
  type?: number;
  normalize?: boolean;
  offset?: number;
  stride?: number;
  buffer?: WebGLBuffer;
  drawType?: number;
}

export interface BlockSpec {
  index: number;
  size: number;
  uniformIndices: number[];
  usedByVertexShader: boolean;
  usedByFragmentShader: boolean;
  used: boolean;
}

export interface BufferInfo {
  numElements: number;
  elementType?: number;
  indices: WebGLBuffer;
  attribs: { [key: string]: AttribInfo };
}

export type CubemapReadyCallback = (err: any, tex: WebGLTexture, imgs: HTMLImageElement[]) => void;

export interface Defaults {
  attribPrefix?: string;
  textureColor?: number[];
  crossOrigin?: string;
  enableVertexArrayObjects?: boolean;
}

export interface DrawObject {
  active?: boolean;
  type?: number;
  programInfo: ProgramInfo;
  bufferInfo?: BufferInfo;
  vertexArrayInfo?: VertexArrayInfo;
  uniforms: { [key: string]: any };
  offset?: number;
  count?: number;
}

export type ErrorCallback = (msg: string, lineOffset?: number) => void;

export interface FramebufferInfo {
  framebuffer: WebGLFramebuffer;
  attachments: WebGLObject[];
}

export interface FullArraySpec {
  data: number | number[] | ArrayBuffer;
  numComponents?: number;
  type?: new (...args: any[]) => ArrayBuffer;
  size?: number;
  normalize?: boolean;
  stride?: number;
  offset?: number;
  name?: string;
  attribName?: string;
}

export interface ProgramInfo {
  program: WebGLProgram;
  uniformSetters: { [key: string]: (...para: any[]) => void };
  attribSetters: { [key: string]: (...para: any[]) => void };
  transformFeedbackInfo: { [key: string]: TransformFeedbackInfo };
}

export interface ProgramOptions {
  errorCallback?: (error: any) => void;
  attribLocations?: { [key: string]: number };
  transformFeedbackVaryings?: BufferInfo | { [key: string]: AttribInfo } | string[];
  transformFeedbackMode?: number;
}

export type FullTextureSrc =
  | number[]
  | ArrayBuffer
  | HTMLCanvasElement
  | HTMLImageElement
  | HTMLVideoElement
  | string
  | string[]
  | TextureFunc;

export type TextureFunc = (gl: WebGLRenderingContext, options: TextureOptions) => FullTextureSrc;

export interface TextureOptions {
  target?: number;
  width?: number;
  height?: number;
  depth?: number;
  min?: number;
  mag?: number;
  minMag?: number;
  internalFormat?: number;
  format?: number;
  type?: number;
  wrap?: number;
  wrapS?: number;
  wrapT?: number;
  wrapR?: number;
  minLod?: number;
  maxLod?: number;
  baseLevel?: number;
  maxLevel?: number;
  unpackAlignment?: number;
  premultiplyAlpha?: number;
  flipY?: number;
  colorspaceConversion?: number;
  color?: number[] | ArrayBuffer;
  auto?: boolean;
  cubeFaceOrder?: number[];
  src?: FullTextureSrc;
  crossOrigin?: string;
}

export type TextureReadyCallback = (err: any, texture: WebGLTexture, source: TextureSrc) => void;

export type TextureSrc = HTMLImageElement | HTMLImageElement[];

export type TexturesReadyCallback = (
  err: any,
  textures: { [key: string]: WebGLTexture },
  sources: { [key: string]: TextureSrc }
) => void;

export type ThreeDReadyCallback = (err: any, tex: WebGLTexture, imgs: HTMLImageElement[]) => void;

export interface TransformFeedbackInfo {
  index: number;
  type: number;
  size: number;
}

export interface UniformBlockInfo {
  name: string;
  array: ArrayBuffer;
  asFloat: Float32Array;
  buffer: WebGLBuffer;
  offset?: number;
  uniforms: { [key: string]: ArrayBufferView };
}

export interface UniformBlockSpec {
  blockSpecs: { [key: string]: BlockSpec };
  uniformData: UniformData[];
}

export interface UniformData {
  type: number;
  size: number;
  blockNdx: number;
  offset: number;
}

export interface VertexArrayInfo {
  numElements: number;
  elementType: number;
  vertexArrayObject?: WebGLObject;
}

// export function createBufferFromTypedArray(
//   gl: WebGLRenderingContext,
//   typedArray: ArrayBuffer | ArrayBufferView | WebGLBuffer,
//   type?: number,
//   drawType?: number
// ): WebGLBuffer;

// // attributes module
// export function createAttribsFromArrays(gl: WebGLRenderingContext, arrays: Arrays): { [name: string]: AttribInfo };
// export function createBufferFromArray(gl: WebGLRenderingContext, array: ArraySpec, arrayName: string): WebGLBuffer;
// export function createBufferFromTypedArray(
//   gl: WebGLRenderingContext,
//   typedArray: ArrayBuffer | ArrayBufferView | WebGLBuffer,
//   type?: number,
//   drawType?: number
// ): WebGLBuffer;
// export function createBufferInfoFromArrays(gl: WebGLRenderingContext, arrays: Arrays): BufferInfo;
// export function createBuffersFromArrays(gl: WebGLRenderingContext, arrays: Arrays): { [name: string]: WebGLBuffer };
// export function setAttribInfoBufferFromArray(
//   gl: WebGLRenderingContext,
//   attribInfo: AttribInfo,
//   array: ArraySpec,
//   offset?: number
// ): void;
// export function setAttributePrefix(prefix: string): void;

// // draw module
// export function drawBufferInfo(
//   gl: WebGLRenderingContext,
//   bufferInfo: BufferInfo | VertexArrayInfo,
//   type?: number,
//   count?: number,
//   offset?: number
// ): void;
// export function drawObjectList(objectsToDraw: DrawObject[]): void;

// // framebuffers module
// export function bindFramebufferInfo(
//   gl: WebGLRenderingContext,
//   framewbufferInfo?: FramebufferInfo,
//   target?: number
// ): void;
// export function createFramebufferInfo(
//   gl: WebGLRenderingContext,
//   attachments?: AttachmentOptions[],
//   widt?: number,
//   height?: number
// ): FramebufferInfo;
// export function resizeFramebufferInfo(
//   gl: WebGLRenderingContext,
//   framebufferInfo: FramebufferInfo,
//   attachments?: AttachmentOptions[],
//   width?: number,
//   height?: number
// ): void;

export type Mat4 = number[] | Float32Array;
export type Vec3 = number[] | Float32Array;

export type TypedArray =
  | Uint16Array
  | Uint8Array
  | Uint32Array
  | Int32Array
  | Int16Array
  | Int8Array
  | Float32Array
  | Float64Array;
