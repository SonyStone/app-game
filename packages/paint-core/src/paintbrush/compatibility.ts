import type { BrushDocument } from './document';

/** Differences are descriptive only. An adapter must opt in before drawing any approximation. */
export type Compatibility = { status: 'supported' | 'approximate' | 'unavailable'; reasons: string[] };

/** Format-level compatibility with version one. A renderer can impose further limits. */
export function compatibility(doc: BrushDocument, knownExtensions: readonly string[] = []): Compatibility {
  const d = doc.definition;
  if (d.tool !== 'brush' && d.tool !== 'eraser') {
    return { status: 'unavailable', reasons: ['Unknown marking tool: ' + d.tool] };
  }
  const reasons: string[] = [];
  for (const [key, value] of Object.entries(d)) {
    if (
      !sections.has(key) &&
      !(typeof value === 'object' && value && 'impact' in value && value.impact === 'metadata')
    ) {
      reasons.push('Unknown definition section: ' + key);
    }
  }
  for (const [id, ext] of Object.entries(d.extensions ?? {})) {
    if (ext.impact !== 'metadata' && !knownExtensions.includes(id)) {
      reasons.push('Unsupported extension: ' + id);
    }
  }
  for (const mapping of doc.origin?.mappings ?? []) {
    if (mapping.outcome !== 'exact') {
      reasons.push(mapping.field + ': ' + (mapping.reason ?? mapping.outcome));
    }
  }
  for (const [key, tip] of Object.entries(d.tips)) {
    if (!['round', 'ellipse', 'sampled'].includes(tip.kind)) {
      reasons.push('Unknown tip ' + key + ': ' + tip.kind);
    }
  }
  for (const binding of d.dynamics ?? []) {
    if (
      !['pressure', 'speed', 'tilt', 'direction', 'distance', 'random'].includes(binding.input) ||
      binding.op !== 'multiply'
    ) {
      reasons.push('Unsupported binding: ' + binding.input + ' ' + binding.op + ' ' + binding.target);
    }
  }
  for (const [value, choices] of [
    [d.sequence.order, ['cycle', 'random']],
    [d.placement?.law, ['paint-distance-v1', 'photoshop-v1']],
    [d.placement?.overlap, ['accumulate']],
    [d.texture?.frame, ['document']],
    [d.texture?.blend, ['photoshop-height-v1']],
    [d.dual?.blend, ['multiply']],
    [d.mixing, ['linear', 'classic']],
    [d.stroke?.smoothing, ['studio', 'none', 'normal', 'smooth', 'stabilizer']]
  ] as const) {
    if (value && !(choices as readonly string[]).includes(value)) {
      reasons.push('Unknown value: ' + value);
    }
  }
  return { status: reasons.length ? 'approximate' : 'supported', reasons };
}

const sections = new Set([
  'tool',
  'tips',
  'sequence',
  'placement',
  'size',
  'transfer',
  'dynamics',
  'texture',
  'dual',
  'stroke',
  'mixing',
  'renderHints',
  'extensions'
]);
