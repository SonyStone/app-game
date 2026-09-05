import type { ICapture } from '../shared/capture/capture';
import type { ICommandCapture } from '../shared/capture/commandCapture';
import { isRecord } from './capture-model';

/** One texture image captured from a sampler used by a draw call. */
export interface SpectorTextureAsset {
  readonly id: string;
  readonly commandId: number;
  readonly uniformIndex: number;
  readonly textureIndex: number;
  readonly uniformName: string;
  readonly target: string;
  readonly view?: string;
  readonly src?: string;
  readonly width?: number;
  readonly height?: number;
  readonly format?: string;
  readonly internalFormat?: string;
}

/** Summary of one draw call that can provide an on-demand mesh preview. */
export interface SpectorMeshDraw {
  readonly commandId: number;
  readonly commandName: string;
  readonly marker: string;
  readonly mode: string;
  readonly elementCount: number;
  readonly instanceCount: number;
  readonly attributeCount: number;
}

/** Extracts and deduplicates texture previews already stored in draw-call state. */
export function extractTextureAssets(capture: ICapture): readonly SpectorTextureAsset[] {
  const assets: SpectorTextureAsset[] = [];
  const seenSources = new Set<string>();

  for (const command of capture.commands) {
    if (!isRecord(command.DrawCall) || !Array.isArray(command.DrawCall.uniforms)) continue;
    command.DrawCall.uniforms.forEach((uniform, uniformIndex) => {
      if (!isRecord(uniform)) return;
      const uniformName = typeof uniform.name === 'string' ? uniform.name : `Sampler ${uniformIndex}`;
      const textures = Array.isArray(uniform.textures) ? uniform.textures : [uniform.texture];
      textures.forEach((texture, textureIndex) => {
        for (const asset of readTextureAssets(command.id, uniformIndex, uniformName, textureIndex, texture)) {
          const sourceKey = asset.src ?? asset.id;
          if (seenSources.has(sourceKey)) continue;
          seenSources.add(sourceKey);
          assets.push(asset);
        }
      });
    });
  }

  return assets;
}

/** Returns draw calls with captured vertex attribute state. */
export function extractMeshDraws(capture: ICapture): readonly SpectorMeshDraw[] {
  return capture.commands.flatMap((command) => {
    if (!DRAW_COMMANDS.has(command.name) || !isRecord(command.DrawCall)) return [];
    const attributes = Array.isArray(command.DrawCall.attributes) ? command.DrawCall.attributes : [];
    if (!attributes.some((attribute) => isRecord(attribute) && isRecord(attribute.bufferBinding))) return [];
    return [
      {
        commandId: command.id,
        commandName: command.name,
        marker: command.marker,
        mode: readPrimitiveMode(command),
        elementCount: readElementCount(command),
        instanceCount: readInstanceCount(command),
        attributeCount: attributes.length
      } satisfies SpectorMeshDraw
    ];
  });
}

function readTextureAssets(
  commandId: number,
  uniformIndex: number,
  uniformName: string,
  textureIndex: number,
  value: unknown
): readonly SpectorTextureAsset[] {
  if (!isRecord(value)) return [];
  const width = readOptionalNumber(value.width);
  const height = readOptionalNumber(value.height);
  const format = readOptionalString(value.format);
  const internalFormat = readOptionalString(value.internalFormat);
  const target = readOptionalString(value.target) ?? 'TEXTURE_2D';
  const textureId = readTaggedObjectId(value.texture);
  const visuals = isRecord(value.visual)
    ? Object.entries(value.visual).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].startsWith('data:image/')
      )
    : [];

  if (visuals.length === 0 && textureId === undefined) return [];

  const createAsset = (view: string | undefined, src: string | undefined): SpectorTextureAsset => ({
    id: `${textureId ?? commandId}:${uniformIndex}:${textureIndex}:${view ?? target}`,
    commandId,
    uniformIndex,
    textureIndex,
    uniformName,
    target,
    ...(view === undefined ? {} : { view }),
    ...(src === undefined ? {} : { src }),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(format === undefined ? {} : { format }),
    ...(internalFormat === undefined ? {} : { internalFormat })
  });

  return visuals.length > 0
    ? visuals.map(([view, src]) => createAsset(view, src))
    : [createAsset(undefined, undefined)];
}

function readTaggedObjectId(value: unknown): number | undefined {
  if (!isRecord(value) || !isRecord(value.__SPECTOR_Object_TAG)) return undefined;
  const id = value.__SPECTOR_Object_TAG.id;
  return typeof id === 'number' ? id : undefined;
}

function readPrimitiveMode(command: ICommandCapture): string {
  const mode = Number(command.commandArguments[0]);
  return PRIMITIVE_MODES.get(mode) ?? String(command.commandArguments[0] ?? 'Unknown');
}

function readElementCount(command: ICommandCapture): number {
  if (command.name.includes('drawRangeElements')) return readPositiveInteger(command.commandArguments[3]);
  return readPositiveInteger(
    command.name.includes('Arrays') ? command.commandArguments[2] : command.commandArguments[1]
  );
}

function readInstanceCount(command: ICommandCapture): number {
  if (!command.name.toLowerCase().includes('instanced')) return 1;
  return readPositiveInteger(command.commandArguments[4] ?? command.commandArguments[3]);
}

function readPositiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
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

const PRIMITIVE_MODES = new Map<number, string>([
  [0, 'POINTS'],
  [1, 'LINES'],
  [2, 'LINE_LOOP'],
  [3, 'LINE_STRIP'],
  [4, 'TRIANGLES'],
  [5, 'TRIANGLE_STRIP'],
  [6, 'TRIANGLE_FAN']
]);
