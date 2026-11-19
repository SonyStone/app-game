import type { AbrBrushSettings } from '@app-game/abr-paint/engine';
import { brushSchema, parseDocument, patch } from '@app-game/paint-core/paintbrush/document';
import { z } from 'zod';
import type { BrushPreset } from './brushPresets';

/** Paint's included setting groups can override the Photoshop tool defaults independently. */
export const hostExtension = 'paint.abr-host.v1';
export const hostSettings = z
  .strictObject({
    size: z.number().positive(),
    spacing: z.number().positive(),
    hardness: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
    flow: z.number().min(0).max(1),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    pressureSize: z.boolean(),
    pressureFlow: z.boolean(),
    tool: z.enum(['brush', 'eraser']),
    mixing: z.enum(['linear', 'classic']),
    stroke: z.strictObject({
      mode: z.enum(['none', 'studio', 'normal', 'smooth', 'stabilizer']),
      normal: z.number().int().min(0).max(49),
      smooth: z.number().int().min(0).max(49),
      stabilizer: z.number().int().min(0).max(22),
      catchUp: z.boolean()
    })
  })
  .partial();

/** Keeps the retained preset identity and the host fields saved by Save / Save As in sync. */
export function syncAbrPreset<T extends BrushPreset>(preset: T, saveHost = false): T {
  let text = preset.abrDocument;
  if (!text) {
    return preset;
  }
  const doc = parseDocument(text, brushSchema);
  for (const key of ['id', 'name', 'derivedFrom'] as const) {
    if (preset[key] !== undefined && doc[key] !== preset[key]) {
      text = patch(text, '/' + key, preset[key]);
    }
  }
  const { engine, ...host } = preset.settings;
  if (saveHost) {
    const ext = { impact: 'tool', value: hostSettings.parse(host) };
    text = doc.definition.extensions
      ? patch(text, '/definition/extensions/' + hostExtension, ext)
      : patch(text, '/definition/extensions', { [hostExtension]: ext });
  }
  if (doc.name !== preset.name && engine?.id === 'abr') {
    const settings = engine.settings as AbrBrushSettings;
    return {
      ...preset,
      abrDocument: text,
      settings: {
        ...host,
        engine: { ...engine, settings: { ...settings, values: { ...settings.values, name: preset.name } } }
      }
    };
  }
  return { ...preset, abrDocument: text };
}
