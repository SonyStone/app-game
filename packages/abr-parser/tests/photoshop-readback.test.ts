import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import oracle from '../fixtures/photoshop-readback.json';
import { AbrParser } from '../src/abr-parser';
import type { DescriptorValue } from '../src/types';

/** The expected hashes were produced by Photoshop 26, independently of our reader/writer. */
describe('Photoshop descriptor readback', () => {
  for (const record of oracle.records.filter((record) => record.repository)) {
    it(`matches native typed values in ${record.file}`, () => {
      const bytes = readFileSync(new URL(`../files/${record.file}`, import.meta.url));
      expect(hash(bytes)).toBe(record.sourceSha256);
      const parsed = new AbrParser().parse(bytes);
      expect(parsed.errors).toEqual([]);
      expect(parsed.brushes).toHaveLength(record.brushes);
      expect(parsed.descriptorRoot).toBeDefined();
      expect(hash(JSON.stringify(sorted(objectValues(parsed.descriptorRoot!.value))))).toBe(
        record.nativeDescriptorSha256
      );
    });
  }
});

/** Match the representation exported by Photoshop's typed ActionDescriptor getters. */
function objectValues(entries: Record<string, DescriptorValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, nativeValue(value)]));
}

function nativeValue(value: DescriptorValue): unknown {
  switch (value.type) {
    case 'Objc':
    case 'GlbO':
      return { type: value.type, classId: value.classId, value: objectValues(value.value) };
    case 'VlLs':
      return { type: value.type, value: value.value.map(nativeValue) };
    case 'UntF':
    case 'doub':
      return { ...value, value: floating(value.value) };
    case 'tdta':
      return { ...value, value: Buffer.from(value.value).toString('hex') };
    case 'long':
    case 'bool':
    case 'TEXT':
    case 'enum':
      return value;
    default:
      throw new Error(`Native oracle does not cover ${value.type}`);
  }
}

/** Avoid ExtendScript's lossy decimal formatting, retaining the full binary significand. */
function floating(value: number): number[] {
  if (value === 0) return [1 / value < 0 ? -1 : 1, 0, 0, 0];
  const sign = value < 0 ? -1 : 1;
  value = Math.abs(value);
  let exponent = Math.floor(Math.log(value) / Math.LN2);
  let mantissa = value / Math.pow(2, exponent);
  while (mantissa < 1) {
    exponent--;
    mantissa *= 2;
  }
  while (mantissa >= 2) {
    exponent++;
    mantissa /= 2;
  }
  mantissa *= 2 ** 52;
  return [sign, exponent, Math.floor(mantissa / 2 ** 32), mantissa % 2 ** 32];
}

/** Descriptor entry order is not semantically significant; list order is. */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, sorted(child)])
    );
  return value;
}

function hash(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}
