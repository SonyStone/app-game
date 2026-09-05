import type { ICommandCapture } from '../../shared/capture/commandCapture';
import type { ISceneCapture, ISceneMeshCapture } from '../../shared/capture/sceneCapture';
import type { ITextureCapture } from '../../shared/capture/textureCapture';
import type { WebGLRenderingContexts } from '../types/contextInformation';
import { captureMesh } from './meshCapture';
import { captureTexture } from './textureCapture';

type ResolveObject = (typeName: string, id: number) => object | undefined;

/** Reconstructs a bounded, deduplicated scene from all compatible draw calls in one capture. */
export function captureScene(
  context: WebGLRenderingContexts,
  commands: readonly ICommandCapture[],
  resolveObject: ResolveObject
): ISceneCapture {
  if (!('getBufferSubData' in context)) return { status: 'unavailable', reason: 'Scene capture requires WebGL 2.' };
  const draws = commands.filter(isSceneMeshDraw);
  const drawGroups = groupMaterialDraws(draws);
  const selectedGroups = drawGroups.slice(0, MAX_SCENE_MESHES);
  if (selectedGroups.length === 0) return { status: 'unavailable', reason: 'No buffered draw calls can form a scene.' };

  const meshes: ISceneMeshCapture[] = [];
  const textureCache = new Map<string, Extract<ITextureCapture, { readonly status: 'available' }>>();
  const perMeshLimit = Math.max(
    MIN_SCENE_ELEMENTS_PER_MESH,
    Math.min(MAX_SCENE_ELEMENTS_PER_MESH, Math.floor(MAX_SCENE_ELEMENTS / selectedGroups.length))
  );
  let unreadableDrawCount = 0;
  const unreadableReasons = new Set<string>();
  const uvCommandIds = new Set<number>();
  const colorTextureCandidateCommandIds = new Set<number>();
  const textureFailureCommandIds = new Set<number>();

  for (const group of selectedGroups) {
    const captured = captureFirstReadableMesh(context, group, resolveObject, perMeshLimit);
    if (!captured.mesh) {
      unreadableDrawCount++;
      unreadableReasons.add(captured.reason);
      continue;
    }
    const { command, mesh } = captured.mesh;
    if (mesh.uvs) uvCommandIds.add(command.id);
    const textureCandidate = mesh.uvs ? selectColorTexture(command) : undefined;
    if (textureCandidate) colorTextureCandidateCommandIds.add(command.id);
    let texture: Extract<ITextureCapture, { readonly status: 'available' }> | undefined;
    if (textureCandidate) {
      texture = textureCache.get(textureCandidate.key);
      if (!texture) {
        const result = captureTexture(
          context,
          command,
          textureCandidate.uniformIndex,
          textureCandidate.textureIndex,
          resolveObject,
          { maximumDimension: SCENE_TEXTURE_SIZE, forceOpaque: true }
        );
        if (result.status === 'available') {
          texture = result;
          textureCache.set(textureCandidate.key, result);
        } else {
          textureFailureCommandIds.add(command.id);
        }
      }
    }

    meshes.push({
      mesh,
      texture,
      textureUniformName: texture ? textureCandidate?.uniformName : undefined
    });
  }

  if (meshes.length === 0) return { status: 'unavailable', reason: 'The scene meshes are no longer readable.' };
  const cameraMeshes = selectDominantCameraMeshes(meshes);
  const alternateCameraDrawCount = meshes.length - cameraMeshes.length;
  const limitedDrawCount = Math.max(0, drawGroups.length - selectedGroups.length);
  const sceneMeshes = selectUniqueCapturedMeshes(cameraMeshes);
  return {
    status: 'available',
    meshes: sceneMeshes,
    upAxis: inferSceneUpAxis(draws),
    drawCount: draws.length,
    duplicateDrawCount: draws.length - drawGroups.length + cameraMeshes.length - sceneMeshes.length,
    skippedDrawCount: unreadableDrawCount + alternateCameraDrawCount + limitedDrawCount,
    unreadableDrawCount,
    unreadableReasons: [...unreadableReasons],
    alternateCameraDrawCount,
    limitedDrawCount,
    uvMeshCount: countMatchingMeshes(sceneMeshes, uvCommandIds),
    colorTextureCandidateCount: countMatchingMeshes(sceneMeshes, colorTextureCandidateCommandIds),
    textureFailureCount: countMatchingMeshes(sceneMeshes, textureFailureCommandIds),
    texturedMeshCount: sceneMeshes.filter(({ texture }) => texture).length,
    truncated:
      selectedGroups.length < drawGroups.length ||
      cameraMeshes.length < meshes.length ||
      sceneMeshes.some(({ mesh }) => mesh.truncated)
  };
}

