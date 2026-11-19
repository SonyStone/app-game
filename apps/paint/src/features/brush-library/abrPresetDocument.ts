import { brushFormSchema, formValuesToBrush } from '@app-game/abr-brush/form';
import type { BrushAsset } from '@app-game/abr-brush/library';
import type { BrushResource } from '@app-game/abr-paint/resources';
import type { Coverage } from '@app-game/paint-core/paintbrush/asset';
import { brushSchema, parseDocument } from '@app-game/paint-core/paintbrush/document';
import { abrDocument, resolveAbr } from './abrDocument';
import { hostExtension, hostSettings } from './abrHost';
import type { BrushPreset } from './brushPresets';

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
  const prepared = await resolveAbr(document, assets);
  const { engine, size, spacing, color, backgroundColor, opacity, flow, stroke, mixing } = prepared;
  const defaults = Object.fromEntries(
    Object.entries({
      engine,
      tool: 'brush',
      size,
      spacing,
      color,
      backgroundColor,
      opacity,
      flow,
      stroke,
      mixing
    }).filter(([, value]) => value !== undefined)
  ) as BrushPreset['settings'];
  const host = document.definition.extensions?.[hostExtension];
  const settings = host ? { ...hostSettings.parse(host.value), engine } : defaults;
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
export function resolveAbrText(text: string, images: readonly BrushResource[]) {
  return resolveAbr(parseDocument(text, brushSchema), coverageMap(images));
}

/** Reads coverage by digest for the ABR document resolver. */
export function coverageMap(images: readonly BrushResource[]) {
  return new Map(images.map((image) => [image.id, image]));
}
