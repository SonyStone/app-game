import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  AbrParser,
  AbrWriter,
  BinaryReader,
  BinaryWriter,
  createAbrFile,
  createBrush,
  createBrushTip,
  DescriptorParser,
  DescriptorSerializer
} from '../src/browser';
import type { DescriptorValue } from '../src/types';
import { abrFiles, FILES_DIR } from './test-helpers';

const uuid = '11111111-1111-1111-1111-111111111111';

describe('Bounded binary input', () => {
  test.each([-1, 1.5, NaN, Infinity, 5])('rejects invalid byte length %s without advancing', (length) => {
    for (const method of ['skip', 'peek', 'readBytes', 'slice', 'subReader'] as const) {
      const reader = new BinaryReader(new Uint8Array(4));
      expect(() => reader[method](length)).toThrow();
      expect(reader.position).toBe(0);
    }
  });

  test('preserves embedded Unicode nulls and rejects truncated strings', () => {
    const writer = new BinaryWriter();
    writer.writeTextValue('a\0b🎨');
    expect(new BinaryReader(writer.toBuffer()).readUnicodeString()).toBe('a\0b🎨');
    expect(() => new BinaryReader(writer.toBuffer().slice(0, -1)).readUnicodeString()).toThrow();
  });

  test.each([
    [5, 2],
    [65535, 2],
    [6, 3]
  ])('reports unsupported container %s.%s', (version, subversion) => {
    const writer = new BinaryWriter();
    writer.writeUInt16BE(version);
    writer.writeUInt16BE(subversion);
    expect(new AbrParser().parse(writer.toBuffer()).errors.join()).toContain('Unsupported ABR version');
  });

  test('reports truncated headers and refuses to export partial data', () => {
    for (let length = 0; length < 4; length++) {
      const file = new AbrParser().parse(new Uint8Array(length));
      expect(file.errors.length).toBeGreaterThan(0);
      expect(() => new AbrWriter().write(file)).toThrow('incompletely parsed');
    }
  });

  test('does not resynchronize on a signature embedded in corrupt data', () => {
    const good = new AbrWriter().write(createAbrFile([createBrush({ name: 'valid' })]));
    const bytes = new Uint8Array(good.length + 1);
    bytes.set(good.subarray(0, 4));
    bytes[4] = 99;
    bytes.set(good.subarray(4), 5);
    const parsed = new AbrParser().parse(bytes);
    expect(parsed.errors.join()).toContain('Invalid resource signature');
    expect(parsed.brushes).toHaveLength(0);
  });

  test('preserves opaque extension resource bytes and exposes their offsets', () => {
    const base = new AbrWriter().write(createAbrFile());
    const writer = new BinaryWriter();
    writer.writeBytes(base);
    writer.writeString('8BIMtest');
    writer.writeUInt32BE(3);
    writer.writeBytes(new Uint8Array([1, 2, 3]));
    const parsed = new AbrParser().parse(writer.toBuffer());
    expect(parsed.resourceBlocks?.at(-1)?.offset).toBe(base.length);
    const next = new AbrParser().parse(new AbrWriter().write(parsed));
    expect(next.resourceBlocks?.at(-1)?.data).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('Descriptor wire fidelity', () => {
  test('retains documented uncommon types, nested class names and references after an edit', () => {
    const reference = new BinaryWriter();
    reference.writeUInt32BE(1);
    reference.writeString('prop');
    reference.writeTextValue('Reference class');
    reference.writeId('Lyr ');
    reference.writeId('Nm  ');
    const values: Record<string, DescriptorValue> = {
      integralDouble: { type: 'doub', value: 42 },
      blob: { type: 'tdta', value: new Uint8Array([255, 0, 3]) },
      alias: { type: 'alis', value: new Uint8Array([1, 0, 2]) },
      large: { type: 'comp', value: new Uint8Array([127, 255, 255, 255, 255, 255, 255, 255]) },
      class: { type: 'type', className: 'Named class', classId: 'Clss' },
      globalClass: { type: 'GlbC', className: 'Global', classId: 'Clss' },
      global: { type: 'GlbO', className: 'Global object', classId: 'test', value: {} },
      reference: { type: 'obj ', value: reference.toBuffer() },
      nested: {
        type: 'Objc',
        className: 'Nested name',
        classId: 'nested',
        value: { number: { type: 'doub', value: 7 } }
      }
    };
    const file = descriptorFile({
      'Nm  ': { type: 'TEXT', value: 'Before' },
      Brsh: { type: 'Objc', classId: 'computedBrush', value: {} },
      ...values
    });
    const parsed = new AbrParser().parse(file);
    expect(parsed.errors).toEqual([]);
    parsed.brushes[0].name = 'After';
    const next = new AbrParser().parse(new AbrWriter().write(parsed));
    expect(next.errors).toEqual([]);
    expect(next.brushes[0].name).toBe('After');
    for (const key of Object.keys(values)) expect(next.brushes[0].descriptor?.[key]).toEqual(values[key]);
  });

  test('unknown value types stop parsing with an offset instead of guessing', () => {
    const writer = new BinaryWriter();
    writer.writeString('????');
    writer.writeUInt32BE(0);
    expect(() => new DescriptorParser(new BinaryReader(writer.toBuffer())).parseValue()).toThrow('offset 0');
    const file = descriptorFile({ 'Nm  ': { type: 'TEXT', value: 'Test' } });
    const marker = Buffer.from(file).indexOf('TEXT');
    file.set(new TextEncoder().encode('????'), marker);
    expect(new AbrParser().parse(file).errors.join()).toContain('Unsupported descriptor type');
  });

  test('preserves root metadata outside the brush list', () => {
    const file = new AbrParser().parse(descriptorFile({ 'Nm  ': { type: 'TEXT', value: 'Preset' } }));
    file.descriptorRoot!.className = 'Root name';
    file.descriptorRoot!.classId = 'customRoot';
    file.descriptorRoot!.value.extension = { type: 'tdta', value: new Uint8Array([1, 2, 3]) };
    file.brushes[0].presetClassName = 'Preset class name';
    const parsed = new AbrParser().parse(new AbrWriter().write(file));
    expect(parsed.descriptorRoot?.className).toBe('Root name');
    expect(parsed.descriptorRoot?.classId).toBe('customRoot');
    expect(parsed.descriptorRoot?.value.extension).toEqual(file.descriptorRoot!.value.extension);
    expect(parsed.brushes[0].presetClassName).toBe('Preset class name');
  });

  test.each(abrFiles)('retains all typed brush settings in %s', (name) => {
    const parsed = new AbrParser().parse(readFileSync(join(FILES_DIR, name)));
    const next = new AbrParser().parse(new AbrWriter().write(parsed));
    expect(parsed.errors).toEqual([]);
    expect(next.errors).toEqual([]);
    expect(next.brushes.map((b) => b.descriptor)).toEqual(parsed.brushes.map((b) => b.descriptor));
  });
});

describe('Sample boundaries and precision', () => {
  test.each([false, true])('decodes 16-bit bytes and preserves the original record (RLE=%s)', (rle) => {
    const record = sampleRecord({
      depth: 16,
      rle,
      pixels: rle ? [3, 0x12, 0x34, 0xab, 0xcd] : [0x12, 0x34, 0xab, 0xcd]
    });
    const parsed = new AbrParser().parse(sampleFile(record));
    expect(parsed.errors).toEqual([]);
    expect(parsed.brushes[0].brushTip?.data).toEqual(new Uint8Array([0x12, 0xab]));
    // Selected export has no file-wide raw samples; the individual record must survive.
    const selected = createAbrFile(parsed.brushes);
    const next = new AbrParser().parse(new AbrWriter().write(selected));
    expect(next.brushes[0].brushTip?.sourceSample?.data).toEqual(record);
    selected.brushes[0].brushTip!.data[0] = 0;
    expect(() => new AbrWriter().write(selected)).toThrow('16-bit');
  });

  test.each([
    [2, 1, 2, 3],
    [0, 1],
    [1, 1],
    [254, 5]
  ])('reports invalid PackBits row %j', (...pixels) => {
    const parsed = new AbrParser().parse(sampleFile(sampleRecord({ rle: true, pixels })));
    expect(parsed.errors.join()).toMatch(/PackBits|byte length/);
  });

  test('cannot read pixels from the next sample record', () => {
    const broken = sampleRecord({ pixels: [1] });
    const good = sampleRecord({ pixels: [3, 4], id: uuid.slice(0, -1) + '2' });
    const parsed = new AbrParser().parse(sampleFile(broken, good));
    expect(parsed.errors.join()).toContain('Raw pixels exceed sample boundary');
  });

  test('distinguishes sample UUIDs differing only in their last character', () => {
    const brushes = [11, 22].map((pixel, i) => ({
      ...createBrush({ name: String(i), brushTip: createBrushTip(1, 1, new Uint8Array([pixel])) }),
      sampledDataUuid: uuid.slice(0, -1) + String(i)
    }));
    const parsed = new AbrParser().parse(new AbrWriter().write(createAbrFile(brushes)));
    expect(parsed.brushes.map((b) => b.brushTip?.data[0])).toEqual([11, 22]);
  });

  test('selected export retains a dual brush dependency and rejects its omission', () => {
    const secondaryId = uuid.slice(0, -1) + '2';
    const base = new AbrParser().parse(
      sampleFile(sampleRecord({ pixels: [1, 2] }), sampleRecord({ pixels: [3, 4], id: secondaryId }))
    );
    const descriptor = {
      ...base.brushes[0].descriptor,
      dualBrush: {
        type: 'Objc',
        classId: 'dualBrush',
        value: {
          useDualBrush: { type: 'bool', value: true },
          Brsh: { type: 'Objc', classId: 'sampledBrush', value: { sampledData: { type: 'TEXT', value: secondaryId } } }
        }
      } satisfies DescriptorValue
    };
    const source = new AbrParser().parse(descriptorFile(descriptor, base.rawSampleData));
    expect(source.errors).toEqual([]);
    expect(source.brushes[0].sampleDependencies).toHaveLength(1);
    const selected = createAbrFile(source.brushes);
    const next = new AbrParser().parse(new AbrWriter().write(selected));
    expect(next.errors).toEqual([]);
    expect(next.brushes[0].sampleDependencies).toEqual(source.brushes[0].sampleDependencies);
    selected.brushes[0].sampleDependencies = [];
    expect(() => new AbrWriter().write(selected)).toThrow('Missing referenced sample');
  });

  test('export resolves repeated brush IDs from independent imports by object identity', () => {
    const files = [21, 42].map((pixel) =>
      new AbrParser().parse(
        new AbrWriter().write(
          createAbrFile([createBrush({ name: String(pixel), brushTip: createBrushTip(1, 1, new Uint8Array([pixel])) })])
        )
      )
    );
    expect(files[0].brushes[0].id).toBe(files[1].brushes[0].id);
    const output = new AbrWriter().write(createAbrFile(files.flatMap((file) => file.brushes)));
    expect(new AbrParser().parse(output).brushes.map((brush) => brush.brushTip?.data[0])).toEqual([21, 42]);
  });

  test('refuses stale file-wide pixels and honors scalar edits', () => {
    const source = new AbrParser().parse(sampleFile(sampleRecord({ pixels: [1, 2] })));
    source.brushes[0].brushTip!.data[0] = 3;
    expect(() => new AbrWriter().write(source)).toThrow('Preserved sample disagrees');
    source.rawSampleData = undefined;
    const next = new AbrParser().parse(new AbrWriter().write(source));
    expect(next.brushes[0].brushTip?.data[0]).toBe(3);
    const computed = new AbrParser().parse(
      new AbrWriter().write(createAbrFile([createBrush({ name: 'Scalar', spacing: 25 })]))
    );
    computed.brushes[0].spacing = 250;
    expect(new AbrParser().parse(new AbrWriter().write(computed)).brushes[0].spacing).toBe(250);
  });

  test('generated samples contain a complete VM array list with masks', () => {
    const source = createAbrFile([
      createBrush({ name: 'Header', brushTip: createBrushTip(1, 1, new Uint8Array([5])) })
    ]);
    const parsed = new AbrParser().parse(new AbrWriter({ useRleCompression: false }).write(source));
    const record = parsed.brushes[0].brushTip!.sourceSample!.data;
    const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
    expect(view.getUint32(41)).toBe(3);
    expect(view.getUint32(45)).toBe(record.length - 49);
    expect(view.getUint32(65)).toBe(56);
    expect(view.getUint32(289)).toBe(1);
    expect(view.getUint32(293)).toBe(24);
    expect(record.slice(-8)).toEqual(new Uint8Array(8));
  });

  test('does not assign an unrelated tip when an explicit UUID is missing', () => {
    const file = sampleFile(sampleRecord({ pixels: [1, 2], id: uuid.slice(0, -1) + '9' }));
    expect(new AbrParser().parse(file).errors.join()).toContain('Missing sample');
  });
});

/** Hand-built framing, independent of AbrWriter's sample encoder. */
function sampleRecord({
  depth = 8,
  rle = false,
  pixels,
  id = uuid
}: {
  depth?: number;
  rle?: boolean;
  pixels: number[];
  id?: string;
}): Uint8Array {
  const body = new BinaryWriter();
  body.writeUInt32BE(depth);
  body.writeInt32BE(-1);
  body.writeInt32BE(-1);
  body.writeInt32BE(0);
  body.writeInt32BE(1);
  body.writeUInt16BE(depth);
  body.writeUInt8(rle ? 1 : 0);
  if (rle) body.writeUInt16BE(pixels.length);
  body.writeBytes(new Uint8Array(pixels));
  // A single image channel tests dynamic channel tables (Photoshop commonly writes 56).
  const w = new BinaryWriter();
  w.writeUInt8(36);
  w.writeString(id);
  w.writeUInt8(0);
  w.writeUInt8(1);
  w.writeUInt16BE(0);
  w.writeUInt32BE(3);
  w.writeUInt32BE(20 + 8 + body.position + 8);
  w.writeInt32BE(-1);
  w.writeInt32BE(-1);
  w.writeInt32BE(0);
  w.writeInt32BE(1);
  w.writeUInt32BE(1);
  w.writeUInt32BE(1);
  w.writeUInt32BE(body.position);
  w.writeBytes(body.toBuffer());
  w.writeUInt32BE(0);
  w.writeUInt32BE(0);
  return w.toBuffer();
}

function sampleFile(...records: Uint8Array[]): Uint8Array {
  const sample = new BinaryWriter();
  for (const record of records) {
    sample.writeUInt32BE(record.length);
    sample.writeBytes(record);
    sample.writePadding((4 - (record.length % 4)) % 4);
  }
  return descriptorFile(
    {
      'Nm  ': { type: 'TEXT', value: 'Sample' },
      Brsh: { type: 'Objc', classId: 'sampledBrush', value: { sampledData: { type: 'TEXT', value: uuid } } }
    },
    sample.toBuffer()
  );
}

function descriptorFile(brush: Record<string, DescriptorValue>, sample?: Uint8Array): Uint8Array {
  const descriptor = new BinaryWriter();
  descriptor.writeUInt32BE(16);
  new DescriptorSerializer(descriptor).serializeDescriptor({
    Brsh: { type: 'VlLs', value: [{ type: 'Objc', classId: 'brushPreset', value: brush }] }
  });
  const file = new BinaryWriter();
  file.writeUInt16BE(6);
  file.writeUInt16BE(2);
  if (sample) {
    file.writeString('8BIMsamp');
    file.writeUInt32BE(sample.length);
    file.writeBytes(sample);
  }
  file.writeString('8BIMdesc');
  file.writeUInt32BE(descriptor.position);
  file.writeBytes(descriptor.toBuffer());
  return file.toBuffer();
}