/** Infers the vertical axis for known captured world-space conventions. */
export function inferSceneUpAxis(commands: readonly ICommandCapture[]): 'y' | 'z' {
  return commands.some((command) => {
    const drawCall = asRecord(command.DrawCall);
    if (!/PBR_(?:Opaque|Blend)/i.test(shaderNames(drawCall))) return false;
    const names = new Set(
      Array.isArray(drawCall.uniforms) ? drawCall.uniforms.map((value) => String(asRecord(value).name ?? '')) : []
    );
    return names.has('uModelMatrix') && names.has('uModelViewMatrix');
  })
    ? 'z'
    : 'y';
}

interface MaterialDrawGroup {
  readonly candidates: readonly ICommandCapture[];
}

function captureFirstReadableMesh(
  context: WebGLRenderingContexts,
  group: MaterialDrawGroup,
  resolveObject: ResolveObject,
  elementLimit: number
):
  | { readonly mesh: { readonly command: ICommandCapture; readonly mesh: Extract<ReturnType<typeof captureMesh>, { readonly status: 'available' }> } }
  | { readonly mesh?: undefined; readonly reason: string } {
  let reason = 'No draw in this render-pass group has readable mesh data.';
  for (const command of group.candidates) {
    const mesh = captureMesh(context, command, resolveObject, {
      elementLimit,
      requireSharedViewSpace: true,
      requireWorldSpace: true
    });
    if (mesh.status !== 'available') {
      reason = mesh.reason;
      continue;
    }
    if (mesh.positionSource !== 'vertex-shader' || mesh.positionSpace !== 'world') {
      reason = mesh.replayReason ?? 'The draw could not be recovered in the shared world coordinate system.';
      continue;
    }
    return { mesh: { command, mesh } };
  }
  return { reason };
}

function countMatchingMeshes(meshes: readonly ISceneMeshCapture[], commandIds: ReadonlySet<number>): number {
  return meshes.filter(({ mesh }) => commandIds.has(mesh.commandId)).length;
}

/** Removes repeated render-pass copies after vertex replay and keeps the richest material copy. */
export function selectUniqueCapturedMeshes(meshes: readonly ISceneMeshCapture[]): readonly ISceneMeshCapture[] {
  const selected = new Map<string, ISceneMeshCapture>();
  for (const candidate of meshes) {
    const signature = capturedGeometrySignature(candidate);
    const previous = selected.get(signature);
    if (!previous || capturedMeshScore(candidate) >= capturedMeshScore(previous)) selected.set(signature, candidate);
  }
  return [...selected.values()];
}

function capturedGeometrySignature({ mesh }: ISceneMeshCapture): string {
  return [
    mesh.mode,
    mesh.elementCount,
    mesh.capturedElementCount,
    sampledNumberSignature(mesh.positions),
    sampledNumberSignature(mesh.indices ?? [])
  ].join('|');
}

function sampledNumberSignature(values: readonly number[]): string {
  if (values.length === 0) return '';
  const samples: string[] = [];
  const stride = Math.max(1, Math.floor(values.length / GEOMETRY_SIGNATURE_SAMPLES));
  for (let index = 0; index < values.length && samples.length < GEOMETRY_SIGNATURE_SAMPLES; index += stride) {
    samples.push((values[index] ?? 0).toPrecision(5));
  }
  return `${values.length}:${samples.join(',')}`;
}

function capturedMeshScore(candidate: ISceneMeshCapture): number {
  return Number(candidate.texture !== undefined) * 10 + Number(candidate.mesh.uvs !== undefined);
}

