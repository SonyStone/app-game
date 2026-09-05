import type { ICommandCapture } from '../../shared/capture/commandCapture';
import type { ITextureCapture } from '../../shared/capture/textureCapture';
import type { WebGLRenderingContexts } from '../types/contextInformation';

type ResolveObject = (typeName: string, id: number) => object | undefined;

/** Controls the decoded image size returned for a live texture. */
export interface TextureCaptureOptions {
  readonly maximumDimension?: number;
  /** Preserve RGB from material maps whose unused alpha channel is zero. */
  readonly forceOpaque?: boolean;
}

/** Samples a live texture through WebGL so compressed source formats can be previewed as RGBA. */
export function captureTexture(
  context: WebGLRenderingContexts,
  command: ICommandCapture,
  uniformIndex: number,
  textureIndex: number,
  resolveObject: ResolveObject,
  options: TextureCaptureOptions = {}
): ITextureCapture {
  if (!('createVertexArray' in context)) {
    return unavailable(command.id, uniformIndex, textureIndex, 'Live compressed-texture previews require WebGL 2.');
  }
  const textureState = readTextureState(command, uniformIndex, textureIndex);
  if (!textureState) return unavailable(command.id, uniformIndex, textureIndex, 'The sampler binding is unavailable.');
  const target = typeof textureState.target === 'string' ? textureState.target : 'TEXTURE_2D';
  const texture = resolveTaggedObject(textureState.texture, 'WebGLTexture', resolveObject);
  if (!(texture instanceof WebGLTexture)) {
    return unavailable(command.id, uniformIndex, textureIndex, 'The live texture object is no longer available.');
  }

  try {
    const gl = context as WebGL2RenderingContext;
    const size = previewSize(textureState, options.maximumDimension ?? TEXTURE_PREVIEW_SIZE);
    return {
      status: 'available',
      commandId: command.id,
      uniformIndex,
      textureIndex,
      target,
      width: size.width,
      height: size.height,
      src: renderTexturePreview(
        gl,
        texture,
        target,
        size.width,
        size.height,
        isSrgbTexture(textureState),
        options.forceOpaque ?? false
      )
    };
  } catch (error: unknown) {
    return unavailable(command.id, uniformIndex, textureIndex, error instanceof Error ? error.message : String(error));
  }
}

function renderTexturePreview(
  gl: WebGL2RenderingContext,
  source: WebGLTexture,
  targetName: string,
  width: number,
  height: number,
  encodeSrgb: boolean,
  forceOpaque: boolean
): string {
  const target = textureTarget(gl, targetName);
  if (!target) throw new Error(`${targetName} previews are not supported.`);
  const state = saveRenderState(gl, target);
  let resources: PreviewResources | undefined;

  try {
    resources = createPreviewResources(gl, targetName, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);
    gl.useProgram(resources.program);
    gl.bindVertexArray(resources.vertexArray);
    gl.activeTexture(gl.TEXTURE0 + state.previewUnit);
    gl.bindSampler(state.previewUnit, resources.sampler);
    gl.bindTexture(target, source);
    gl.uniform1i(resources.samplerLocation, state.previewUnit);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const pixels = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    if (encodeSrgb) encodeLinearPixelsAsSrgb(pixels);
    if (forceOpaque) forcePixelsOpaque(pixels);
    return pixelsToDataUrl(pixels, width, height);
  } finally {
    if (resources) destroyPreviewResources(gl, resources);
    restoreRenderState(gl, target, state);
  }
}

/** Makes a material-map copy opaque without altering its captured RGB channels. */
export function forcePixelsOpaque(pixels: Uint8ClampedArray): void {
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
}

function isSrgbTexture(state: Record<string, unknown>): boolean {
  return /SRGB/i.test(`${String(state.internalFormat ?? '')} ${String(state.format ?? '')}`);
}

function encodeLinearPixelsAsSrgb(pixels: Uint8ClampedArray): void {
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    pixels[index] = linearByteToSrgb(pixels[index] ?? 0);
    pixels[index + 1] = linearByteToSrgb(pixels[index + 1] ?? 0);
    pixels[index + 2] = linearByteToSrgb(pixels[index + 2] ?? 0);
  }
}

