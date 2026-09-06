/**
 * ABR (Photoshop Brush) File Writer
 * Creates ABR files from brush data (v6.2 format)
 */

import { v4 as uuidv4 } from 'uuid';
import { BinaryReader } from './binary-reader';
import { BinaryWriter } from './binary-writer';
import { DescriptorSerializer, makeDescriptor } from './descriptor-serializer';
import { readSample } from './sample-reader';
import { sampleReferences } from './sample-references';
import { AbrFile, Brush, BrushTipImage, DescriptorValue, HierarchyItem } from './types';

const PHOTOSHOP_SIGNATURE = '8BIM';
const SAMPLE_KEY = 'samp';
const DESCRIPTOR_KEY = 'desc';
const HIERARCHY_KEY = 'phry';

export type WriteOptions = {
  /** Output container version; defaults to the source version. */
  version?: number;
  /** Output sample layout; defaults to the source subversion. */
  subVersion?: number;
  /** Use RLE compression for images (default: true) */
  useRleCompression?: boolean;
  /** Use original descriptor bytes, ignoring brush setting edits (default: false) */
  preserveRawDescriptor?: boolean;
};

export class AbrWriter {
  private options: WriteOptions & { useRleCompression: boolean; preserveRawDescriptor: boolean };

  constructor(options: WriteOptions = {}) {
    this.options = {
      version: options.version,
      subVersion: options.subVersion,
      useRleCompression: options.useRleCompression ?? true,
      preserveRawDescriptor: options.preserveRawDescriptor ?? false
    };
  }

  /**
   * Generate ABR file as a buffer
   */
  write(abrFile: AbrFile): Uint8Array {
    const version = this.options.version ?? abrFile.version;
    const subVersion = this.options.subVersion ?? abrFile.subVersion;
    if (abrFile.errors.length)
      throw new Error('Cannot export an incompletely parsed ABR: ' + abrFile.errors.join('; '));
    if (![6, 9, 10].includes(version) || ![1, 2].includes(subVersion)) {
      throw new Error(`Unsupported output ABR version ${version}.${subVersion}`);
    }
    if (abrFile.rawSampleData?.length && abrFile.subVersion !== subVersion) {
      throw new Error('Cannot relabel preserved samples with a different subversion');
    }
    const writer = new BinaryWriter();

    // Write version header
    writer.writeUInt16BE(version);
    writer.writeUInt16BE(subVersion);

    // Collect brushes with tips for sample block
    const sampledBrushes = abrFile.brushes.filter((b) => b.brushTip && b.type === 'sampled');

    // Generate or preserve UUIDs for brushes
    const brushUuids = new Map<Brush, string>();
    for (const brush of sampledBrushes) {
      // Use the preserved sampledDataUuid if available, otherwise generate new
      const uuid = brush.sampledDataUuid || uuidv4();
      brushUuids.set(brush, uuid);
    }

    const sampleData = abrFile.rawSampleData?.length
      ? abrFile.rawSampleData
      : this.writeSampleBlock(abrFile.brushes, brushUuids, subVersion);
    this.validateSamples(sampleData, subVersion, abrFile.brushes, brushUuids);
    this.writeResourceBlock(writer, SAMPLE_KEY, sampleData);

    // Write pattern block - preserve raw data if available, otherwise write empty
    if (abrFile.rawPatternData && abrFile.rawPatternData.length > 0) {
      this.writeResourceBlock(writer, 'patt', abrFile.rawPatternData);
    } else {
      // Write empty patt block for compatibility
      this.writeResourceBlock(writer, 'patt', new Uint8Array(0));
    }

    // Write descriptor block - preserve raw data if available for perfect round-trip
    // Only use raw data if we haven't modified the brushes (i.e., preserveRawDescriptor option)
    if (abrFile.rawDescriptorData && abrFile.rawDescriptorData.length > 0 && this.options.preserveRawDescriptor) {
      this.writeResourceBlock(writer, DESCRIPTOR_KEY, abrFile.rawDescriptorData);
    } else {
      const descriptorData = this.writeDescriptorBlock(abrFile, brushUuids);
      this.writeResourceBlock(writer, DESCRIPTOR_KEY, descriptorData);
    }

    // Write hierarchy block (phry) - preserves folder/group structure
    if (abrFile.rawHierarchyData && abrFile.rawHierarchyData.length > 0) {
      // Preserve raw hierarchy data for perfect round-trip
      this.writeResourceBlock(writer, HIERARCHY_KEY, abrFile.rawHierarchyData);
    } else if (abrFile.hierarchy && abrFile.hierarchy.length > 0) {
      // Reconstruct hierarchy block from parsed data
      const hierarchyData = this.writeHierarchyBlock(abrFile.hierarchy);
      this.writeResourceBlock(writer, HIERARCHY_KEY, hierarchyData);
    }

    // Preserve extension resources even though their semantics are not yet decoded.
    for (const block of abrFile.resourceBlocks ?? []) {
      if (!['samp', 'patt', 'desc', 'phry'].includes(block.key)) {
        this.writeResourceBlock(writer, block.key, block.data);
      }
    }
    return writer.toBuffer();
  }