function selectDominantCameraMeshes(meshes: readonly ISceneMeshCapture[]): readonly ISceneMeshCapture[] {
  const groups = new Map<string, { readonly meshes: ISceneMeshCapture[]; weight: number }>();
  for (const mesh of meshes) {
    const signature = projectionSignature(mesh.mesh.projectionMatrix);
    const group = groups.get(signature) ?? { meshes: [], weight: 0 };
    group.meshes.push(mesh);
    group.weight += Math.min(mesh.mesh.capturedElementCount, MAX_CAMERA_DRAW_WEIGHT);
    groups.set(signature, group);
  }
  return [...groups.values()].sort((left, right) => right.weight - left.weight)[0]?.meshes ?? [];
}

function projectionSignature(matrix: readonly number[] | undefined): string {
  return matrix?.map((value) => value.toPrecision(5)).join(',') ?? '';
}

/** Selects one material-rich draw for each geometry and transform signature. */
export function selectUniqueMaterialDraws(commands: readonly ICommandCapture[]): readonly ICommandCapture[] {
  return groupMaterialDraws(commands).map(({ candidates }) => candidates[0]!);
}

function groupMaterialDraws(commands: readonly ICommandCapture[]): readonly MaterialDrawGroup[] {
  const grouped = new Map<string, Array<{ readonly command: ICommandCapture; readonly score: number; readonly order: number }>>();
  commands.forEach((command, order) => {
    const signature = geometrySignature(command);
    const candidates = grouped.get(signature) ?? [];
    candidates.push({ command, score: materialScore(command), order });
    grouped.set(signature, candidates);
  });
  return [...grouped.values()].map((candidates) => ({
    candidates: candidates
      .sort((left, right) => right.score - left.score || right.order - left.order)
      .map(({ command }) => command)
  }));
}

function geometrySignature(command: ICommandCapture): string {
  const drawCall = asRecord(command.DrawCall);
  const positionAttribute = selectPositionAttribute(drawCall.attributes);
  const elementArray = asRecord(drawCall.elementArray);
  return [
    command.name.includes('Elements') ? 'elements' : 'arrays',
    ...Array.from(command.commandArguments).slice(0, 6),
    taggedId(elementArray.arrayBuffer),
    positionAttributeSignature(positionAttribute),
    matrixTransformSignature(drawCall.uniforms)
  ].join('|');
}

function selectPositionAttribute(attributesValue: unknown): Record<string, unknown> {
  if (!Array.isArray(attributesValue)) return {};
  return (
    attributesValue
      .map(asRecord)
      .filter((attribute) => attribute.enabled === true && taggedId(attribute.bufferBinding) !== undefined)
      .sort((left, right) => positionAttributeScore(right) - positionAttributeScore(left))[0] ?? {}
  );
}

function positionAttributeScore(attribute: Record<string, unknown>): number {
  const name = String(attribute.name ?? '');
  const size = readPositiveNumber(attribute.arraySize);
  const location = readPositiveNumber(attribute.location);
  let score = /position|vertex|(^|_)pos($|_)/i.test(name) ? 100 : 0;
  if (/normal|tangent|color|uv|texcoord|weight|joint/i.test(name)) score -= 80;
  if (size === 3) score += 20;
  else if (size === 4) score += 10;
  if (attribute.arrayType === 'FLOAT') score += 10;
  return score + Math.max(0, 8 - location);
}

function positionAttributeSignature(attribute: Record<string, unknown>): string {
  return [
    taggedId(attribute.bufferBinding),
    attribute.arraySize,
    attribute.arrayType,
    attribute.stride,
    attribute.offsetPointer,
    attribute.divisor
  ].join(':');
}

function matrixTransformSignature(uniformsValue: unknown): string {
  if (!Array.isArray(uniformsValue)) return '';
  return uniformsValue
    .flatMap((value) => {
      const uniform = asRecord(value);
      if (uniform.type !== 'FLOAT_MAT4') return [];
      const values = readNumbers(uniform.value ?? uniform.values);
      if (values.length < 16 || looksLikePerspective(values)) return [];
      return [
        values
          .slice(0, 16)
          .map((number) => number.toPrecision(5))
          .join(',')
      ];
    })
    .sort()
    .join(';');
}

