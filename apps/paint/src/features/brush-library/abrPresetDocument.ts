import { brushFormSchema, formValuesToBrush } from '@app-game/abr-brush/form';
import type { BrushAsset } from '@app-game/abr-brush/library';
import type { BrushResource } from '@app-game/abr-paint/resources';
import { assetId, type Coverage } from '@app-game/paint-core/paintbrush/asset';
import { brushSchema, parseDocument } from '@app-game/paint-core/paintbrush/document';
import { abrDocument } from './abrDocument';
import { syncAbrPreset } from './abrHost';
import type { BrushPreset } from './brushPresets';
import { nativePresetText } from './nativeDocument';
import { resolveDocument } from './resolveDocument';

/** Converts viewer input, folding any saved descriptor edits into the retained document. */
export async function convertAbr(asset: BrushAsset, saved?: BrushPreset['settings']) {
  if (saved?.engine?.id === 'abr') {
    const values = brushFormSchema.parse((saved.engine.settings as { values: unknown }).values);
    asset = formValuesToBrush(asset, values);
  }
  const { document, assets } = await abrDocument(asset, saved);
  return prepareDocument(JSON.stringify(document), assets);
}

/** Separates active GPU resources from all coverage needed to edit and export this document. */
export async function prepareDocument(text: string, assets: ReadonlyMap<string, Coverage>) {
  const document = parseDocument(text, brushSchema);
  const resolved = await resolveDocument(document, assets);
  if (!resolved.prepared) {
    throw new Error(resolved.reasons.join(', '));
  }
  const { prepared, settings } = resolved;
  const images = new Map(prepared.resources.map((r) => [r.id, r]));
  const assetIds = [...new Set(Object.values(document.resources ?? {}).map((ref) => ref.sha256))];
  for (const id of assetIds) {
    const image = assets.get(id);
    if (!image) {
      throw new Error('Missing brush asset: ' + id);
    }
    images.set(id, { ...image, id, format: 'r8unorm' });
  }
  return {
    preset: {
      name: document.name,
      settings,
      abrDocument: text,
      assetIds,
      resourceIds: prepared.resources.map((r) => r.id)
    },
    resources: [...images.values()]
  };
}

/** Resolves an edited document against the coverage loaded from the library. */
export async function resolveAbrText(text: string, images: readonly BrushResource[]) {
  const resolved = await resolveDocument(parseDocument(text, brushSchema), coverageMap(images));
  if (!resolved.prepared) {
    throw new Error(resolved.reasons.join(', '));
  }
  return resolved.prepared;
}

/**
 * Resolves a stored document edit of any brush: the engine it draws with, absent for Paint's round renderer, and the
 * images the ABR renderer needs.
 */
export async function resolveDraft(text: string, images: readonly BrushResource[]) {
  const {
    settings,
    resources = [],
    reasons
  } = await resolveDocument(parseDocument(text, brushSchema), coverageMap(images));
  if (!settings) {
    throw new Error(reasons.join(', '));
  }
  return { engine: settings.engine, resources };
}

/** Reads coverage by digest for the ABR document resolver. */
export function coverageMap(images: readonly BrushResource[]) {
  return new Map(images.map((image) => [image.id, image]));
}

/** Converts legacy sampled coverage to an archive resource while retaining the preset's included host groups. */
export async function convertSampled(preset: BrushPreset, images: readonly BrushResource[]) {
  const tipId = (preset.settings.engine?.settings as { tipId?: string } | undefined)?.tipId;
  const image = images.find((candidate) => candidate.id === tipId);
  if (!image) {
    throw new Error('Missing native tip: ' + tipId);
  }
  return prepareSampledPreset(preset, image);
}

/** Creates a single sampled-tip document from Paint host settings and decoded coverage. */
export async function prepareSampledPreset(preset: BrushPreset, image: BrushResource) {
  const sha256 = await assetId(image);
  const text = nativePresetText(preset, { tip: { format: 'r8', width: image.width, height: image.height, sha256 } });
  const item = await prepareDocument(text, new Map([[sha256, image]]));
  const { settings, resourceIds, assetIds } = item.preset;
  const synced = syncAbrPreset(
    { ...preset, abrDocument: text, settings: { ...preset.settings, engine: settings.engine } },
    true
  );
  return {
    preset: { abrDocument: synced.abrDocument, settings: synced.settings, resourceIds, assetIds },
    resources: item.resources
  };
}
