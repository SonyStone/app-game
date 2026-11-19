import type { BrushResource } from '@app-game/abr-paint/resources';
import { readArchive, writeArchive } from '@app-game/paint-core/paintbrush/archive';
import { assetId, encodePng } from '@app-game/paint-core/paintbrush/asset';
import { brushSchema, parseDocument, patch, patchList, singleManifest } from '@app-game/paint-core/paintbrush/document';
import type { BrushPreset } from './brushPresets';
import type { BrushLibrary } from './createBrushLibrary';
import { nativeDocument, resolveNative } from './nativeDocument';

/** Original single-brush manifest, JSON and binary companions, suitable for IndexedDB structured clone. */
export type RetainedBrush = {
  file: string;
  manifest: string;
  text: string;
  entries: Map<string, Uint8Array>;
  baseline: BrushPreset['settings'];
};

/** Exports saved preset fields. A retained preset changes only at addresses edited since import. */
export async function exportPaintbrush(preset: BrushPreset, images: readonly BrushResource[]) {
  const kept = preset.paintbrush;
  const file = kept?.file ?? 'brushes/brush.json';
  const manifest =
    kept?.manifest ?? JSON.stringify({ format: 'paintbrush', version: [1, 0], minReader: [1, 0], brushes: [{ file }] });
  const entries = new Map(kept?.entries);
  const selected = preset.settings.engine;
  let resources;
  if (selected?.id === 'textured') {
    const tipId = (selected.settings as { tipId: string }).tipId;
    const image = images.find((candidate) => candidate.id === tipId);
    if (!image) {
      throw new Error('Missing native tip: ' + tipId);
    }
    const sha256 = await assetId(image);
    const path = 'assets/' + sha256 + '.png';
    if (!entries.has(path)) {
      entries.set(path, encodePng(image));
    }
    resources = { tip: { format: 'r8', width: image.width, height: image.height, sha256 } };
  }
  const current = nativeDocument(preset, resources);
  let text = JSON.stringify(current);
  if (kept) {
    const original = parseDocument(kept.text, brushSchema);
    const baseline = nativeDocument(
      { ...preset, settings: kept.baseline, id: original.id, name: original.name, derivedFrom: original.derivedFrom },
      resources
    );
    const key = original.definition.sequence.tips[0]!;
    for (const generated of [current, baseline]) {
      const name = generated.definition.sequence.tips[0]!;
      if (key !== name) {
        generated.definition.tips = { [key]: generated.definition.tips[name]! };
        generated.definition.sequence.tips = [key];
      }
    }
    text = kept.text;
    function change(before: unknown, after: unknown, path: string[]) {
      if (after === undefined || JSON.stringify(before) === JSON.stringify(after)) {
        return;
      }
      const target = path.reduce<unknown>(
        (node, key) =>
          node && typeof node === 'object' && Object.hasOwn(node, key)
            ? (node as Record<string, unknown>)[key]
            : undefined,
        original
      );
      if (path.join('/') === 'definition/dynamics' && Array.isArray(target) && Array.isArray(after)) {
        text = patchList(
          text,
          path,
          after.map((binding) => {
            const keep = target.findIndex((previous) => previous.target === binding.target);
            return keep >= 0 ? { keep } : { add: binding };
          })
        );
        return;
      }
      if (target && typeof target === 'object' && after && typeof after === 'object' && !Array.isArray(after)) {
        for (const [key, value] of Object.entries(after)) {
          change((before as Record<string, unknown> | undefined)?.[key], value, [...path, key]);
        }
        return;
      }
      text = patch(text, '/' + path.map((key) => key.replace(/~/g, '~0').replace(/\//g, '~1')).join('/'), after);
    }
    change(baseline, current, []);
  }
  return writeArchive(manifest, new Map([[file, text]]), entries);
}

/** Validates before adding any presets. Reports every unsupported brush by name, leaving selection to the user. */
export async function importPaintbrush(bytes: Uint8Array, library: BrushLibrary) {
  const archive = await readArchive(bytes, { reportMissingAssets: true });
  if (archive.status !== 'editable') {
    throw new Error(archive.reason);
  }
  const entries = new Map(archive.files);
  entries.delete('manifest.json');
  for (const { file } of archive.brushes) {
    entries.delete(file);
  }
  // Keep opaque companions even when their ownership is unknown. Known PNGs follow their
  // references in the retained brush and manifest, so a set does not multiply its image bytes per preset.
  const opaqueCompanions = [...entries.keys()].some((path) => {
    const match = /^assets\/([0-9a-f]{64})\.png$/.exec(path);
    return !path.endsWith('/') && (!match || !archive.assets.has(match[1]!));
  });
  // An opaque file can itself reference another image. Keep the whole dependency set in that case.
  for (const digest of opaqueCompanions ? [] : archive.assets.keys()) {
    entries.delete('assets/' + digest + '.png');
  }
  const rejected: string[] = [];
  const accepted = [];
  const manifestFor = singleManifest(archive.manifestText);
  for (const [i, brush] of archive.brushes.entries()) {
    if (brush.compatibility.status === 'unavailable') {
      rejected.push(brush.view.name + ': ' + brush.compatibility.reasons.join(', '));
      continue;
    }
    const result = resolveNative(brush.view);
    if (result.status !== 'supported') {
      rejected.push(brush.view.name + ': ' + result.reasons.join(', '));
      continue;
    }
    const images: BrushResource[] = [];
    if (result.ref) {
      const id = result.ref.sha256;
      const image = archive.assets.get(id)!;
      const engine = result.settings.engine!;
      engine.settings = { ...(engine.settings as object), tipId: id };
      images.push({ ...image, id, format: 'r8unorm' });
    }
    const manifest = manifestFor(i);
    const companions = new Map(entries);
    const retainedJson = JSON.stringify([JSON.parse(brush.text), JSON.parse(manifest)]);
    for (const match of retainedJson.matchAll(/[a-f0-9]{64}/g)) {
      const path = 'assets/' + match[0] + '.png';
      const png = archive.files.get(path);
      if (png) {
        companions.set(path, png);
      }
    }
    const retained: RetainedBrush = {
      file: brush.file,
      text: brush.text,
      manifest,
      entries: companions,
      baseline: result.settings
    };
    accepted.push({
      preset: {
        id: brush.view.id,
        name: brush.view.name,
        settings: result.settings,
        paintbrush: retained,
        derivedFrom: brush.view.derivedFrom,
        resourceIds: images.map((image) => image.id)
      },
      resources: images
    });
  }
  if (accepted.length) {
    await library.addImported(accepted);
  }
  return rejected;
}
