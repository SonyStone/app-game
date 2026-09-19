import { z } from 'zod/v3';
import { abrBrushSettings } from './engine';
import type { prepareAbrBrush } from './preset';

/** Writes one prepared ABR-engine preset as a versioned JSON manifest and decoded coverage bytes.
 * Only validated runtime fields are copied. Original ABR records are never serialized.
 * This preserves the current engine's inputs, not undocumented Photoshop behavior.
 */
export function encodeRuntimeBrush(preset: ReturnType<typeof prepareAbrBrush>): Uint8Array {
  let offset = 0;
  const manifest = manifestSchema.parse({
    format: 'abr-runtime', version: 1,
    name: preset.name, engine: preset.engine,
    color: preset.color, backgroundColor: preset.backgroundColor,
    flow: preset.flow, opacity: preset.opacity,
    size: preset.size, spacing: preset.spacing, angle: preset.angle,
    resources: preset.resources.map((resource) => {
      const entry = { id: resource.id, width: resource.width, height: resource.height,
        format: resource.format, offset, length: resource.pixels.byteLength };
      offset += entry.length;
      return entry;
    })
  });
  validateResources(manifest, offset);
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  if (json.length > MAX_MANIFEST) throw new Error('Runtime brush manifest exceeds 1 MiB.');
  const bytes = new Uint8Array(12 + json.length + offset);
  bytes.set(MAGIC);
  new DataView(bytes.buffer).setUint32(8, json.length, true);
  bytes.set(json, 12);
  for (const [index, resource] of preset.resources.entries())
    bytes.set(resource.pixels, 12 + json.length + manifest.resources[index]!.offset);
  return bytes;
}

/** Loads a .abrbrush without parsing an ABR file. Rejects malformed versions, references and sizes.
 * Returned resources own their bytes and receive fresh IDs to prevent collisions with already loaded presets.
 * Files contain usable brush data; this is a distribution format, not copy protection.
 */
export function decodeRuntimeBrush(bytes: Uint8Array): ReturnType<typeof prepareAbrBrush> {
  if (bytes.length < 12 || bytes.length > 12 + MAX_MANIFEST + MAX_RESOURCES ||
      MAGIC.some((value, index) => bytes[index] !== value)) throw new Error('Invalid runtime brush file.');
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true);
  if (length > MAX_MANIFEST || length > bytes.length - 12) throw new Error('Invalid runtime brush manifest length.');
  const manifest = manifestSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(12, 12 + length))));
  validateResources(manifest, bytes.length - 12 - length);
  const ids = new Map(manifest.resources.map((entry) => [entry.id, crypto.randomUUID()]));
  const resources = manifest.resources.map((entry) => ({
    id: ids.get(entry.id)!, width: entry.width, height: entry.height, format: entry.format,
    pixels: bytes.slice(12 + length + entry.offset, 12 + length + entry.offset + entry.length)
  }));
  const settings = manifest.engine.settings;
  return {
    name: manifest.name, color: manifest.color, backgroundColor: manifest.backgroundColor,
    flow: manifest.flow, opacity: manifest.opacity,
    size: manifest.size, spacing: manifest.spacing, angle: manifest.angle,
    resource: resources.find((entry) => entry.id === ids.get(settings.tipId))!, resources,
    engine: { id: 'abr', settings: { ...settings, tipId: ids.get(settings.tipId)!,
      patternId: settings.patternId ? ids.get(settings.patternId)! : undefined,
      dualId: settings.dualId ? ids.get(settings.dualId)! : undefined } }
  };
}

function validateResources(manifest: z.infer<typeof manifestSchema>, size: number) {
  if (size > MAX_RESOURCES) throw new Error('Runtime brush resources exceed 48 MiB.');
  const ids = new Set<string>();
  let offset = 0;
  for (const entry of manifest.resources) {
    if (ids.has(entry.id) || entry.offset !== offset || entry.length !== entry.width * entry.height)
      throw new Error('Invalid runtime brush coverage layout.');
    ids.add(entry.id);
    offset += entry.length;
  }
  if (offset !== size) throw new Error('Truncated or trailing runtime brush resources.');
  const { tipId, patternId, dualId } = manifest.engine.settings;
  const used = new Set([tipId, patternId, dualId].filter((id): id is string => id !== undefined));
  if (used.size !== ids.size || [...used].some((id) => !ids.has(id)))
    throw new Error('Runtime brush resource references do not match its coverage.');
}

const MAX_MANIFEST = 1024 * 1024;
const MAX_RESOURCES = 48 * 1024 * 1024;
const MAGIC = new TextEncoder().encode('ABRBRUSH');
const color = z.string().regex(/^#[\da-f]{6}$/i).optional();
const manifestSchema = z.object({
  format: z.literal('abr-runtime'), version: z.literal(1),
  name: z.string().min(1).max(4096),
  engine: z.object({ id: z.literal('abr'), settings: abrBrushSettings }).strict(),
  color, backgroundColor: color,
  flow: z.number().finite().min(0).max(1).optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  size: z.number().finite().min(1).max(5000),
  spacing: z.number().finite().min(0.01).max(10),
  angle: z.number().finite().min(-Math.PI).max(Math.PI),
  resources: z.array(z.object({
    id: z.string().min(1).max(512),
    width: z.number().int().min(1).max(8192), height: z.number().int().min(1).max(8192),
    format: z.literal('r8unorm'), offset: z.number().int().min(0).max(MAX_RESOURCES),
    length: z.number().int().min(1).max(32 * 1024 * 1024)
  }).strict()).min(1).max(3)
}).strict();
