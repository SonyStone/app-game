import type {
  AbrDocument,
  AbrParser,
  Brush,
  Composition,
  ComputedBrushInput,
  Image,
  Library,
  Plane,
  Resource,
  ResourceSelection,
  ResourceSource
} from '../types.js';
import { descriptorSection, readContainer, snapshot, writeContainer, type Container } from './container.js';
import { brushBindings, documentFromSnapshot } from './document.js';
import { decodeImage, decodePlane, readSample, type EncodedResource } from './images.js';
import { applyObject, equal, record } from './projection.js';
import { identifier, idText, unicode, type ObjectValue, type Value } from './wire.js';
export { degrees, percent, pixels } from '../../wasm/dist/brands.js';

/** JavaScript has no runtime initialization beyond its lazy module import. */
export const initAbr: AbrParser['initAbr'] = async () => {};
/** Parses a modern ABR with exact source bytes and the shared readable descriptor contract. */
export function parseAbr(input: ArrayBuffer | ArrayBufferView): AbrDocument {
  const bytes = inputBytes(input);
  return documentFromSnapshot(snapshot(readContainer(bytes)), bytes.slice());
}
/** Applies field edits transactionally. Structural changes require composeAbr. */
export function writeAbr(document: AbrDocument): Uint8Array {
  portable(document);
  exactKeys(document, ['version', 'sampleLayout', 'brushes', 'hierarchy', 'resources', 'extensions', 'source']);
  const file = sourceFile(document.source),
    state = snapshot(file),
    baseline = documentFromSnapshot(state, document.source.bytes);
  for (const key of ['version', 'sampleLayout', 'hierarchy', 'resources', 'extensions'] as const)
    if (!equal(document[key], baseline[key])) throw new Error(`Changing ${key} is unsupported`);
  const bindings = brushBindings(state);
  if (document.brushes.length !== bindings.length)
    throw new Error('Changing brush count requires explicit reconstruction');
  for (const [i, b] of bindings.entries()) {
    const edited = document.brushes[i]!;
    if (edited.sourceId !== b.sourceId)
      throw new Error('Changing sourceId or brush order requires explicit reconstruction');
    if (equal(edited, baseline.brushes[i])) continue;
    const section = file.sections[b.section]!,
      list = section.object!.entries[b.entry]!.value;
    if (!('List' in list)) throw new Error('Missing brush list');
    const old = list.List.values[b.item]!;
    const updated = applyObject(b.object, edited, '');
    list.List.values[b.item] = 'GlobalObject' in old ? { GlobalObject: updated } : { Object: updated };
    section.changed = true;
  }
  return writeContainer(file);
}
/** Authors the same canonical major-10 computed set as the Rust builder. */
export function createAbr(brushes: readonly ComputedBrushInput[]): AbrDocument {
  const values: Value[] = brushes.map((b) => {
    exactKeys(b, ['name', 'tip']);
    exactKeys(b.tip, ['kind', 'diameter', 'hardness', 'roundness', 'angle', 'spacing', 'spacingEnabled']);
    if (typeof b.name !== 'string' || b.tip.kind !== 'computed' || typeof b.tip.spacingEnabled !== 'boolean')
      throw new Error('Invalid computed brush input');
    const tip = object('computedBrush');
    for (const [field, key, unit, min, max] of [
      ['diameter', 'Dmtr', '#Pxl', 1, 5000],
      ['hardness', 'Hrdn', '#Prc', 0, 100],
      ['roundness', 'Rndn', '#Prc', 1, 100],
      ['angle', 'Angl', '#Ang', -180, 180],
      ['spacing', 'Spcn', '#Prc', 1, 1000]
    ] as const) {
      const n = b.tip[field];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
        throw new Error(`${field} outside authoring range`);
      tip.entries.push({
        key: identifier(key),
        value: { Unit: { unit: [...unit].map((c) => c.charCodeAt(0)), value: n } }
      });
    }
    tip.entries.push({ key: identifier('Intr'), value: { Boolean: Number(b.tip.spacingEnabled) } });
    const preset = object('brushPreset');
    preset.entries.push(
      { key: identifier('Nm  '), value: { Text: unicode(b.name) } },
      { key: identifier('Brsh'), value: { Object: tip } }
    );
    return { Object: preset };
  });
  const empty = (key: string) => ({ signature: '8BIM', key, payload: new Uint8Array(), padding: new Uint8Array() });
  const file: Container = {
    version: 10,
    sampleLayout: 2,
    sections: [
      empty('samp'),
      empty('patt'),
      descriptorSection('desc', listObject('brushes', values)),
      descriptorSection(
        'phry',
        listObject(
          'hierarchy',
          values.map(() => ({ Object: object('preset') }))
        )
      )
    ],
    trailing: new Uint8Array()
  };
  return parseAbr(writeContainer(file));
}
/** Explicit selection, reconstruction and grouping; resources and unrelated sections survive. */
export function composeAbr(composition: Composition): Uint8Array {
  portable(composition);
  exactKeys(composition, ['sources', 'brushes', 'hierarchy']);
  const files = composition.sources.map(sourceFile);
  if (!files.length) throw new Error('Composition requires an ABR source');
  const first = files[0]!;
  if (files.some((f) => f.sampleLayout !== first.sampleLayout))
    throw new Error('Cannot combine different sample layouts');
  const selected: Value[] = composition.brushes.map((b) => {
    exactKeys(b, ['source', 'preset']);
    const file = files[b.source];
    if (!file || !Number.isInteger(b.source)) throw new Error('Invalid selected source');
    const found = brushBindings(snapshot(file)).find((v) => v.sourceId === b.preset.sourceId);
    if (!found) throw new Error('Invalid selected sourceId');
    return { Object: applyObject(found.object, b.preset, '', true) };
  });
  const result: Container = {
    version: Math.max(...files.map((f) => f.version)),
    sampleLayout: first.sampleLayout,
    sections: [],
    trailing: concat(files.map((f) => f.trailing))
  };
  const seen = new Map<string, ResourceSource>();
  for (const file of files)
    for (const section of file.sections) {
      for (const r of section.resources ?? []) {
        const key = section.key + '/' + normalized(r.id),
          previous = seen.get(key);
        if (previous && !equal(previous, r.source)) throw new Error(`Conflicting resource identifier: ${r.id}`);
        seen.set(key, r.source);
      }
      if (section.object) {
        const entries = section.object.entries.filter(
          (e) =>
            !(
              (section.key === 'desc' && ['Brsh', 'brushes'].includes(idText(e.key))) ||
              (section.key === 'phry' && idText(e.key) === 'hierarchy')
            )
        );
        if (!entries.length) continue;
        result.sections.push(descriptorSection(section.key, { ...section.object, entries }));
      } else result.sections.push(section);
    }
  result.sections.push(descriptorSection('desc', listObject('Brsh', selected)));
  if (composition.hierarchy.length) {
    let depth = 0,
      count = 0;
    const hierarchy = composition.hierarchy.map((item) => {
      exactKeys(item, ['kind', 'name', 'uuid']);
      if (!['group', 'groupEnd', 'preset'].includes(item.kind)) throw new Error('Unknown hierarchy marker');
      if (item.kind === 'group') depth++;
      else if (item.kind === 'groupEnd') {
        if (--depth < 0) throw new Error('Unbalanced hierarchy');
      } else count++;
      const node = object(item.kind === 'group' ? 'Grup' : item.kind);
      for (const [field, key] of [
        ['name', 'Nm  '],
        ['uuid', 'uuid']
      ] as const) {
        const value = item[field];
        if (value !== undefined) {
          if (typeof value !== 'string') throw new Error('Invalid hierarchy text');
          node.entries.push({ key: identifier(key), value: { Text: unicode(value) } });
        }
      }
      return { Object: node };
    });
    if (depth || count !== selected.length) throw new Error('Hierarchy must balance and cover every selected preset');
    result.sections.push(descriptorSection('phry', listObject('hierarchy', hierarchy)));
  }
  return writeContainer(result);
}
/** Parses once, sharing primary images by address and bounding total decoded coverage. */
export function readLibrary(input: ArrayBuffer | ArrayBufferView, maxDecodedBytes = 268_435_456): Library {
  budget(maxDecodedBytes, 4294967295);
  const bytes = inputBytes(input),
    file = readContainer(bytes),
    document = documentFromSnapshot(snapshot(file), bytes.slice());
  const resources = document.resources.map((resource) => ({
    resource,
    source: copySource(findResource(file, resource).source)
  }));
  const selections = document.brushes.map((b) => resolveResources(document.resources, b)),
    images: Library['images'][number][] = [],
    errors: string[] = [],
    seen = new Set<string>();
  let remaining = maxDecodedBytes;
  for (const selection of selections) {
    errors.push(...selection.warnings);
    const r = selection.sample;
    if (!r) continue;
    const key = `${r.section}/${r.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const image = decodeImage(findResource(file, r).source, remaining);
      remaining -= image.data.length;
      images.push({ section: r.section, index: r.index, image });
    } catch (e) {
      errors.push(`Sample ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { document, resources, images, selections, errors };
}
/** Resolves current readable references. Duplicate IDs use the last stored matching resource. */
export function resolveResources(resources: readonly Resource[], brush: Brush): ResourceSelection {
  const warnings: string[] = [],
    tip = record(brush.tip === undefined ? {} : brush.tip),
    dual = record(brush.dualBrush === undefined ? {} : brush.dualBrush),
    pattern = record(brush.texture === undefined ? {} : brush.texture),
    dualTip = record(dual.tip === undefined ? {} : dual.tip);
  const sample = (value: Record<string, unknown>) => {
    const id = Object.hasOwn(value, 'identifier') ? value.identifier : value.sampleId;
    if (id === undefined) return undefined;
    if (typeof id !== 'string') throw new Error('Expected resource ID string');
    const found = resources.findLast((r) => r.kind === 'sample' && normalized(r.id) === normalized(id));
    if (!found) warnings.push(`Missing sample: ${id}`);
    return found;
  };
  const primary = sample(tip),
    secondary = dual.enabled === true ? sample(dualTip) : undefined;
  let texture: Resource | undefined;
  if (brush.textureEnabled === true) {
    const id = pattern.identifier,
      name = pattern.name;
    if ((id !== undefined && typeof id !== 'string') || (name !== undefined && typeof name !== 'string'))
      throw new Error('Expected pattern ID/name string');
    texture =
      (typeof id === 'string'
        ? resources.findLast((r) => r.kind === 'pattern' && normalized(r.id) === normalized(id))
        : undefined) ??
      (typeof name === 'string' ? resources.findLast((r) => r.kind === 'pattern' && r.name === name) : undefined);
    if (!texture) warnings.push(`Missing pattern: ${id ?? name ?? 'unspecified'}`);
  }
  return {
    ...(primary ? { sample: primary } : {}),
    ...(secondary ? { dualSample: secondary } : {}),
    ...(texture ? { pattern: texture } : {}),
    warnings
  };
}
/** Copies a single compressed resource, without retaining the enclosing archive buffer. */
export function resourceSource(document: AbrDocument, resource: Resource): ResourceSource {
  return copySource(findResource(sourceFile(document.source), resource).source);
}
/** Decodes one independent encoded resource using the shared normalization contract. */
export function decodeResource(source: ResourceSource, maxDecodedBytes = 268_435_456): Image {
  budget(maxDecodedBytes, 268_435_456);
  exactKeys(source, source.kind === 'sample' ? ['kind', 'layout', 'bytes'] : ['kind', 'mode', 'bytes', 'palette']);
  if (source.kind !== 'sample' && source.kind !== 'pattern') throw new Error('Invalid resource kind');
  return decodeImage(source, maxDecodedBytes);
}
/** Reads a native plane, retaining storage depth and byte order. */
export function readPlane(document: AbrDocument, resource: Resource, slot: number): Plane {
  if (!Number.isInteger(slot) || slot < 0 || slot > 65535) throw new Error('Invalid plane slot');
  assertMember(document, resource);
  const p = findResource(sourceFile(document.source), resource).planes.get(slot);
  if (!p) throw new Error('Missing plane');
  return decodePlane(p);
}
/** Returns an independent sample payload without length or padding. */
export function sampleBytes(document: AbrDocument, resource: Resource): Uint8Array {
  if (resource.kind !== 'sample') throw new Error('Expected a sample');
  assertMember(document, resource);
  return resourceSource(document, resource).bytes;
}
/** Reads a standalone sample's ordinary mask. */
export function readSamplePlane(bytes: Uint8Array, sampleLayout: number): { id: string; plane: Plane } {
  const r = readSample(bytes, sampleLayout),
    p = r.planes.get(55);
  if (!p) throw new Error('Sample mask 55 missing');
  return { id: r.id, plane: decodePlane(p) };
}

function sourceFile(source: AbrDocument['source']): Container {
  exactKeys(source, ['format', 'bytes']);
  if (source.format !== 'photoshop-abr/v1' || !(source.bytes instanceof Uint8Array))
    throw new Error('Missing portable ABR source');
  return readContainer(source.bytes);
}
function assertMember(document: AbrDocument, resource: Resource): void {
  if (
    !document.resources.some(
      (r) =>
        r.kind === resource.kind && r.id === resource.id && r.section === resource.section && r.index === resource.index
    )
  )
    throw new Error('Resource is not part of this document');
}
function findResource(file: Container, r: Resource): EncodedResource {
  if (r.kind !== 'sample' && r.kind !== 'pattern') throw new Error('Invalid resource kind');
  const section = file.sections[r.section];
  if (
    !Number.isInteger(r.section) ||
    !Number.isInteger(r.index) ||
    section?.key !== (r.kind === 'sample' ? 'samp' : 'patt')
  )
    throw new Error('Resource kind/address mismatch');
  const result = section.resources?.[r.index];
  if (!result || result.id !== r.id) throw new Error('Resource identifier mismatch');
  return result;
}
function copySource(s: ResourceSource): ResourceSource {
  return { ...s, bytes: s.bytes.slice(), ...('palette' in s && s.palette ? { palette: s.palette.slice() } : {}) };
}
function normalized(id: string): string {
  return id.replaceAll('\0', '').replace(/[A-Z]/g, (c) => c.toLowerCase());
}
function inputBytes(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  return input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}
function object(kind: string): ObjectValue {
  return { class: { name: unicode(''), id: identifier(kind) }, entries: [] };
}
function listObject(key: string, values: Value[]): ObjectValue {
  const root = object('null');
  root.entries.push({ key: identifier(key), value: { List: { values } } });
  return root;
}
function concat(parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  return bytes;
}
function budget(value: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new RangeError('Invalid image byte budget');
}
function exactKeys(value: object, keys: readonly string[]): void {
  if (!value || Object.keys(value).some((k) => !keys.includes(k))) throw new Error('Unknown object property');
}
function portable(value: unknown, parents = new Set<object>(), depth = 0): void {
  if (depth > 128) throw new Error('Portable document nesting limit');
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol') throw new Error('Nonportable value');
    return;
  }
  if (value instanceof Uint8Array) return;
  if (parents.has(value)) throw new Error('Cyclic document');
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new Error('Expected a portable plain object');
  parents.add(value);
  for (const v of Object.values(value)) portable(v, parents, depth + 1);
  parents.delete(value);
}
