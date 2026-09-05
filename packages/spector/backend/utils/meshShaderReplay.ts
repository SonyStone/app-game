import type { ICommandCapture } from '../../shared/capture/commandCapture';

type ResolveObject = (typeName: string, id: number) => object | undefined;

/** Positions produced by replaying the captured vertex shader with rasterization disabled. */
export type MeshShaderReplayResult =
  | {
      readonly status: 'available';
      readonly values: readonly number[];
      readonly clipValues: readonly number[];
      readonly space: 'world' | 'view' | 'clip';
      readonly inverseMatrixName?: string;
      readonly projectionMatrix?: readonly number[];
    }
  | { readonly status: 'unavailable'; readonly reason: string };

/** Restricts matrix recovery when several draws must share one camera-relative space. */
export interface MeshShaderReplayOptions {
  readonly requireSharedViewSpace?: boolean;
  /** Require a captured camera view matrix so draws share one world coordinate system. */
  readonly requireWorldSpace?: boolean;
}

/** Replays a bounded vertex range and reads its final `gl_Position` through transform feedback. */
export function replayMeshVertexShader(
  gl: WebGL2RenderingContext,
  command: ICommandCapture,
  resolveObject: ResolveObject,
  firstVertex: number,
  vertexCount: number,
  options: MeshShaderReplayOptions = {}
): MeshShaderReplayResult {
  if (gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE)) {
    return unavailable('Vertex replay is unavailable while application transform feedback is active.');
  }

  const drawCall = asRecord(command.DrawCall);
  const vertexSource = readVertexSource(drawCall);
  if (!vertexSource) return unavailable('The captured vertex shader source is unavailable.');
  if (!Array.isArray(drawCall.attributes)) return unavailable('The captured vertex attributes are unavailable.');

  try {
    const clipPositions = captureClipPositions(gl, vertexSource, drawCall, resolveObject, firstVertex, vertexCount);
    const inverseMatrix = findClipTransformInverse(
      vertexSource,
      drawCall.uniforms,
      options.requireSharedViewSpace ? 'shared-view' : 'any'
    );
    if (options.requireSharedViewSpace && !inverseMatrix) {
      return unavailable('No shared projection matrix was found for this draw.');
    }
    const viewInverse = inverseMatrix ? findViewTransformInverse(drawCall.uniforms) : undefined;
    if (options.requireWorldSpace && !viewInverse) {
      return unavailable('No shared camera view matrix was found for this draw.');
    }
    const viewPositions = transformClipPositions(clipPositions, inverseMatrix?.value);
    return {
      status: 'available',
      values: viewInverse ? transformPositions(viewPositions, viewInverse.value) : viewPositions,
      clipValues: Array.from(clipPositions),
      space: viewInverse ? 'world' : inverseMatrix ? 'view' : 'clip',
      inverseMatrixName: inverseMatrix?.name,
      projectionMatrix: inverseMatrix?.matrix
    };
  } catch (error: unknown) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Finds and inverts a camera-only view matrix shared by all scene draws. */
export function findViewTransformInverse(uniformsValue: unknown): MatrixInverse | undefined {
  if (!Array.isArray(uniformsValue)) return undefined;
  const matrices = uniformsValue.flatMap((value) => {
    const uniform = asRecord(value);
    const name = typeof uniform.name === 'string' ? uniform.name : '';
    const values = readUniformValues(uniform);
    return uniform.type === 'FLOAT_MAT4' && values.length >= 16
      ? [{ name, normalizedName: normalizeMatrixName(name), value: values.slice(0, 16) }]
      : [];
  });
  const view = matrices.find(
    ({ normalizedName }) =>
      normalizedName.includes('viewmatrix') &&
      !/model|projection|reproject|shadow|light/.test(normalizedName)
  );
  const inverseView = view ? invertMatrix4(view.value) : undefined;
  if (view && inverseView) return { name: view.name, value: inverseView, matrix: view.value };

  const model = matrices.find(({ normalizedName }) => /^u?modelmatrix$/.test(normalizedName));
  const modelView = matrices.find(({ normalizedName }) => /^u?modelviewmatrix$/.test(normalizedName));
  if (!model || !modelView) return undefined;
  const inverseModelView = invertMatrix4(modelView.value);
  const inverseModel = invertMatrix4(model.value);
  if (!inverseModelView || !inverseModel) return undefined;
  return {
    name: `${model.name} * inverse(${modelView.name})`,
    value: multiplyMatrices(model.value, inverseModelView),
    matrix: multiplyMatrices(modelView.value, inverseModel)
  };
}