function linearByteToSrgb(value: number): number {
  const linear = value / 255;
  const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

interface PreviewResources {
  readonly framebuffer: WebGLFramebuffer;
  readonly output: WebGLTexture;
  readonly program: WebGLProgram;
  readonly sampler: WebGLSampler;
  readonly samplerLocation: WebGLUniformLocation;
  readonly vertexArray: WebGLVertexArrayObject;
}

function createPreviewResources(
  gl: WebGL2RenderingContext,
  targetName: string,
  width: number,
  height: number
): PreviewResources {
  const framebuffer = gl.createFramebuffer();
  const output = gl.createTexture();
  const sampler = gl.createSampler();
  const vertexArray = gl.createVertexArray();
  let program: WebGLProgram | undefined;
  try {
    if (!framebuffer || !output || !sampler || !vertexArray) {
      throw new Error('Could not allocate texture-preview resources.');
    }

    gl.bindTexture(gl.TEXTURE_2D, output);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Could not create the texture-preview framebuffer.');
    }

    gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

    program = createProgram(gl, targetName);
    const samplerLocation = gl.getUniformLocation(program, 'u_texture');
    if (!samplerLocation) throw new Error('Could not locate the texture-preview sampler.');
    return { framebuffer, output, program, sampler, samplerLocation, vertexArray };
  } catch (error) {
    if (program) gl.deleteProgram(program);
    if (sampler) gl.deleteSampler(sampler);
    if (vertexArray) gl.deleteVertexArray(vertexArray);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    if (output) gl.deleteTexture(output);
    throw error;
  }
}

function createProgram(gl: WebGL2RenderingContext, targetName: string): WebGLProgram {
  let vertex: WebGLShader | undefined;
  let fragment: WebGLShader | undefined;
  let program: WebGLProgram | undefined;
  try {
    vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader(targetName));
    program = gl.createProgram() ?? undefined;
    if (!program) throw new Error('Could not create the texture-preview program.');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Could not link the texture-preview program.');
    }
    return program;
  } catch (error) {
    if (program) gl.deleteProgram(program);
    throw error;
  } finally {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  }
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create a texture-preview shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Could not compile a texture-preview shader.';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function fragmentShader(targetName: string): string {
  if (targetName === 'TEXTURE_CUBE_MAP') {
    return `${FRAGMENT_HEADER}
uniform samplerCube u_texture;
void main() {
  vec2 angle = vec2((v_uv.x * 2.0 - 1.0) * 3.14159265, (0.5 - v_uv.y) * 3.14159265);
  vec3 direction = vec3(cos(angle.y) * sin(angle.x), sin(angle.y), cos(angle.y) * cos(angle.x));
  out_color = texture(u_texture, direction);
}`;
  }
  if (targetName === 'TEXTURE_2D_ARRAY') {
    return `${FRAGMENT_HEADER}
uniform sampler2DArray u_texture;
void main() { out_color = texture(u_texture, vec3(v_uv, 0.0)); }`;
  }
  if (targetName === 'TEXTURE_3D') {
    return `${FRAGMENT_HEADER}
uniform sampler3D u_texture;
void main() { out_color = texture(u_texture, vec3(v_uv, 0.5)); }`;
  }
  return `${FRAGMENT_HEADER}
uniform sampler2D u_texture;
void main() { out_color = texture(u_texture, v_uv); }`;
}

interface SavedRenderState {
  readonly activeTexture: number;
  readonly arrayBuffer: WebGLBuffer | null;
  readonly colorMask: readonly boolean[];
  readonly currentProgram: WebGLProgram | null;
  readonly drawFramebuffer: WebGLFramebuffer | null;
  readonly enabled: ReadonlyMap<number, boolean>;
  readonly packAlignment: number;
  readonly pixelPackBuffer: WebGLBuffer | null;
  readonly preview2dBinding: WebGLTexture | null;
  readonly previewTargetBinding: WebGLTexture | null;
  readonly previewSampler: WebGLSampler | null;
  readonly previewUnit: number;
  readonly readFramebuffer: WebGLFramebuffer | null;
  readonly vertexArray: WebGLVertexArrayObject | null;
  readonly viewport: readonly number[];
}

function saveRenderState(gl: WebGL2RenderingContext, target: number): SavedRenderState {
  const activeTexture = Number(gl.getParameter(gl.ACTIVE_TEXTURE));
  const previewUnit = Number(gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)) - 1;
  gl.activeTexture(gl.TEXTURE0 + previewUnit);
  const preview2dBinding = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
  const previewTargetBinding = gl.getParameter(textureBinding(gl, target)) as WebGLTexture | null;
  const previewSampler = gl.getParameter(gl.SAMPLER_BINDING) as WebGLSampler | null;
  const capabilities = [gl.BLEND, gl.CULL_FACE, gl.DEPTH_TEST, gl.RASTERIZER_DISCARD, gl.SCISSOR_TEST, gl.STENCIL_TEST];
  return {
    activeTexture,
    arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null,
    colorMask: Array.from(gl.getParameter(gl.COLOR_WRITEMASK) as Iterable<boolean>),
    currentProgram: gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null,
    drawFramebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
    enabled: new Map(capabilities.map((capability) => [capability, gl.isEnabled(capability)])),
    packAlignment: Number(gl.getParameter(gl.PACK_ALIGNMENT)),
    pixelPackBuffer: gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer | null,
    preview2dBinding,
    previewTargetBinding,
    previewSampler,
    previewUnit,
    readFramebuffer: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
    vertexArray: gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null,
    viewport: Array.from(gl.getParameter(gl.VIEWPORT) as Iterable<number>)
  };
}

