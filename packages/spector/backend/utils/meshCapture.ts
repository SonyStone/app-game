import type { ICommandCapture } from '../../shared/capture/commandCapture';
import type { IMeshCapture } from '../../shared/capture/meshCapture';
import type { WebGLRenderingContexts } from '../types/contextInformation';
import { replayMeshVertexShader } from './meshShaderReplay';

type ResolveObject = (typeName: string, id: number) => object | undefined;

/** Controls the amount and coordinate space of geometry read for one preview. */
export interface MeshCaptureOptions {
  readonly selectedAttributeName?: string;
  readonly elementLimit?: number;
  /** Only invert a projection matrix that yields coordinates shared by every draw. */
  readonly requireSharedViewSpace?: boolean;
  /** Recover positions in a common world coordinate system when the captured view matrix allows it. */
  readonly requireWorldSpace?: boolean;
}

/** Reads bounded mesh geometry, preferring captured vertex-shader output over raw buffer values. */
export function captureMesh(
  context: WebGLRenderingContexts,
  command: ICommandCapture,
  resolveObject: ResolveObject,
  options: MeshCaptureOptions = {}
): IMeshCapture {
  if (!('getBufferSubData' in context)) return unavailable(command, 'Mesh readback requires WebGL 2.');
  if (!isRecord(command.DrawCall) || !Array.isArray(command.DrawCall.attributes)) {
    return unavailable(command, 'This draw call has no captured vertex attributes.');
  }

  const gl = context as WebGL2RenderingContext;
  const attributes = readPositionAttributes(command.DrawCall.attributes, readVertexShaderSource(command.DrawCall));
  const positionCandidates = options.selectedAttributeName
    ? attributes.filter((candidate) => candidate.name === options.selectedAttributeName)
    : attributes;
  if (positionCandidates.length === 0)
    return unavailable(command, 'No enabled position-like vertex attribute was found.');

  try {
    const draw = readDraw(command, options.elementLimit ?? MAX_MESH_ELEMENTS);
    if (!draw) return unavailable(command, 'This draw command is not supported by the mesh preview.');
    const indexResult = draw.indexed
      ? readIndices(gl, command, draw, resolveObject)
      : { indices: null, minimum: draw.first, maximum: draw.first + draw.capturedCount - 1 };
    if ('reason' in indexResult) return unavailable(command, indexResult.reason);
    if (indexResult.maximum < indexResult.minimum) return unavailable(command, 'The draw call contains no vertices.');

    const vertexSpan = indexResult.maximum - indexResult.minimum + 1;
    if (vertexSpan > MAX_MESH_VERTEX_SPAN) {
      return unavailable(
        command,
        `The referenced vertex span exceeds the ${MAX_MESH_VERTEX_SPAN.toLocaleString()} vertex preview limit.`
      );
    }
    const positionRead = readFirstAvailablePositions(
      gl,
      positionCandidates,
      indexResult.minimum,
      vertexSpan,
      resolveObject
    );
    if ('reason' in positionRead) return unavailable(command, positionRead.reason);
    const { attribute, positions } = positionRead;
    const uvs = readUvs(gl, attributes, attribute, indexResult.minimum, vertexSpan, resolveObject);
    const replay = options.selectedAttributeName
      ? { status: 'unavailable' as const, reason: 'A raw vertex attribute was selected.' }
      : replayMeshVertexShader(gl, command, resolveObject, indexResult.minimum, vertexSpan, {
          requireSharedViewSpace: options.requireSharedViewSpace,
          requireWorldSpace: options.requireWorldSpace
        });
    const replayed = replay.status === 'available';

    return {
      status: 'available',
      commandId: command.id,
      mode: draw.mode,
      modeName: PRIMITIVE_MODES.get(draw.mode) ?? `Mode ${draw.mode}`,
      positionAttribute: attribute.name,
      positionSource: replayed ? 'vertex-shader' : 'raw-buffer',
      positionSpace: replayed ? replay.space : 'buffer',
      replayReason: replayed ? undefined : replay.reason,
      inverseMatrixName: replayed ? replay.inverseMatrixName : undefined,
      projectionMatrix: replayed ? replay.projectionMatrix : undefined,
      clipPositions: replayed ? replay.clipValues : undefined,
      availableAttributes: attributes.map((candidate) => ({
        name: candidate.name,
        dimensions: candidate.arraySize,
        type: candidate.arrayType,
        location: candidate.location
      })),
      uvs,
      dimensions: replayed ? 3 : attribute.arraySize,
      positions: replayed ? replay.values : positions.values,
      indices: indexResult.indices?.map((index) => (index < 0 ? -1 : index - indexResult.minimum)) ?? null,
      elementCount: draw.count,
      capturedElementCount: draw.capturedCount,
      instanceCount: draw.instanceCount,
      truncated: draw.capturedCount < draw.count
    };
  } catch (error: unknown) {
    return unavailable(command, error instanceof Error ? error.message : String(error));
  }
}