  /**
   * Write a resource block (8BIM format)
   */
  private writeResourceBlock(writer: BinaryWriter, key: string, data: Uint8Array): void {
    writer.writeString(PHOTOSHOP_SIGNATURE, 4);
    writer.writeString(key, 4);
    writer.writeUInt32BE(data.length);
    writer.writeBytes(data);
    // Canonical output is unpadded; the reader also accepts observed null alignment padding.
  }

  /**
   * Write sample block containing brush tip images
   */
  private writeSampleBlock(brushes: Brush[], uuids: Map<Brush, string>, subVersion: number): Uint8Array {
    const writer = new BinaryWriter();

    const written = new Map<string, Uint8Array>();
    const append = (uuid: string, data: Uint8Array) => {
      const key = uuid.toLowerCase();
      const previous = written.get(key);
      if (previous) {
        if (previous.length !== data.length || !previous.every((byte, i) => byte === data[i])) {
          throw new Error(`Conflicting sample records for ${uuid}`);
        }
        return;
      }
      written.set(key, data);
      writer.writeUInt32BE(data.length);
      writer.writeBytes(data);
      writer.writePadding((4 - (data.length % 4)) % 4);
    };

    for (const brush of brushes) {
      for (const dependency of brush.sampleDependencies ?? []) {
        if (dependency.source.subVersion !== subVersion)
          throw new Error('Cannot convert opaque sample metadata between subversions');
        append(dependency.uuid, dependency.source.data);
      }
      if (!brush.brushTip) continue;

      const uuid = uuids.get(brush) || uuidv4();
      const original = brush.brushTip.sourceSample;
      if (original && original.subVersion === subVersion) {
        const decoded = readSample(original.data, original.subVersion);
        const tip = brush.brushTip;
        if (
          decoded.uuid === uuid.toLowerCase() &&
          decoded.tip.width === tip.width &&
          decoded.tip.height === tip.height &&
          decoded.tip.depth === tip.depth &&
          decoded.tip.data.length === tip.data.length &&
          decoded.tip.data.every((pixel, i) => pixel === tip.data[i])
        ) {
          append(uuid, original.data);
          continue;
        }
      }
      if (brush.brushTip.depth !== 8) throw new Error('Cannot regenerate a 16-bit sample from its 8-bit preview');
      if (
        !Number.isInteger(brush.brushTip.width) ||
        !Number.isInteger(brush.brushTip.height) ||
        brush.brushTip.width < 1 ||
        brush.brushTip.height < 1 ||
        brush.brushTip.width > 10000 ||
        brush.brushTip.height > 10000 ||
        brush.brushTip.data.length !== brush.brushTip.width * brush.brushTip.height
      ) {
        throw new Error('Invalid brush tip dimensions or pixel length');
      }
      if (subVersion !== 2)
        throw new Error('New samples require subversion 2; subversion 1 records can only be preserved');
      const { width, height } = brush.brushTip;
      const channel = new BinaryWriter();
      channel.writeUInt32BE(8); // Channel depth (32-bit field).
      channel.writeInt32BE(0);
      channel.writeInt32BE(0);
      channel.writeInt32BE(height);
      channel.writeInt32BE(width);
      channel.writeUInt16BE(8);
      channel.writeUInt8(this.options.useRleCompression ? 1 : 0);
      if (this.options.useRleCompression) this.writeRleCompressedImage(channel, brush.brushTip);
      else channel.writeBytes(brush.brushTip.data);
      const channelData = channel.toBuffer();

      const sampleWriter = new BinaryWriter();
      if (uuid.length !== 36) throw new Error('Sample identifier must contain 36 characters');
      sampleWriter.writeUInt8(36);
      sampleWriter.writeString(uuid, 36);
      sampleWriter.writeUInt8(0);
      // Observed sample prefix followed by Adobe's Virtual Memory Array List.
      sampleWriter.writeUInt8(1);
      sampleWriter.writeUInt16BE(0);
      sampleWriter.writeUInt32BE(3);
      sampleWriter.writeUInt32BE(20 + 55 * 4 + 8 + channelData.length + 8);
      sampleWriter.writeInt32BE(0);
      sampleWriter.writeInt32BE(0);
      sampleWriter.writeInt32BE(height);
      sampleWriter.writeInt32BE(width);
      sampleWriter.writeUInt32BE(56);
      sampleWriter.writePadding(55 * 4); // Unwritten channels.
      sampleWriter.writeUInt32BE(1); // Written grayscale channel.
      sampleWriter.writeUInt32BE(channelData.length);
      sampleWriter.writeBytes(channelData);
      sampleWriter.writeUInt32BE(0); // Unwritten user mask.
      sampleWriter.writeUInt32BE(0); // Unwritten sheet mask.

      append(uuid, sampleWriter.toBuffer());
    }

    return writer.toBuffer();
  }

