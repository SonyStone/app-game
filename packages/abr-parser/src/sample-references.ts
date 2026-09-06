import type { DescriptorValue } from './types';

/** Collect primary and nested sample dependencies without relying on preset order. */
export function sampleReferences(descriptor: Record<string, DescriptorValue>): Set<string> {
  const result = new Set<string>();
  const visit = (key: string, value: DescriptorValue): void => {
    if (key === 'sampledData' && value.type === 'TEXT') result.add(value.value);
    if (value.type === 'Objc' || value.type === 'GlbO') {
      for (const [name, child] of Object.entries(value.value)) visit(name, child);
    } else if (value.type === 'VlLs') {
      for (const child of value.value) visit('', child);
    }
  };
  for (const [key, value] of Object.entries(descriptor)) visit(key, value);
  return result;
}