function readFirstAvailablePositions(
  gl: WebGL2RenderingContext,
  candidates: readonly PositionAttribute[],
  firstVertex: number,
  vertexCount: number,
  resolveObject: ResolveObject
):
  | { readonly attribute: PositionAttribute; readonly positions: { readonly values: number[] } }
  | { readonly reason: string } {
  let reason = 'The position buffer is no longer available.';
  for (const attribute of candidates) {
    const buffer = resolveTaggedObject(attribute.bufferBinding, 'WebGLBuffer', resolveObject);
    if (!(buffer instanceof WebGLBuffer)) continue;
    const positions = readPositions(gl, buffer, attribute, firstVertex, vertexCount);
    if ('reason' in positions) {
      reason = positions.reason;
      continue;
    }
    return { attribute, positions };
  }
  return { reason };
}

interface PositionAttribute {
  readonly name: string;
  readonly location: number;
  readonly arraySize: number;
  readonly arrayType: string;
  readonly normalized: boolean;
  readonly stride: number;
  readonly offset: number;
  readonly bufferBinding: unknown;
}

function readPositionAttributes(values: readonly unknown[], vertexShaderSource: string): readonly PositionAttribute[] {
  return values
    .flatMap((value) => {
      if (!isRecord(value) || value.enabled !== true || !isRecord(value.bufferBinding)) return [];
      const arraySize = readInteger(value.arraySize);
      const arrayType = typeof value.arrayType === 'string' ? value.arrayType : '';
      if (arraySize < 2 || arraySize > 4 || !COMPONENT_TYPES.has(arrayType)) return [];
      const name = typeof value.name === 'string' ? value.name : 'attribute';
      const divisor = readInteger(value.divisor);
      if (divisor > 0) return [];
      const candidate: PositionAttribute & { readonly score: number } = {
        name,
        location: readInteger(value.location),
        arraySize,
        arrayType,
        normalized: value.normalized === true,
        stride: readInteger(value.stride),
        offset: readInteger(value.offsetPointer),
        bufferBinding: value.bufferBinding,
        score: positionAttributeScore(name, arraySize, arrayType, readInteger(value.location), vertexShaderSource)
      };
      return [candidate];
    })
    .sort((left, right) => right.score - left.score);
}

function positionAttributeScore(
  name: string,
  size: number,
  type: string,
  location: number,
  vertexShaderSource: string
): number {
  const normalizedName = name.toLowerCase();
  let score = size === 3 ? 20 : size === 4 ? 10 : 0;
  if (type === 'FLOAT') score += 10;
  if (/position|vertex|(^|_)pos($|_)/.test(normalizedName)) score += 100;
  if (/normal|tangent|color|uv|texcoord|weight|joint/.test(normalizedName)) score -= 50;
  if (attributeInfluencesPosition(name, vertexShaderSource)) score += 100;
  score += Math.max(0, 8 - location);
  return score;
}

function readVertexShaderSource(drawCall: Record<string, unknown>): string {
  if (!Array.isArray(drawCall.shaders)) return '';
  const shader = drawCall.shaders.find((candidate) => isRecord(candidate) && typeof candidate.source === 'string');
  return isRecord(shader) && typeof shader.source === 'string' ? shader.source : '';
}

/** Detects simple data-flow from an attribute into the vertex shader's gl_Position assignment. */
export function attributeInfluencesPosition(attributeName: string, source: string): boolean {
  if (!attributeName || !source) return false;
  const dependencies = new Set([attributeName]);
  const assignments = Array.from(source.matchAll(/(?:\b\w+\s+)?([A-Za-z_]\w*)\s*=\s*([^;]+);/g));

  for (let pass = 0; pass <= assignments.length; pass++) {
    let changed = false;
    for (const assignment of assignments) {
      const target = assignment[1];
      const expression = assignment[2] ?? '';
      if (!target || dependencies.has(target)) continue;
      if (![...dependencies].some((dependency) => containsIdentifier(expression, dependency))) continue;
      dependencies.add(target);
      changed = true;
    }
    if (!changed) break;
  }
  return dependencies.has('gl_Position');
}