  /** Refuse dangling dependencies and stale raw pixels before producing an export. */
  private validateSamples(data: Uint8Array, subVersion: number, brushes: Brush[], uuids: Map<Brush, string>): void {
    const reader = new BinaryReader(data);
    const tips = new Map<string, BrushTipImage>();
    while (!reader.isEof()) {
      const length = reader.readUInt32BE();
      const sample = readSample(reader.readBytes(length), subVersion);
      reader.skip((4 - (length % 4)) % 4);
      if (tips.has(sample.uuid)) throw new Error(`Duplicate sample identifier ${sample.uuid}`);
      tips.set(sample.uuid, sample.tip);
    }
    for (const brush of brushes) {
      for (const id of sampleReferences(this.createBrushDescriptor(brush, uuids.get(brush)))) {
        if (!tips.has(id.toLowerCase())) throw new Error(`Missing referenced sample ${id} for brush "${brush.name}"`);
      }
      const uuid = uuids.get(brush);
      if (!uuid || !brush.brushTip) continue;
      const source = tips.get(uuid.toLowerCase());
      const tip = brush.brushTip;
      if (
        !source ||
        source.width !== tip.width ||
        source.height !== tip.height ||
        source.depth !== tip.depth ||
        source.data.length !== tip.data.length ||
        !source.data.every((pixel, i) => pixel === tip.data[i])
      ) {
        throw new Error(
          `Preserved sample disagrees with edited pixels for "${brush.name}"; clear rawSampleData to regenerate`
        );
      }
    }
  }

  /**
   * Write RLE (PackBits) compressed image data
   */
  private writeRleCompressedImage(writer: BinaryWriter, brushTip: BrushTipImage): void {
    const { width, height, data } = brushTip;

    // First, compress all rows and calculate byte counts
    const compressedRows: Uint8Array[] = [];
    const rowByteCounts: number[] = [];

    for (let y = 0; y < height; y++) {
      const rowStart = y * width;
      const rowData = data.slice(rowStart, rowStart + width);
      const compressed = this.packBitsCompress(rowData);
      compressedRows.push(compressed);
      rowByteCounts.push(compressed.length);
    }

    // Write row byte counts (2 bytes each)
    for (const count of rowByteCounts) {
      writer.writeUInt16BE(count);
    }

    // Write compressed data
    for (const row of compressedRows) {
      writer.writeBytes(row);
    }
  }

