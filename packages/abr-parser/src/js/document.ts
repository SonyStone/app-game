import type { AbrDocument, Brush, ReadableObject, Resource } from '../types.js';
import { copyPortable, projectObject } from './projection.js';
import {
  byteString,
  idText,
  unicodeText,
  type ObjectValue,
  type ResourceInfo,
  type Snapshot,
  type Value
} from './wire.js';

/** Builds a detached readable projection while retaining the original file for writing. */
export function documentFromSnapshot(state: Snapshot, bytes: Uint8Array): AbrDocument {
  const brushes = brushBindings(state).map((b) => ({ ...projectObject(b.object, ''), sourceId: b.sourceId }) as Brush);
  const hierarchy: ReadableObject[] = [];
  const extensions: unknown[] = [];
  for (const d of state.descriptors) {
    if (byteString(d.key) === 'phry') {
      for (const entry of d.descriptor.object.entries.filter((e) => idText(e.key) === 'hierarchy'))
        if ('List' in entry.value) hierarchy.push(...entry.value.List.values.map(hierarchyValue));
    }
    const entries = d.descriptor.object.entries.filter(
      (e) =>
        !(byteString(d.key) === 'desc' && ['Brsh', 'brushes'].includes(idText(e.key))) &&
        !(byteString(d.key) === 'phry' && idText(e.key) === 'hierarchy')
    );
    if (entries.length) extensions.push({ section: d.section, entries: copyPortable(entries) });
  }
  return {
    version: state.version,
    sampleLayout: state.sampleLayout,
    brushes,
    hierarchy,
    resources: state.resources.map(resourceFromWire),
    extensions,
    source: { format: 'photoshop-abr/v1', bytes }
  };
}
/** Stable positional addresses preserve order and distinguish duplicate preset IDs. */
export function brushBindings(
  state: Snapshot
): { section: number; entry: number; item: number; sourceId: string; object: ObjectValue }[] {
  const result = [];
  for (const descriptor of state.descriptors) {
    if (byteString(descriptor.key) !== 'desc') continue;
    for (const [entry, field] of descriptor.descriptor.object.entries.entries()) {
      if (!['Brsh', 'brushes'].includes(idText(field.key)) || !('List' in field.value)) continue;
      for (const [item, value] of field.value.List.values.entries()) {
        if ('Object' in value || 'GlobalObject' in value)
          result.push({
            section: descriptor.section,
            entry,
            item,
            sourceId: `${descriptor.section}/${entry}/${item}`,
            object: 'Object' in value ? value.Object : value.GlobalObject
          });
      }
    }
  }
  return result;
}
function hierarchyValue(value: Value): ReadableObject {
  if (!('Object' in value) && !('GlobalObject' in value))
    return { kind: 'unrecognized', value: copyPortable(value) } as ReadableObject;
  const object = 'Object' in value ? value.Object : value.GlobalObject;
  // Preset root aliases provide name; group identifiers remain in preserved extensions.
  const projected = projectObject(object, '');
  return projected;
}
function resourceFromWire(resource: ResourceInfo): Resource {
  return {
    kind: resource.kind,
    id: byteString(resource.id),
    section: resource.section,
    index: resource.index,
    colorMode: resource.colorMode,
    planes: resource.planes,
    ...(resource.name === undefined ? {} : { name: unicodeText({ units: resource.name }) }),
    ...(resource.colorChannels === undefined ? {} : { colorChannels: resource.colorChannels })
  };
}
