import { compatibility } from './compatibility';
import { assetId, decodePng, type Coverage } from './asset';
import { brushSchema, envelopeSchema, manifestSchema, parseDocument, patch } from './document';
import { MiB, readZip, writeZip } from './zip';

/** Keeps opaque future archives byte-for-byte. Known versions retain every unknown file, referenced or otherwise. */
export async function readArchive(bytes: Uint8Array, options: { reportMissingAssets?: boolean } = {}) {
  const files = await readZip(bytes);
  return openFiles(files, () => bytes, options.reportMissingAssets);
}

/** Changes one manifest or brush address, rechecking dependencies before returning the editable result. */
export async function patchArchive(
  archive: Awaited<ReturnType<typeof readArchive>>,
  file: string,
  path: string,
  value: unknown
) {
  if (archive.status !== 'editable') {
    throw new Error(archive.reason);
  }
  const source =
    file === 'manifest.json' ? archive.manifestText : archive.brushes.find((brush) => brush.file === file)?.text;
  if (source === undefined) {
    throw new Error('Unknown JSON document: ' + file);
  }
  const files = new Map(archive.files);
  const bytes = new TextEncoder().encode(patch(source, path, value));
  if (bytes.length > MiB) {
    throw new Error('JSON exceeds size limit: ' + file);
  }
  files.set(file, bytes);
  return openFiles(files, () => writeZip(files));
}

/** Builds a ZIP from retained JSON texts and binary entries. Caller supplies manifest order and local filenames. */
export function writeArchive(
  manifestText: string,
  documents: ReadonlyMap<string, string>,
  entries: ReadonlyMap<string, Uint8Array> = new Map()
) {
  const files = new Map(entries);
  const encoder = new TextEncoder();
  files.set('manifest.json', encoder.encode(manifestText));
  for (const [file, text] of documents) {
    files.set(file, encoder.encode(text));
  }
  return writeZip(files);
}

async function openFiles(files: Map<string, Uint8Array>, original: () => Uint8Array, reportMissingAssets = false) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  function source(file: string) {
    const entry = files.get(file);
    if (!entry) {
      throw new Error('Missing archive entry: ' + file);
    }
    return decoder.decode(entry);
  }
  const manifestText = source('manifest.json');
  const header = parseDocument(manifestText, envelopeSchema);
  if (header.version[0] !== 1 || header.minReader[0] > 1 || (header.minReader[0] === 1 && header.minReader[1] > 0)) {
    return { status: 'unavailable' as const, reason: 'Requires a different Paint brush reader', write: original };
  }
  const manifest = parseDocument(manifestText, manifestSchema);
  const assets = new Map<string, Coverage>();
  const brushes = [];
  const used = new Set<string>();
  let total = 0;
  for (const { file } of manifest.brushes) {
    if (used.has(file)) {
      throw new Error('Duplicate brush file: ' + file);
    }
    used.add(file);
    const text = source(file);
    const view = parseDocument(text, brushSchema);
    const missing: string[] = [];
    let size = 0;
    const distinct = new Set<string>();
    for (const ref of Object.values(view.resources ?? {})) {
      if (ref.format !== 'r8') {
        continue;
      }
      if (!distinct.has(ref.sha256)) {
        size += ref.width * ref.height;
        distinct.add(ref.sha256);
      }
      if (size > 48 * MiB) {
        throw new Error(view.name + ': exceeds brush asset budget');
      }
      let image = assets.get(ref.sha256);
      if (!image) {
        const png = files.get('assets/' + ref.sha256 + '.png');
        if (!png) {
          if (reportMissingAssets) {
            missing.push('Missing asset ' + ref.sha256);
            continue;
          }
          throw new Error(view.name + ': missing asset ' + ref.sha256);
        }
        total += ref.width * ref.height;
        if (total > 256 * MiB) {
          throw new Error('Decoded archive asset limit exceeded');
        }
        image = await decodePng(png, ref);
        if ((await assetId(image)) !== ref.sha256) {
          throw new Error(view.name + ': asset digest mismatch ' + ref.sha256);
        }
        assets.set(ref.sha256, image);
      }
      if (ref.width !== image.width || ref.height !== image.height) {
        throw new Error(view.name + ': incorrect asset dimensions');
      }
    }
    const resolution = missing.length ? { status: 'unavailable' as const, reasons: missing } : compatibility(view);
    brushes.push({ file, text, view, compatibility: resolution });
  }
  return { status: 'editable' as const, manifest, manifestText, brushes, assets, files, write: () => writeZip(files) };
}