function materialScore(command: ICommandCapture): number {
  const drawCall = asRecord(command.DrawCall);
  const shaderText = shaderNames(drawCall);
  let score = /pbr|opaque|material|forward/i.test(shaderText) ? 50 : 0;
  if (/shadow|depth|early/i.test(shaderText)) score -= 80;
  if (!Array.isArray(drawCall.uniforms)) return score;
  for (const value of drawCall.uniforms) {
    const uniform = asRecord(value);
    const name = String(uniform.name ?? '');
    const textures = Array.isArray(uniform.textures) ? uniform.textures : [uniform.texture];
    for (const texture of textures) {
      if (asRecord(texture).target !== 'TEXTURE_2D') continue;
      score += 5 + Math.max(0, colorTextureScore(name));
    }
  }
  return score;
}

interface ColorTextureCandidate {
  readonly key: string;
  readonly uniformIndex: number;
  readonly textureIndex: number;
  readonly uniformName: string;
  readonly score: number;
  readonly nameScore: number;
  readonly formatScore: number;
}

/** Picks a likely base-color map while rejecting ambiguous material inputs. */
export function selectColorTexture(command: ICommandCapture): ColorTextureCandidate | undefined {
  const drawCall = asRecord(command.DrawCall);
  if (!Array.isArray(drawCall.uniforms)) return undefined;
  const shaderColorSamplers = findShaderColorSamplers(drawCall);
  const candidates: ColorTextureCandidate[] = [];
  drawCall.uniforms.forEach((value, uniformIndex) => {
    const uniform = asRecord(value);
    const uniformName = String(uniform.name ?? `Sampler ${uniformIndex}`);
    const textures = Array.isArray(uniform.textures) ? uniform.textures : [uniform.texture];
    textures.forEach((textureValue, textureIndex) => {
      const texture = asRecord(textureValue);
      const textureId = taggedId(texture.texture);
      if (texture.target !== 'TEXTURE_2D' || textureId === undefined) return;
      const width = readPositiveNumber(texture.width);
      const height = readPositiveNumber(texture.height);
      const nameScore = colorTextureScore(uniformName);
      const formatScore = colorTextureFormatScore(texture);
      const shaderScore = shaderColorSamplers.has(uniformName) ? SHADER_COLOR_SAMPLER_SCORE : 0;
      candidates.push({
        key: `WebGLTexture:${textureId}`,
        uniformIndex,
        textureIndex,
        uniformName,
        score: shaderScore + nameScore + formatScore + Math.log2(Math.max(1, width * height)),
        nameScore,
        formatScore
      });
    });
  });
  candidates.sort((left, right) => right.score - left.score);
  const selectedByShader = candidates.find(({ uniformName }) => shaderColorSamplers.has(uniformName));
  if (selectedByShader) return selectedByShader;
  const selectedByName = candidates.find(({ nameScore }) => nameScore >= COLOR_TEXTURE_CONFIDENCE);
  if (selectedByName) return selectedByName;
  const selectedByFormat = candidates.filter(({ formatScore }) => formatScore >= COLOR_TEXTURE_CONFIDENCE);
  if (selectedByFormat.length > 0) return selectedByFormat[0];
  const selected = candidates[0];
  if (!selected || selected.score < 0) return undefined;
  return candidates.length === 1 ? selected : undefined;
}

function findShaderColorSamplers(drawCall: Record<string, unknown>): ReadonlySet<string> {
  if (!Array.isArray(drawCall.shaders)) return new Set();
  const names = new Set<string>();
  for (const shader of drawCall.shaders) {
    const source = String(asRecord(shader).source ?? '');
    for (const pattern of COLOR_TEXTURE_EXPRESSIONS) {
      for (const match of source.matchAll(pattern)) {
        const name = match[1];
        if (name) names.add(name);
      }
    }
  }
  return names;
}