function restoreRenderState(gl: WebGL2RenderingContext, target: number, state: SavedRenderState): void {
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, state.drawFramebuffer);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, state.readFramebuffer);
  gl.useProgram(state.currentProgram);
  gl.bindVertexArray(state.vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.arrayBuffer);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, state.pixelPackBuffer);
  gl.pixelStorei(gl.PACK_ALIGNMENT, state.packAlignment);
  gl.viewport(state.viewport[0] ?? 0, state.viewport[1] ?? 0, state.viewport[2] ?? 1, state.viewport[3] ?? 1);
  gl.colorMask(
    state.colorMask[0] ?? true,
    state.colorMask[1] ?? true,
    state.colorMask[2] ?? true,
    state.colorMask[3] ?? true
  );
  for (const [capability, enabled] of state.enabled) enabled ? gl.enable(capability) : gl.disable(capability);
  gl.activeTexture(gl.TEXTURE0 + state.previewUnit);
  gl.bindTexture(gl.TEXTURE_2D, state.preview2dBinding);
  if (target !== gl.TEXTURE_2D) gl.bindTexture(target, state.previewTargetBinding);
  gl.bindSampler(state.previewUnit, state.previewSampler);
  gl.activeTexture(state.activeTexture);
}

function destroyPreviewResources(gl: WebGL2RenderingContext, resources: PreviewResources): void {
  gl.deleteVertexArray(resources.vertexArray);
  gl.deleteProgram(resources.program);
  gl.deleteSampler(resources.sampler);
  gl.deleteFramebuffer(resources.framebuffer);
  gl.deleteTexture(resources.output);
}

function pixelsToDataUrl(pixels: Uint8ClampedArray, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas is required to encode the texture preview.');
  const flipped = context.createImageData(width, height);
  const rowLength = width * 4;
  for (let row = 0; row < height; row++) {
    const sourceOffset = (height - row - 1) * rowLength;
    flipped.data.set(pixels.subarray(sourceOffset, sourceOffset + rowLength), row * rowLength);
  }
  context.putImageData(flipped, 0, 0);
  return canvas.toDataURL('image/png');
}

function previewSize(state: Record<string, unknown>, maximumDimension: number): { readonly width: number; readonly height: number } {
  const limit = Math.max(1, Math.trunc(maximumDimension));
  const sourceWidth = positiveInteger(state.width) || limit;
  const sourceHeight = positiveInteger(state.height) || limit;
  const scale = Math.min(1, limit / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}

function readTextureState(
  command: ICommandCapture,
  uniformIndex: number,
  textureIndex: number
): Record<string, unknown> | undefined {
  if (!isRecord(command.DrawCall) || !Array.isArray(command.DrawCall.uniforms)) return undefined;
  const uniform = command.DrawCall.uniforms[uniformIndex];
  if (!isRecord(uniform)) return undefined;
  const value = Array.isArray(uniform.textures) ? uniform.textures[textureIndex] : uniform.texture;
  return isRecord(value) ? value : undefined;
}

function resolveTaggedObject(value: unknown, typeName: string, resolveObject: ResolveObject): object | undefined {
  if (!isRecord(value) || !isRecord(value.__SPECTOR_Object_TAG)) return undefined;
  const tag = value.__SPECTOR_Object_TAG;
  return tag.typeName === typeName && typeof tag.id === 'number' ? resolveObject(typeName, tag.id) : undefined;
}

function textureTarget(gl: WebGL2RenderingContext, name: string): number | undefined {
  if (name === 'TEXTURE_2D') return gl.TEXTURE_2D;
  if (name === 'TEXTURE_CUBE_MAP') return gl.TEXTURE_CUBE_MAP;
  if (name === 'TEXTURE_2D_ARRAY') return gl.TEXTURE_2D_ARRAY;
  if (name === 'TEXTURE_3D') return gl.TEXTURE_3D;
  return undefined;
}

function textureBinding(gl: WebGL2RenderingContext, target: number): number {
  if (target === gl.TEXTURE_CUBE_MAP) return gl.TEXTURE_BINDING_CUBE_MAP;
  if (target === gl.TEXTURE_2D_ARRAY) return gl.TEXTURE_BINDING_2D_ARRAY;
  if (target === gl.TEXTURE_3D) return gl.TEXTURE_BINDING_3D;
  return gl.TEXTURE_BINDING_2D;
}

function unavailable(commandId: number, uniformIndex: number, textureIndex: number, reason: string): ITextureCapture {
  return { status: 'unavailable', commandId, uniformIndex, textureIndex, reason };
}

function positiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const TEXTURE_PREVIEW_SIZE = 256;

const VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT_HEADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 out_color;`;