  /**
   * PackBits compression for a single row
   */
  private packBitsCompress(data: Uint8Array): Uint8Array {
    const result: number[] = [];
    let i = 0;

    while (i < data.length) {
      // Look for a run of identical bytes
      let runLength = 1;
      while (i + runLength < data.length && data[i + runLength] === data[i] && runLength < 128) {
        runLength++;
      }

      if (runLength > 2) {
        // Encode as a run: -(runLength - 1), value
        result.push(256 - runLength + 1); // Same as -(runLength - 1) as signed byte
        result.push(data[i]);
        i += runLength;
      } else {
        // Look for literal sequence
        let literalLength = 1;
        while (i + literalLength < data.length && literalLength < 128) {
          // Check if next position starts a run of 3+
          if (
            i + literalLength + 2 < data.length &&
            data[i + literalLength] === data[i + literalLength + 1] &&
            data[i + literalLength] === data[i + literalLength + 2]
          ) {
            break;
          }
          literalLength++;
        }

        // Encode as literal: length - 1, values...
        result.push(literalLength - 1);
        for (let j = 0; j < literalLength; j++) {
          result.push(data[i + j]);
        }
        i += literalLength;
      }
    }

    return new Uint8Array(result);
  }

  /**
   * Write descriptor block containing brush settings
   */
  private writeDescriptorBlock(file: AbrFile, uuids: Map<Brush, string>): Uint8Array {
    const writer = new BinaryWriter();

    // Write descriptor version
    writer.writeUInt32BE(16); // Version 16 is standard for ABR v6+

    // Build the brush list descriptor
    const brushList: DescriptorValue[] = [];

    for (const brush of file.brushes) {
      const brushDesc = this.createBrushDescriptor(brush, uuids.get(brush));
      // Use 'brushPreset' as classId, empty className for Photoshop compatibility
      brushList.push(makeDescriptor.obj(brush.presetClassId ?? 'brushPreset', brushDesc, brush.presetClassName ?? ''));
    }

    // Create the root descriptor
    const rootDesc: Record<string, DescriptorValue> = {
      ...file.descriptorRoot?.value,
      Brsh: makeDescriptor.list(brushList)
    };

    // Serialize the descriptor
    const serializer = new DescriptorSerializer(writer);
    serializer.serializeDescriptor(
      rootDesc,
      file.descriptorRoot?.className ?? '',
      file.descriptorRoot?.classId ?? 'null'
    );

    return writer.toBuffer();
  }

  /**
   * Write hierarchy block (phry) containing folder/group structure.
   * The hierarchy is a flat list describing group nesting:
   *   - Grup objects: Group start (with name and UUID)
   *   - groupEnd objects: Group end marker
   *   - preset objects: Brush preset placeholder
   */
  private writeHierarchyBlock(hierarchy: HierarchyItem[]): Uint8Array {
    const writer = new BinaryWriter();

    // Write descriptor version
    writer.writeUInt32BE(16);

    // Build the hierarchy list
    const hierarchyList: DescriptorValue[] = [];

    for (const item of hierarchy) {
      switch (item.type) {
        case 'group':
          // Group start: Objc with classId='Grup', has 'Nm  ' and 'zuid' keys
          {
            const groupDesc: Record<string, DescriptorValue> = {};
            if (item.name !== undefined) {
              groupDesc['Nm  '] = makeDescriptor.text(item.name);
            }
            if (item.uuid !== undefined) {
              groupDesc['zuid'] = makeDescriptor.text(item.uuid);
            }
            hierarchyList.push(makeDescriptor.obj('Grup', groupDesc, ''));
          }
          break;
        case 'groupEnd':
          // Group end: empty Objc with classId='groupEnd'
          hierarchyList.push(makeDescriptor.obj('groupEnd', {}, ''));
          break;
        case 'preset':
          // Preset: empty Objc with classId='preset'
          hierarchyList.push(makeDescriptor.obj('preset', {}, ''));
          break;
      }
    }

    // Create root descriptor with 'hierarchy' key
    const rootDesc: Record<string, DescriptorValue> = {
      hierarchy: makeDescriptor.list(hierarchyList)
    };

    const serializer = new DescriptorSerializer(writer);
    serializer.serializeDescriptor(rootDesc, '', 'null');

    return writer.toBuffer();
  }