function normalizeMatrixName(name: string): string {
  return name.replace(/[^a-z]/gi, '').toLowerCase();
}

function captureClipPositions(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  drawCall: Record<string, unknown>,
  resolveObject: ResolveObject,
  firstVertex: number,
  vertexCount: number
): Float32Array<ArrayBuffer> {
  const previous = readReplayState(gl);
  const restorers: Array<() => void> = [];
  let resources: ReplayResources | undefined;
  let feedbackStarted = false;

  try {
    resources = createReplayResources(gl, vertexSource, vertexCount);
    configureAttributes(gl, resources.program, resources.vertexArray, drawCall.attributes, resolveObject);
    gl.useProgram(resources.program);
    applyUniforms(gl, resources.program, drawCall.uniforms);
    bindUniformBlocks(gl, resources.program, drawCall.uniformBlocks, resolveObject, restorers);
    bindTextures(gl, drawCall.uniforms, resolveObject, restorers);
    gl.bindVertexArray(resources.vertexArray);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, resources.transformFeedback);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, resources.outputBuffer);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    feedbackStarted = true;
    gl.drawArrays(gl.POINTS, firstVertex, vertexCount);
    gl.endTransformFeedback();
    feedbackStarted = false;

    const output = new Float32Array(vertexCount * 4);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, resources.outputBuffer);
    gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, output);
    if (!hasMeaningfulClipPosition(output)) {
      throw new Error('Vertex replay produced no usable clip-space positions.');
    }
    return output;
  } finally {
    if (feedbackStarted) gl.endTransformFeedback();
    for (let index = restorers.length - 1; index >= 0; index--) restorers[index]?.();
    restoreReplayState(gl, previous);
    if (resources) deleteReplayResources(gl, resources);
  }
}

interface ReplayState {
  readonly program: WebGLProgram | null;
  readonly vertexArray: WebGLVertexArrayObject | null;
  readonly arrayBuffer: WebGLBuffer | null;
  readonly uniformBuffer: WebGLBuffer | null;
  readonly transformFeedback: WebGLTransformFeedback | null;
  readonly transformFeedbackBuffer: WebGLBuffer | null;
  readonly indexedTransformFeedbackBuffer: WebGLBuffer | null;
  readonly activeTexture: number;
  readonly rasterizerDiscard: boolean;
}

function readReplayState(gl: WebGL2RenderingContext): ReplayState {
  return {
    program: gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null,
    vertexArray: gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null,
    arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null,
    uniformBuffer: gl.getParameter(gl.UNIFORM_BUFFER_BINDING) as WebGLBuffer | null,
    transformFeedback: gl.getParameter(gl.TRANSFORM_FEEDBACK_BINDING) as WebGLTransformFeedback | null,
    transformFeedbackBuffer: gl.getParameter(gl.TRANSFORM_FEEDBACK_BUFFER_BINDING) as WebGLBuffer | null,
    indexedTransformFeedbackBuffer: gl.getIndexedParameter(
      gl.TRANSFORM_FEEDBACK_BUFFER_BINDING,
      0
    ) as WebGLBuffer | null,
    activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE) as number,
    rasterizerDiscard: gl.isEnabled(gl.RASTERIZER_DISCARD)
  };
}

function restoreReplayState(gl: WebGL2RenderingContext, state: ReplayState): void {
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, state.transformFeedback);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, state.indexedTransformFeedbackBuffer);
  gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, state.transformFeedbackBuffer);
  gl.bindVertexArray(state.vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.arrayBuffer);
  gl.bindBuffer(gl.UNIFORM_BUFFER, state.uniformBuffer);
  gl.useProgram(state.program);
  gl.activeTexture(state.activeTexture);
  if (state.rasterizerDiscard) gl.enable(gl.RASTERIZER_DISCARD);
  else gl.disable(gl.RASTERIZER_DISCARD);
}