function containsIdentifier(source: string, identifier: string): boolean {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`).test(source);
}

type DrawRange =
  | {
      readonly indexed: false;
      readonly mode: number;
      readonly first: number;
      readonly count: number;
      readonly capturedCount: number;
      readonly instanceCount: number;
    }
  | {
      readonly indexed: true;
      readonly mode: number;
      readonly count: number;
      readonly capturedCount: number;
      readonly indexType: number;
      readonly indexOffset: number;
      readonly instanceCount: number;
    };

function readDraw(command: ICommandCapture, elementLimit: number): DrawRange | undefined {
  const args = command.commandArguments;
  const mode = readInteger(args[0]);
  if (command.name.includes('drawRangeElements')) {
    const count = readInteger(args[3]);
    return {
      indexed: true,
      mode,
      count,
      capturedCount: Math.min(count, elementLimit),
      indexType: readInteger(args[4]),
      indexOffset: readInteger(args[5]),
      instanceCount: 1
    };
  }
  if (command.name.includes('Elements')) {
    const count = readInteger(args[1]);
    return {
      indexed: true,
      mode,
      count,
      capturedCount: Math.min(count, elementLimit),
      indexType: readInteger(args[2]),
      indexOffset: readInteger(args[3]),
      instanceCount: command.name.toLowerCase().includes('instanced') ? Math.max(1, readInteger(args[4])) : 1
    };
  }
  if (command.name.includes('Arrays')) {
    const count = readInteger(args[2]);
    return {
      indexed: false,
      mode,
      first: readInteger(args[1]),
      count,
      capturedCount: Math.min(count, elementLimit),
      instanceCount: command.name.toLowerCase().includes('instanced') ? Math.max(1, readInteger(args[3])) : 1
    };
  }
  return undefined;
}

function readIndices(
  gl: WebGL2RenderingContext,
  command: ICommandCapture,
  draw: Extract<DrawRange, { readonly indexed: true }>,
  resolveObject: ResolveObject
): { readonly indices: number[]; readonly minimum: number; readonly maximum: number } | { readonly reason: string } {
  if (!isRecord(command.DrawCall) || !isRecord(command.DrawCall.elementArray)) {
    return { reason: 'The draw call has no captured element-array binding.' };
  }
  const indexBuffer = resolveTaggedObject(command.DrawCall.elementArray.arrayBuffer, 'WebGLBuffer', resolveObject);
  if (!(indexBuffer instanceof WebGLBuffer)) return { reason: 'The index buffer is no longer available.' };
  const IndexArray = INDEX_TYPES.get(draw.indexType);
  if (!IndexArray) return { reason: `Index type ${draw.indexType} is not supported.` };
  const destination = new IndexArray(draw.capturedCount);
  readBuffer(gl, indexBuffer, draw.indexOffset, destination);
  const restartIndex = INDEX_RESTART_VALUES.get(draw.indexType);
  const indices = Array.from(destination, (value) => (value === restartIndex ? -1 : value));
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const index of indices) {
    if (index < 0) continue;
    minimum = Math.min(minimum, index);
    maximum = Math.max(maximum, index);
  }
  return {
    indices,
    minimum: Number.isFinite(minimum) ? minimum : 0,
    maximum: Number.isFinite(maximum) ? maximum : -1
  };
}

function readPositions(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  attribute: PositionAttribute,
  firstVertex: number,
  vertexCount: number
): { readonly values: number[] } | { readonly reason: string } {
  const component = COMPONENT_TYPES.get(attribute.arrayType);
  if (!component) return { reason: `Position type ${attribute.arrayType} is not supported.` };
  const packedStride = component.bytes * attribute.arraySize;
  const stride = attribute.stride || packedStride;
  const sourceOffset = attribute.offset + firstVertex * stride;
  const byteLength = (vertexCount - 1) * stride + packedStride;
  if (byteLength > MAX_MESH_BUFFER_BYTES) {
    return { reason: `The position buffer range exceeds the ${formatBytes(MAX_MESH_BUFFER_BYTES)} preview limit.` };
  }

  const bytes = new Uint8Array(byteLength);
  try {
    readBuffer(gl, buffer, sourceOffset, bytes);
  } catch (error: unknown) {
    return { reason: error instanceof Error ? error.message : String(error) };
  }
  const view = new DataView(bytes.buffer);
  const values: number[] = [];
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    for (let axis = 0; axis < attribute.arraySize; axis++) {
      const offset = vertex * stride + axis * component.bytes;
      const value = normalizeComponent(component.read(view, offset), attribute.arrayType, attribute.normalized);
      values.push(Number.isFinite(value) ? value : 0);
    }
  }
  return { values };
}

function readUvs(
  gl: WebGL2RenderingContext,
  attributes: readonly PositionAttribute[],
  positionAttribute: PositionAttribute,
  firstVertex: number,
  vertexCount: number,
  resolveObject: ResolveObject
) {
  const attribute = attributes
    .filter((candidate) => candidate !== positionAttribute && candidate.arraySize >= 2)
    .map((candidate) => ({ candidate, score: uvAttributeScore(candidate) }))
    .sort((left, right) => right.score - left.score)[0];
  if (!attribute || attribute.score <= 0) return undefined;
  const buffer = resolveTaggedObject(attribute.candidate.bufferBinding, 'WebGLBuffer', resolveObject);
  if (!(buffer instanceof WebGLBuffer)) return undefined;
  const result = readPositions(gl, buffer, attribute.candidate, firstVertex, vertexCount);
  if ('reason' in result) return undefined;
  return {
    attributeName: attribute.candidate.name,
    dimensions: attribute.candidate.arraySize,
    values: result.values
  };
}

function uvAttributeScore(attribute: PositionAttribute): number {
  let score = attribute.arraySize === 2 ? 40 : attribute.arraySize === 3 ? 10 : 0;
  if (/uv|texcoord|texture.?coord/i.test(attribute.name)) score += 100;
  if (/position|vertex|normal|tangent|color|weight|joint/i.test(attribute.name)) score -= 50;
  if (attribute.arrayType === 'FLOAT') score += 10;
  return score;
}

function readBuffer(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  offset: number,
  destination: ArrayBufferView
): void {
  const previous = gl.getParameter(gl.COPY_READ_BUFFER_BINDING) as WebGLBuffer | null;
  try {
    gl.bindBuffer(gl.COPY_READ_BUFFER, buffer);
    const bufferSize = Number(gl.getBufferParameter(gl.COPY_READ_BUFFER, gl.BUFFER_SIZE));
    if (offset < 0 || offset + destination.byteLength > bufferSize)
      throw new Error('The requested mesh data is outside the buffer.');
    gl.getBufferSubData(gl.COPY_READ_BUFFER, offset, destination);
  } finally {
    gl.bindBuffer(gl.COPY_READ_BUFFER, previous);
  }
}

function resolveTaggedObject(value: unknown, typeName: string, resolveObject: ResolveObject): object | undefined {
  if (!isRecord(value) || !isRecord(value.__SPECTOR_Object_TAG)) return undefined;
  const tag = value.__SPECTOR_Object_TAG;
  return tag.typeName === typeName && typeof tag.id === 'number' ? resolveObject(typeName, tag.id) : undefined;
}

function unavailable(command: ICommandCapture, reason: string): IMeshCapture {
  return { status: 'unavailable', commandId: command.id, reason };
}

function normalizeComponent(value: number, type: string, normalized: boolean): number {
  if (!normalized) return value;
  switch (type) {
    case 'BYTE':
      return Math.max(-1, value / 127);
    case 'UNSIGNED_BYTE':
      return value / 255;
    case 'SHORT':
      return Math.max(-1, value / 32767);
    case 'UNSIGNED_SHORT':
      return value / 65535;
    case 'INT':
      return Math.max(-1, value / 2147483647);
    case 'UNSIGNED_INT':
      return value / 4294967295;
    default:
      return value;
  }
}

function readInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatBytes(value: number): string {
  return `${Math.round(value / (1024 * 1024))} MiB`;
}

const MAX_MESH_ELEMENTS = 60_000;
const MAX_MESH_VERTEX_SPAN = 100_000;
const MAX_MESH_BUFFER_BYTES = 4 * 1024 * 1024;

const INDEX_TYPES = new Map<number, Uint8ArrayConstructor | Uint16ArrayConstructor | Uint32ArrayConstructor>([
  [0x1401, Uint8Array],
  [0x1403, Uint16Array],
  [0x1405, Uint32Array]
]);

const INDEX_RESTART_VALUES = new Map<number, number>([
  [0x1401, 0xff],
  [0x1403, 0xffff],
  [0x1405, 0xffffffff]
]);

interface ComponentReader {
  readonly bytes: number;
  read(view: DataView, offset: number): number;
}

const COMPONENT_TYPES = new Map<string, ComponentReader>([
  ['BYTE', { bytes: 1, read: (view, offset) => view.getInt8(offset) }],
  ['UNSIGNED_BYTE', { bytes: 1, read: (view, offset) => view.getUint8(offset) }],
  ['SHORT', { bytes: 2, read: (view, offset) => view.getInt16(offset, true) }],
  ['UNSIGNED_SHORT', { bytes: 2, read: (view, offset) => view.getUint16(offset, true) }],
  ['INT', { bytes: 4, read: (view, offset) => view.getInt32(offset, true) }],
  ['UNSIGNED_INT', { bytes: 4, read: (view, offset) => view.getUint32(offset, true) }],
  ['FLOAT', { bytes: 4, read: (view, offset) => view.getFloat32(offset, true) }]
]);

const PRIMITIVE_MODES = new Map<number, string>([
  [0, 'POINTS'],
  [1, 'LINES'],
  [2, 'LINE_LOOP'],
  [3, 'LINE_STRIP'],
  [4, 'TRIANGLES'],
  [5, 'TRIANGLE_STRIP'],
  [6, 'TRIANGLE_FAN']
]);