  /**
   * Create a descriptor for a single brush
   */
  private createBrushDescriptor(brush: Brush, uuid?: string): Record<string, DescriptorValue> {
    const desc: Record<string, DescriptorValue> = Object.create(null);

    // Brush name
    desc['Nm  '] = makeDescriptor.text(brush.name);

    // Brush definition - use proper class names for Photoshop compatibility
    const brushClassName = brush.type === 'computed' ? 'computedBrush' : 'sampledBrush';

    // Start with the original Brsh structure if available to preserve property order
    let brushDef: Record<string, DescriptorValue> = Object.create(null);

    if (brush.settings?.['Brsh'] && typeof brush.settings['Brsh'] === 'object') {
      // Copy original Brsh properties in their original order
      const originalBrsh = brush.settings['Brsh'] as Record<string, unknown>;
      const original = brush.descriptor?.['Brsh'];
      for (const [key, value] of Object.entries(originalBrsh)) {
        if (key === '__classId' && !((original?.type === 'Objc' || original?.type === 'GlbO') && original.value[key]))
          continue;
        const converted = this.convertToDescriptorValue(
          value,
          original?.type === 'Objc' || original?.type === 'GlbO' ? original.value[key] : undefined
        );
        if (converted) {
          brushDef[key] = converted;
        }
      }

      // Update sampledData UUID if we have a new one
      if (brush.type === 'sampled' && uuid) {
        brushDef['sampledData'] = makeDescriptor.text(uuid);
      }
    } else {
      // Build brushDef from scratch for new brushes
      // Basic properties - order: Dmtr, Angl, Rndn, Nm, Spcn, Intr, flipX, flipY, sampledData
      if (brush.diameter !== undefined) {
        brushDef['Dmtr'] = makeDescriptor.unit('#Pxl', brush.diameter);
      }
      if (brush.angle !== undefined) {
        brushDef['Angl'] = makeDescriptor.unit('#Ang', brush.angle);
      }
      if (brush.roundness !== undefined) {
        brushDef['Rndn'] = makeDescriptor.unit('#Prc', brush.roundness);
      }
      if (brush.spacing !== undefined) {
        brushDef['Spcn'] = makeDescriptor.unit('#Prc', brush.spacing);
      }
      if (brush.hardness !== undefined) {
        brushDef['Hrdn'] = makeDescriptor.unit('#Prc', brush.hardness);
      }

      // Add Intr (interpolation) flag
      brushDef['Intr'] = makeDescriptor.bool(true);
      brushDef['flipX'] = makeDescriptor.bool(false);
      brushDef['flipY'] = makeDescriptor.bool(false);

      // For sampled brushes, include the sampled data UUID at end
      if (brush.type === 'sampled' && uuid) {
        brushDef['sampledData'] = makeDescriptor.text(uuid);
      }

      // For computed brushes, set default shape
      if (brush.type === 'computed') {
        if (!brushDef['Dmtr']) {
          brushDef['Dmtr'] = makeDescriptor.unit('#Pxl', 30);
        }
        if (!brushDef['Hrdn']) {
          brushDef['Hrdn'] = makeDescriptor.unit('#Prc', 100);
        }
      }
    }

    const originalDefinition = brush.descriptor?.['Brsh'];
    const properties = [
      ['Dmtr', brush.diameter, '#Pxl'],
      ['Spcn', brush.spacing, '#Prc'],
      ['Angl', brush.angle, '#Ang'],
      ['Rndn', brush.roundness, '#Prc'],
      ['Hrdn', brush.hardness, '#Prc']
    ] as const;
    for (const [key, value, unit] of properties) {
      const old =
        originalDefinition?.type === 'Objc' || originalDefinition?.type === 'GlbO'
          ? originalDefinition.value[key]
          : undefined;
      if (
        value !== undefined &&
        old &&
        (old.type === 'UntF' || old.type === 'doub' || old.type === 'long') &&
        value !== old.value
      ) {
        brushDef[key] = makeDescriptor.unit(unit, value);
      }
    }
    desc['Brsh'] =
      originalDefinition?.type === 'Objc' || originalDefinition?.type === 'GlbO'
        ? { ...originalDefinition, value: brushDef }
        : makeDescriptor.obj(brushClassName, brushDef, '');

    // Include other settings from the original brush if available
    if (brush.settings) {
      this.mergeSettings(desc, brush.settings, brush.descriptor);
    }

    return desc;
  }