interface ReplayResources {
  readonly program: WebGLProgram;
  readonly vertexArray: WebGLVertexArrayObject;
  readonly transformFeedback: WebGLTransformFeedback;
  readonly outputBuffer: WebGLBuffer;
}

function createReplayResources(gl: WebGL2RenderingContext, vertexSource: string, vertexCount: number): ReplayResources {
  let vertexShader: WebGLShader | undefined;
  let fragmentShader: WebGLShader | undefined;
  let program: WebGLProgram | undefined;
  let vertexArray: WebGLVertexArrayObject | undefined;
  let transformFeedback: WebGLTransformFeedback | undefined;
  let outputBuffer: WebGLBuffer | undefined;
  try {
    vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource(vertexSource));
    program = requireResource(gl.createProgram(), 'program');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.transformFeedbackVaryings(program, ['gl_Position'], gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Vertex replay program failed to link: ${gl.getProgramInfoLog(program) || 'Unknown error.'}`);
    }
    vertexArray = requireResource(gl.createVertexArray(), 'vertex array');
    transformFeedback = requireResource(gl.createTransformFeedback(), 'transform feedback');
    outputBuffer = requireResource(gl.createBuffer(), 'transform-feedback buffer');
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, outputBuffer);
    gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, vertexCount * 4 * Float32Array.BYTES_PER_ELEMENT, gl.STREAM_READ);
    return { program, vertexArray, transformFeedback, outputBuffer };
  } catch (error) {
    if (outputBuffer) gl.deleteBuffer(outputBuffer);
    if (transformFeedback) gl.deleteTransformFeedback(transformFeedback);
    if (vertexArray) gl.deleteVertexArray(vertexArray);
    if (program) gl.deleteProgram(program);
    throw error;
  } finally {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
  }
}

function deleteReplayResources(gl: WebGL2RenderingContext, resources: ReplayResources): void {
  gl.deleteBuffer(resources.outputBuffer);
  gl.deleteTransformFeedback(resources.transformFeedback);
  gl.deleteVertexArray(resources.vertexArray);
  gl.deleteProgram(resources.program);
}

function configureAttributes(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  vertexArray: WebGLVertexArrayObject,
  attributesValue: unknown,
  resolveObject: ResolveObject
): void {
  if (!Array.isArray(attributesValue)) throw new Error('Captured vertex attributes are unavailable.');
  gl.bindVertexArray(vertexArray);

  for (const value of attributesValue) {
    const attribute = asRecord(value);
    const name = typeof attribute.name === 'string' ? attribute.name : '';
    const location = name ? gl.getAttribLocation(program, name) : -1;
    if (location < 0) continue;
    if (attribute.enabled !== true) {
      applyConstantAttribute(gl, location, attribute);
      continue;
    }

    const buffer = resolveTaggedObject(attribute.bufferBinding, 'WebGLBuffer', resolveObject);
    if (!(buffer instanceof WebGLBuffer)) throw new Error(`Vertex replay cannot resolve buffer for ${name}.`);
    const componentType = readGlConstant(gl, attribute.arrayType);
    const dimensions = readInteger(attribute.arraySize);
    if (!componentType || dimensions < 1 || dimensions > 4) {
      throw new Error(`Vertex replay does not support the ${name} attribute layout.`);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    if (attribute.integer === true) {
      gl.vertexAttribIPointer(
        location,
        dimensions,
        componentType,
        readInteger(attribute.stride),
        readInteger(attribute.offsetPointer)
      );
    } else {
      gl.vertexAttribPointer(
        location,
        dimensions,
        componentType,
        attribute.normalized === true,
        readInteger(attribute.stride),
        readInteger(attribute.offsetPointer)
      );
    }
    gl.vertexAttribDivisor(location, readInteger(attribute.divisor));
  }
}

function applyConstantAttribute(
  gl: WebGL2RenderingContext,
  location: number,
  attribute: Record<string, unknown>
): void {
  const values = numberArray(attribute.vertexAttrib, 4);
  if (attribute.integer === true && String(attribute.type).startsWith('UNSIGNED_INT')) {
    gl.vertexAttribI4uiv(location, Uint32Array.from(values));
  } else if (attribute.integer === true) {
    gl.vertexAttribI4iv(location, Int32Array.from(values));
  } else {
    gl.vertexAttrib4fv(location, Float32Array.from(values));
  }
}

function applyUniforms(gl: WebGL2RenderingContext, program: WebGLProgram, uniformsValue: unknown): void {
  if (!Array.isArray(uniformsValue)) return;
  const uniforms = new Map<string, Record<string, unknown>>();
  for (const value of uniformsValue) {
    const uniform = asRecord(value);
    if (typeof uniform.name === 'string') uniforms.set(normalizeUniformName(uniform.name), uniform);
  }

  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let index = 0; index < count; index++) {
    const info = gl.getActiveUniform(program, index);
    if (!info) continue;
    const location = gl.getUniformLocation(program, info.name);
    const captured = uniforms.get(normalizeUniformName(info.name));
    if (!location || !captured) continue;
    const values = readUniformValues(captured);
    if (values.length === 0) continue;
    setUniform(gl, location, String(captured.type || ''), values);
  }
}

function setUniform(
  gl: WebGL2RenderingContext,
  location: WebGLUniformLocation,
  type: string,
  values: readonly number[]
): void {
  const floats = Float32Array.from(values);
  const integers = Int32Array.from(values);
  const unsigned = Uint32Array.from(values);
  if (type === 'FLOAT') gl.uniform1fv(location, floats);
  else if (type === 'FLOAT_VEC2') gl.uniform2fv(location, floats);
  else if (type === 'FLOAT_VEC3') gl.uniform3fv(location, floats);
  else if (type === 'FLOAT_VEC4') gl.uniform4fv(location, floats);
  else if (type === 'INT' || type === 'BOOL' || type.includes('SAMPLER')) gl.uniform1iv(location, integers);
  else if (type === 'INT_VEC2' || type === 'BOOL_VEC2') gl.uniform2iv(location, integers);
  else if (type === 'INT_VEC3' || type === 'BOOL_VEC3') gl.uniform3iv(location, integers);
  else if (type === 'INT_VEC4' || type === 'BOOL_VEC4') gl.uniform4iv(location, integers);
  else if (type === 'UNSIGNED_INT') gl.uniform1uiv(location, unsigned);
  else if (type === 'UNSIGNED_INT_VEC2') gl.uniform2uiv(location, unsigned);
  else if (type === 'UNSIGNED_INT_VEC3') gl.uniform3uiv(location, unsigned);
  else if (type === 'UNSIGNED_INT_VEC4') gl.uniform4uiv(location, unsigned);
  else if (type === 'FLOAT_MAT2') gl.uniformMatrix2fv(location, false, floats);
  else if (type === 'FLOAT_MAT3') gl.uniformMatrix3fv(location, false, floats);
  else if (type === 'FLOAT_MAT4') gl.uniformMatrix4fv(location, false, floats);
  else if (type === 'FLOAT_MAT2x3') gl.uniformMatrix2x3fv(location, false, floats);
  else if (type === 'FLOAT_MAT2x4') gl.uniformMatrix2x4fv(location, false, floats);
  else if (type === 'FLOAT_MAT3x2') gl.uniformMatrix3x2fv(location, false, floats);
  else if (type === 'FLOAT_MAT3x4') gl.uniformMatrix3x4fv(location, false, floats);
  else if (type === 'FLOAT_MAT4x2') gl.uniformMatrix4x2fv(location, false, floats);
  else if (type === 'FLOAT_MAT4x3') gl.uniformMatrix4x3fv(location, false, floats);
}

function bindUniformBlocks(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  blocksValue: unknown,
  resolveObject: ResolveObject,
  restorers: Array<() => void>
): void {
  if (!Array.isArray(blocksValue)) return;
  for (const value of blocksValue) {
    const block = asRecord(value);
    if (typeof block.name !== 'string') continue;
    const blockIndex = gl.getUniformBlockIndex(program, block.name);
    if (blockIndex === gl.INVALID_INDEX) continue;
    const bindingPoint = readInteger(block.bindingPoint);
    const buffer = resolveTaggedObject(block.buffer, 'WebGLBuffer', resolveObject);
    if (!(buffer instanceof WebGLBuffer)) continue;
    const previous = gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, bindingPoint) as WebGLBuffer | null;
    const previousStart = Number(gl.getIndexedParameter(gl.UNIFORM_BUFFER_START, bindingPoint));
    const previousSize = Number(gl.getIndexedParameter(gl.UNIFORM_BUFFER_SIZE, bindingPoint));
    gl.uniformBlockBinding(program, blockIndex, bindingPoint);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, buffer);
    restorers.push(() => {
      if (previous && previousSize > 0) {
        gl.bindBufferRange(gl.UNIFORM_BUFFER, bindingPoint, previous, previousStart, previousSize);
      } else {
        gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, previous);
      }
    });
  }
}

function bindTextures(
  gl: WebGL2RenderingContext,
  uniformsValue: unknown,
  resolveObject: ResolveObject,
  restorers: Array<() => void>
): void {
  if (!Array.isArray(uniformsValue)) return;
  for (const value of uniformsValue) {
    const uniform = asRecord(value);
    const units = readUniformValues(uniform);
    const textures = Array.isArray(uniform.textures) ? uniform.textures : [uniform.texture];
    for (let index = 0; index < textures.length; index++) {
      const textureState = asRecord(textures[index]);
      const unit = units[index] ?? units[0];
      if (!Number.isInteger(unit) || typeof textureState.target !== 'string') continue;
      const texture = resolveTaggedObject(textureState.texture, 'WebGLTexture', resolveObject);
      if (!(texture instanceof WebGLTexture)) continue;
      const target = readGlConstant(gl, textureState.target);
      const binding = TEXTURE_BINDINGS[textureState.target];
      if (!target || !binding) continue;
      gl.activeTexture(gl.TEXTURE0 + unit);
      const previousTexture = gl.getParameter(binding) as WebGLTexture | null;
      const previousSampler = gl.getParameter(gl.SAMPLER_BINDING) as WebGLSampler | null;
      const sampler = resolveTaggedObject(textureState.sampler, 'WebGLSampler', resolveObject);
      gl.bindTexture(target, texture);
      if (sampler instanceof WebGLSampler) gl.bindSampler(unit, sampler);
      restorers.push(() => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(target, previousTexture);
        gl.bindSampler(unit, previousSampler);
      });
    }
  }
}

interface MatrixInverse {
  readonly name: string;
  readonly value: readonly number[];
  readonly matrix: readonly number[];
}

/** Finds and inverts the projection-like matrix feeding `gl_Position`. */
export function findClipTransformInverse(
  vertexSource: string,
  uniformsValue: unknown,
  mode: 'any' | 'shared-view' = 'any'
): MatrixInverse | undefined {
  if (!Array.isArray(uniformsValue)) return undefined;
  const candidates = uniformsValue.flatMap((value) => {
    const uniform = asRecord(value);
    const name = typeof uniform.name === 'string' ? uniform.name : '';
    const values = readUniformValues(uniform);
    if (uniform.type !== 'FLOAT_MAT4' || values.length < 16) return [];
    if (mode === 'shared-view' && !isSharedProjectionMatrix(name, values)) return [];
    const inverse = invertMatrix4(values.slice(0, 16));
    if (!inverse) return [];
    let score = attributeInfluenceScore(name, vertexSource);
    if (/projection|viewprojection|view_projection|mvp/i.test(name)) score += 100;
    if (looksLikeProjectionMatrix(values)) score += 80;
    return [{ name, value: inverse, matrix: values.slice(0, 16), score }];
  });
  return candidates.sort((left, right) => right.score - left.score)[0];
}

function isSharedProjectionMatrix(name: string, values: readonly number[]): boolean {
  const normalizedName = name.replace(/[^a-z]/gi, '').toLowerCase();
  if (/model|world|mvp/.test(normalizedName)) return false;
  if (looksLikeProjectionMatrix(values)) return true;
  return normalizedName.includes('projection') && !normalizedName.includes('view');
}

function attributeInfluenceScore(name: string, source: string): number {
  if (!name) return 0;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(readPositionDependencySource(source)) ? 40 : 0;
}

function readPositionDependencySource(source: string): string {
  const assignments = Array.from(source.matchAll(/(?:\b\w+\s+)?([A-Za-z_]\w*)\s*=\s*([^;]+);/g));
  const dependencies = new Set(['gl_Position']);
  for (let pass = 0; pass <= assignments.length; pass++) {
    let changed = false;
    for (const assignment of assignments) {
      const target = assignment[1];
      const expression = assignment[2] ?? '';
      if (!target || !dependencies.has(target)) continue;
      for (const identifier of expression.match(/[A-Za-z_]\w*/g) ?? []) {
        if (dependencies.has(identifier)) continue;
        dependencies.add(identifier);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return [...dependencies].join(' ');
}

function looksLikeProjectionMatrix(matrix: readonly number[]): boolean {
  return Math.abs(matrix[11] ?? 0) > 0.5 && Math.abs(matrix[15] ?? 0) < 1e-4;
}

/** Converts clip coordinates to a rotatable 3D space, using an inverse clip transform when known. */
export function transformClipPositions(
  clipPositions: Float32Array<ArrayBuffer>,
  inverseMatrix?: readonly number[]
): readonly number[] {
  const values: number[] = [];
  for (let index = 0; index + 3 < clipPositions.length; index += 4) {
    const clip = [
      clipPositions[index] ?? 0,
      clipPositions[index + 1] ?? 0,
      clipPositions[index + 2] ?? 0,
      clipPositions[index + 3] ?? 1
    ];
    const transformed = inverseMatrix ? multiplyMatrixVector(inverseMatrix, clip) : clip;
    const divisor = Math.abs(transformed[3] ?? 0) > 1e-8 ? transformed[3]! : 1;
    values.push(
      finiteOrZero(transformed[0]! / divisor),
      finiteOrZero(transformed[1]! / divisor),
      finiteOrZero(transformed[2]! / divisor)
    );
  }
  return values;
}

/** Applies one homogeneous transform to unpacked XYZ positions. */
export function transformPositions(positions: readonly number[], matrix: readonly number[]): readonly number[] {
  const values: number[] = [];
  for (let index = 0; index + 2 < positions.length; index += 3) {
    const transformed = multiplyMatrixVector(matrix, [
      positions[index] ?? 0,
      positions[index + 1] ?? 0,
      positions[index + 2] ?? 0,
      1
    ]);
    const divisor = Math.abs(transformed[3]) > 1e-8 ? transformed[3] : 1;
    values.push(
      finiteOrZero(transformed[0] / divisor),
      finiteOrZero(transformed[1] / divisor),
      finiteOrZero(transformed[2] / divisor)
    );
  }
  return values;
}

function multiplyMatrixVector(matrix: readonly number[], vector: readonly number[]): [number, number, number, number] {
  return [0, 1, 2, 3].map((row) =>
    [0, 1, 2, 3].reduce((sum, column) => sum + (matrix[column * 4 + row] ?? 0) * (vector[column] ?? 0), 0)
  ) as [number, number, number, number];
}

function multiplyMatrices(left: readonly number[], right: readonly number[]): readonly number[] {
  return Array.from({ length: 16 }, (_, index) => {
    const column = Math.floor(index / 4);
    const row = index % 4;
    return [0, 1, 2, 3].reduce(
      (sum, component) => sum + (left[component * 4 + row] ?? 0) * (right[column * 4 + component] ?? 0),
      0
    );
  });
}

function invertMatrix4(matrix: readonly number[]): readonly number[] | undefined {
  const augmented = Array.from({ length: 4 }, (_, row) => [
    ...Array.from({ length: 4 }, (_, column) => matrix[column * 4 + row] ?? 0),
    ...Array.from({ length: 4 }, (_, column) => (row === column ? 1 : 0))
  ]);

  for (let column = 0; column < 4; column++) {
    let pivot = column;
    for (let row = column + 1; row < 4; row++) {
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(augmented[pivot]![column]!) < 1e-12) return undefined;
    [augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!];
    const divisor = augmented[column]![column]!;
    augmented[column] = augmented[column]!.map((value) => value / divisor);
    for (let row = 0; row < 4; row++) {
      if (row === column) continue;
      const factor = augmented[row]![column]!;
      augmented[row] = augmented[row]!.map((value, index) => value - factor * augmented[column]![index]!);
    }
  }

  return Array.from({ length: 16 }, (_, index) => augmented[index % 4]![4 + Math.floor(index / 4)]!);
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = requireResource(gl.createShader(type), 'shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'Unknown error.';
    gl.deleteShader(shader);
    throw new Error(`Vertex replay shader failed to compile: ${log}`);
  }
  return shader;
}

function fragmentShaderSource(vertexSource: string): string {
  return /^\s*#version\s+300\s+es/m.test(vertexSource)
    ? '#version 300 es\nprecision mediump float; out vec4 color; void main() { color = vec4(0.0); }'
    : 'precision mediump float; void main() { gl_FragColor = vec4(0.0); }';
}

function readVertexSource(drawCall: Record<string, unknown>): string {
  if (!Array.isArray(drawCall.shaders)) return '';
  const shader = drawCall.shaders.find((value) => {
    const candidate = asRecord(value);
    return candidate.shaderType === 'VERTEX_SHADER' && typeof candidate.source === 'string';
  });
  const record = asRecord(shader);
  return typeof record.source === 'string' ? record.source : '';
}

function readUniformValues(uniform: Record<string, unknown>): readonly number[] {
  if (Array.isArray(uniform.values)) {
    return uniform.values.flatMap((entry) => numberArray(asRecord(entry).value));
  }
  return numberArray(uniform.value);
}

function numberArray(value: unknown, minimumLength = 0): number[] {
  const values = Array.isArray(value)
    ? value.flat(Infinity).filter((item): item is number => typeof item === 'number')
    : typeof value === 'number'
      ? [value]
      : [];
  while (values.length < minimumLength) values.push(values.length === 3 ? 1 : 0);
  return values;
}

function resolveTaggedObject(value: unknown, typeName: string, resolveObject: ResolveObject): object | undefined {
  const record = asRecord(value);
  const tag = asRecord(record.__SPECTOR_Object_TAG);
  return tag.typeName === typeName && typeof tag.id === 'number' ? resolveObject(typeName, tag.id) : undefined;
}

function readGlConstant(gl: WebGL2RenderingContext, value: unknown): number | undefined {
  return typeof value === 'string' && typeof (gl as unknown as Record<string, unknown>)[value] === 'number'
    ? ((gl as unknown as Record<string, number>)[value] as number)
    : undefined;
}

function normalizeUniformName(name: string): string {
  return name.replace(/\[0\]$/, '');
}

function readInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function hasMeaningfulClipPosition(values: Float32Array<ArrayBuffer>): boolean {
  for (let index = 0; index + 3 < values.length; index += 4) {
    const point = [values[index], values[index + 1], values[index + 2], values[index + 3]];
    if (point.every((value) => typeof value === 'number' && Number.isFinite(value)) && Math.abs(point[3]!) > 1e-12) {
      return true;
    }
  }
  return false;
}

function requireResource<T>(resource: T | null, name: string): T {
  if (!resource) throw new Error(`Unable to create vertex replay ${name}.`);
  return resource;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function unavailable(reason: string): MeshShaderReplayResult {
  return { status: 'unavailable', reason };
}

const TEXTURE_BINDINGS: Readonly<Record<string, number>> = {
  TEXTURE_2D: 0x8069,
  TEXTURE_CUBE_MAP: 0x8514,
  TEXTURE_3D: 0x806a,
  TEXTURE_2D_ARRAY: 0x8c1d
};