function colorTextureScore(name: string): number {
  if (/^Texture0(?:\[0\])?$/i.test(name)) return 260;
  if (/^Texture(?:1|2|7)(?:\[0\])?$/i.test(name)) return -300;
  if (/base.?color|albedo|diffuse|color.?map|(^|[^a-z])map([^a-z]|$)/i.test(name)) return 220;
  if (/normal|rough|metal|occlusion|shadow|depth|environment|brdf|lut|mask|specular|gloss/i.test(name)) return -300;
  return 0;
}

function colorTextureFormatScore(texture: Record<string, unknown>): number {
  const format = `${String(texture.internalFormat ?? '')} ${String(texture.format ?? '')}`;
  if (/SRGB/i.test(format)) return 180;
  if (/DEPTH|STENCIL|INTEGER|\bRED\b|\bRG\b|LUMINANCE/i.test(format)) return -180;
  return /RGBA|RGB/i.test(format) ? 20 : 0;
}

/** Returns whether a draw is substantial scene geometry rather than a screen-space pass. */
export function isSceneMeshDraw(command: ICommandCapture): boolean {
  if (!DRAW_COMMANDS.has(command.name)) return false;
  const drawCall = asRecord(command.DrawCall);
  if (drawElementCount(command) < MIN_SCENE_DRAW_ELEMENTS) return false;
  if (/post|fullscreen|screen.?quad|blit|tone.?map|fxaa|ssao|bloom|shadow|depth|early.?z/i.test(shaderNames(drawCall))) {
    return false;
  }
  return (
    Array.isArray(drawCall.attributes) &&
    drawCall.attributes.some((value) => taggedId(asRecord(value).bufferBinding) !== undefined)
  );
}

function drawElementCount(command: ICommandCapture): number {
  const args = command.commandArguments;
  if (command.name.includes('drawRangeElements')) return readPositiveNumber(args[3]);
  if (command.name.includes('Elements')) return readPositiveNumber(args[1]);
  return readPositiveNumber(args[2]);
}

function shaderNames(drawCall: Record<string, unknown>): string {
  return Array.isArray(drawCall.shaders)
    ? drawCall.shaders.map((shader) => String(asRecord(shader).name ?? '')).join(' ')
    : '';
}

function taggedId(value: unknown): number | undefined {
  const tag = asRecord(asRecord(value).__SPECTOR_Object_TAG);
  return typeof tag.id === 'number' ? tag.id : undefined;
}

function readNumbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (!Array.isArray(value)) return [];
  return value.flat(Infinity).flatMap((item) => {
    if (typeof item === 'number') return [item];
    const record = asRecord(item);
    return readNumbers(record.value);
  });
}

function looksLikePerspective(matrix: readonly number[]): boolean {
  return Math.abs(matrix[11] ?? 0) > 0.5 && Math.abs(matrix[15] ?? 0) < 1e-4;
}

function readPositiveNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

const DRAW_COMMANDS = new Set([
  'drawArrays',
  'drawArraysInstanced',
  'drawArraysInstancedANGLE',
  'drawElements',
  'drawElementsInstanced',
  'drawElementsInstancedANGLE',
  'drawRangeElements'
]);
const MAX_SCENE_ELEMENTS = 2_000_000;
const MAX_SCENE_ELEMENTS_PER_MESH = 500_000;
const MAX_SCENE_MESHES = 96;
const MIN_SCENE_ELEMENTS_PER_MESH = 20_000;
const MIN_SCENE_DRAW_ELEMENTS = 12;
const COLOR_TEXTURE_CONFIDENCE = 100;
const SHADER_COLOR_SAMPLER_SCORE = 1_000;
const MAX_CAMERA_DRAW_WEIGHT = 100_000;
const GEOMETRY_SIGNATURE_SAMPLES = 96;
const SCENE_TEXTURE_SIZE = 1024;
const COLOR_TEXTURE_EXPRESSIONS = [
  /\b(?:albedo|baseColor|diffuseColor)\s*=\s*[^;]{0,600}?\btexture(?:2D)?\s*\(\s*([A-Za-z_]\w*)/gi,
  /\bgetMaterial(?:Albedo|BaseColor)\b[\s\S]{0,1_200}?\btexture(?:2D)?\s*\(\s*([A-Za-z_]\w*)/gi
] as const;