  /**
   * Merge original settings back into descriptor
   */
  private mergeSettings(
    desc: Record<string, DescriptorValue>,
    settings: Record<string, unknown>,
    original?: Record<string, DescriptorValue>
  ): void {
    // Copy settings that aren't already set
    for (const [key, value] of Object.entries(settings)) {
      if (key === 'Nm  ' || key === 'Brsh') continue;

      const converted = this.convertToDescriptorValue(value, original?.[key]);
      if (converted && !desc[key]) {
        desc[key] = converted;
      }
    }
  }

  /**
   * Convert a plain value back to DescriptorValue
   */
  private convertToDescriptorValue(value: unknown, original?: DescriptorValue): DescriptorValue | null {
    // These values have no editable plain representation; retain their original payload.
    if (original && ['tdta', 'alis', 'comp', 'obj ', 'type', 'GlbC'].includes(original.type)) return original;
    if (original?.type === 'doub' && typeof value === 'number') return { ...original, value };
    if (value === null || value === undefined) return null;

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return makeDescriptor.long(value);
      }
      return makeDescriptor.doub(value);
    }

    if (typeof value === 'boolean') {
      return makeDescriptor.bool(value);
    }

    if (typeof value === 'string') {
      return makeDescriptor.text(value);
    }

    if (Array.isArray(value)) {
      const items: DescriptorValue[] = [];
      for (const [index, item] of value.entries()) {
        const converted = this.convertToDescriptorValue(
          item,
          original?.type === 'VlLs' ? original.value[index] : undefined
        );
        if (converted) items.push(converted);
      }
      return makeDescriptor.list(items);
    }

    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;

      // Check for enum format
      if ('type' in obj && 'value' in obj && typeof obj.type === 'string' && !('__classId' in obj)) {
        return makeDescriptor.enum(obj.type as string, obj.value as string);
      }

      // Check for unit format
      if ('unit' in obj && 'value' in obj && !('__classId' in obj)) {
        return makeDescriptor.unit(obj.unit as string, obj.value as number);
      }

      // Otherwise treat as nested object, preserving __classId if present
      const classId =
        (original?.type === 'Objc' || original?.type === 'GlbO') && original.value.__classId
          ? original.classId
          : (obj.__classId as string) || 'null';
      const items: Record<string, DescriptorValue> = Object.create(null);
      for (const [k, v] of Object.entries(obj)) {
        if (k === '__classId' && !((original?.type === 'Objc' || original?.type === 'GlbO') && original.value[k]))
          continue;
        const converted = this.convertToDescriptorValue(
          v,
          original?.type === 'Objc' || original?.type === 'GlbO' ? original.value[k] : undefined
        );
        if (converted) items[k] = converted;
      }
      return original?.type === 'Objc' || original?.type === 'GlbO'
        ? { ...original, classId, value: items }
        : makeDescriptor.obj(classId, items);
    }

    return null;
  }
}

/**
 * Helper function to create a new brush
 */
export function createBrush(params: {
  name: string;
  type?: 'computed' | 'sampled';
  spacing?: number;
  diameter?: number;
  hardness?: number;
  angle?: number;
  roundness?: number;
  brushTip?: BrushTipImage;
}): Brush {
  return {
    id: `brush_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: params.name,
    type: params.type ?? (params.brushTip ? 'sampled' : 'computed'),
    spacing: params.spacing ?? 25,
    diameter: params.diameter,
    hardness: params.hardness,
    angle: params.angle ?? 0,
    roundness: params.roundness ?? 100,
    brushTip: params.brushTip,
    settings: {}
  };
}

/**
 * Helper function to create a new ABR file
 */
export function createAbrFile(brushes: Brush[] = []): AbrFile {
  return {
    version: 6,
    subVersion: 2,
    brushes,
    errors: []
  };
}

/**
 * Helper to create a brush tip from grayscale image data
 */
export function createBrushTip(width: number, height: number, data: Uint8Array): BrushTipImage {
  return {
    width,
    height,
    depth: 8,
    data
  };
}
