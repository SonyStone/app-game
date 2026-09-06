/**
 * ABR (Photoshop Brush) File Parser
 * Reads modern ABR containers 6, 9 and 10; subversions 1 and 2.
 *
 * Universal module - works in both Node.js and browser environments.
 */

import { BinaryReader } from './binary-reader';
import { DescriptorParser, getNumber, getObject, getString } from './descriptor-parser';
import { readSample } from './sample-reader';
import { sampleReferences } from './sample-references';
import { AbrFile, Brush, BrushTipImage, DescriptorValue, HierarchyItem, ParseOptions, ResourceBlock } from './types';

const PHOTOSHOP_SIGNATURE = '8BIM';
const SAMPLE_KEY = 'samp';
const PATTERN_KEY = 'patt';
const DESCRIPTOR_KEY = 'desc';
const HIERARCHY_KEY = 'phry';

export class AbrParser {
  private options: Required<ParseOptions>;

  constructor(options: ParseOptions = {}) {
    this.options = {
      extractImages: options.extractImages ?? true,
      includeRawSettings: options.includeRawSettings ?? true,
      continueOnError: options.continueOnError ?? true
    };
  }

  /**
   * Parse an ABR file from a buffer or ArrayBuffer
   * Works in both Node.js (Buffer) and browser (ArrayBuffer) environments.
   */
  parse(buffer: ArrayBuffer | Uint8Array | ArrayBufferView): AbrFile {
    const reader = new BinaryReader(buffer);
    const result: AbrFile = {
      version: 0,
      subVersion: 0,
      brushes: [],
      resourceBlocks: [],
      errors: []
    };

    try {
      // Read version header
      result.version = reader.readUInt16BE();
      result.subVersion = reader.readUInt16BE();

      // Only read container layouts supported by code and fixtures.
      if (![6, 9, 10].includes(result.version) || ![1, 2].includes(result.subVersion)) {
        result.errors.push(
          `Unsupported ABR version: ${result.version}.${result.subVersion}. Supported containers: 6, 9, 10 with subversion 1 or 2.`
        );
        return result;
      }

      // Parse resource blocks
      const sampleBlocks: ResourceBlock[] = [];
      const descriptorBlocks: ResourceBlock[] = [];
      const patternBlocks: ResourceBlock[] = [];
      const hierarchyBlocks: ResourceBlock[] = [];

      while (!reader.isEof() && reader.remaining >= 12) {
        try {
          const block = this.readResourceBlock(reader);
          result.resourceBlocks!.push(block);

          switch (block.key) {
            case SAMPLE_KEY:
              sampleBlocks.push(block);
              break;
            case DESCRIPTOR_KEY:
              descriptorBlocks.push(block);
              break;
            case PATTERN_KEY:
              patternBlocks.push(block);
              break;
            case HIERARCHY_KEY:
              hierarchyBlocks.push(block);
              break;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push(`Error reading resource block at offset ${reader.position}: ${message}`);
          if (!this.options.continueOnError) throw err;
          break;
        }
      }

      if (reader.remaining > 0) {
        const trailing = reader.readBytes(reader.remaining);
        if (trailing.length > 3 || trailing.some((byte) => byte !== 0)) {
          result.errors.push(`Unparsed trailing bytes at offset ${reader.position - trailing.length}`);
        }
      }

      if (!descriptorBlocks.length) result.errors.push('Missing brush descriptor block');

      // Store raw sample data for round-trip preservation
      if (sampleBlocks.length > 0) {
        const totalSize = sampleBlocks.reduce((sum, b) => sum + b.data.length, 0);
        if (totalSize > 0) {
          const sampleData = new Uint8Array(totalSize);
          let offset = 0;
          for (const block of sampleBlocks) {
            sampleData.set(block.data, offset);
            offset += block.data.length;
          }
          result.rawSampleData = sampleData;
        }
      }

      // Parse brush samples (images)
      const brushImages = new Map<string, BrushTipImage>();
      for (const block of sampleBlocks) {
        try {
          const images = this.parseSampleBlock(block.data, result.subVersion, result.errors);
          for (const [id, image] of images) {
            brushImages.set(id, image);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push(`Error parsing sample block: ${message}`);
          if (!this.options.continueOnError) throw err;
        }
      }

      // Store raw pattern data for round-trip preservation
      if (patternBlocks.length > 0) {
        // Concatenate all pattern block data
        const totalSize = patternBlocks.reduce((sum, b) => sum + b.data.length, 0);
        if (totalSize > 0) {
          const patternData = new Uint8Array(totalSize);
          let offset = 0;
          for (const block of patternBlocks) {
            patternData.set(block.data, offset);
            offset += block.data.length;
          }
          result.rawPatternData = patternData;
        }
      }

      // Store raw descriptor data for round-trip preservation
      if (descriptorBlocks.length > 0) {
        const totalSize = descriptorBlocks.reduce((sum, b) => sum + b.data.length, 0);
        if (totalSize > 0) {
          const descData = new Uint8Array(totalSize);
          let offset = 0;
          for (const block of descriptorBlocks) {
            descData.set(block.data, offset);
            offset += block.data.length;
          }
          result.rawDescriptorData = descData;
        }
      }

      // Store raw hierarchy data for round-trip preservation
      if (hierarchyBlocks.length > 0) {
        const totalSize = hierarchyBlocks.reduce((sum, b) => sum + b.data.length, 0);
        if (totalSize > 0) {
          const hierarchyData = new Uint8Array(totalSize);
          let offset = 0;
          for (const block of hierarchyBlocks) {
            hierarchyData.set(block.data, offset);
            offset += block.data.length;
          }
          result.rawHierarchyData = hierarchyData;
        }

        // Parse hierarchy into structured data
        for (const block of hierarchyBlocks) {
          try {
            const items = this.parseHierarchyBlock(block.data);
            if (items.length > 0) {
              result.hierarchy = items;
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            result.errors.push(`Error parsing hierarchy block: ${message}`);
            if (!this.options.continueOnError) throw err;
          }
        }
      }

      // Parse brush descriptors
      let brushIndex = 0;
      for (const block of descriptorBlocks) {
        try {
          const brushes = this.parseDescriptorBlock(block.data, brushImages, brushIndex, result);
          brushIndex += brushes.length;
          result.brushes.push(...brushes);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push(`Error parsing descriptor block: ${message}`);
          if (!this.options.continueOnError) throw err;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Fatal error parsing ABR file: ${message}`);
    }

    return result;
  }

  /**
   * Read a single resource block
   */
  private readResourceBlock(reader: BinaryReader): ResourceBlock {
    const paddingStart = reader.position;
    while (reader.remaining > 0 && reader.peek(1)[0] === 0 && reader.position - paddingStart < 3) reader.skip(1);
    const startPos = reader.position;
    const signature = reader.readString(4);

    if (signature !== PHOTOSHOP_SIGNATURE) {
      throw new Error(`Invalid resource signature at offset ${startPos}`);
    }

    const key = reader.readString(4);
    const length = reader.readUInt32BE();

    if (reader.remaining < length) {
      throw new Error(`Block length ${length} exceeds remaining data ${reader.remaining}`);
    }

    const data = new Uint8Array(reader.readBytes(length));

    return { signature, key, length, data, offset: startPos };
  }

  /**
   * Parse a sample block containing brush tip images
   * @param data - The raw sample block data
   * @param subVersion - The ABR subversion (1 or 2)
   */
  private parseSampleBlock(data: Uint8Array, subVersion: number, errors: string[]): Map<string, BrushTipImage> {
    const reader = new BinaryReader(data);
    const images = new Map<string, BrushTipImage>();
    let index = 0;
    while (!reader.isEof()) {
      const offset = reader.position;
      const length = reader.readUInt32BE();
      if (length === 0) throw new Error(`Empty sample record at offset ${offset}`);
      const record = reader.readBytes(length);
      reader.skip((4 - (length % 4)) % 4);
      try {
        const { uuid, tip } = readSample(record, subVersion);
        if (images.has(uuid)) throw new Error(`Duplicate sample identifier ${uuid}`);
        images.set(uuid, tip);
        images.set(`sample_${index}`, tip);
      } catch (error) {
        errors.push(`Sample ${index} at offset ${offset}: ${error instanceof Error ? error.message : String(error)}`);
        if (!this.options.continueOnError) throw error;
      }
      index++;
    }
    return images;
  }

  /**
   * Parse a hierarchy block (phry) containing folder/group structure.
   * The hierarchy is a flat list of Objc items with classIds:
   *   - 'Grup': Group start (has 'Nm  ' name and 'zuid' UUID)
   *   - 'groupEnd': Group end marker
   *   - 'preset': Brush preset reference (corresponds to brushes in order)
   */
  private parseHierarchyBlock(data: Uint8Array): HierarchyItem[] {
    const reader = new BinaryReader(data);
    const items: HierarchyItem[] = [];

    // Hierarchy block starts with version (4 bytes)
    const version = reader.readUInt32BE();
    if (version !== 16) throw new Error(`Unsupported descriptor version ${version}`);

    // Parse the hierarchy descriptor
    const parser = new DescriptorParser(reader);

    const desc = parser.parseDescriptor();
    const hierarchy = desc['hierarchy'];

    if (hierarchy && hierarchy.type === 'VlLs') {
      for (const item of hierarchy.value) {
        if (item.type === 'Objc') {
          const classId = item.classId;

          if (classId === 'Grup') {
            // Group start - extract name and UUID
            const nm = item.value['Nm  '];
            const zuid = item.value['zuid'];
            items.push({
              type: 'group',
              name: nm && nm.type === 'TEXT' ? nm.value : undefined,
              uuid: zuid && zuid.type === 'TEXT' ? zuid.value : undefined
            });
          } else if (classId === 'groupEnd') {
            // Group end marker
            items.push({ type: 'groupEnd' });
          } else if (classId === 'preset') {
            // Brush preset reference
            items.push({ type: 'preset' });
          }
        }
      }
    }

    return items;
  }

  /**
   * Parse a descriptor block containing brush settings
   */
  private parseDescriptorBlock(
    data: Uint8Array,
    images: Map<string, BrushTipImage>,
    startIndex: number,
    file: AbrFile
  ): Brush[] {
    const reader = new BinaryReader(data);
    const brushes: Brush[] = [];

    // Descriptor block starts with version (4 bytes)
    const version = reader.readUInt32BE();
    if (version !== 16) throw new Error(`Unsupported descriptor version ${version}`);

    // Parse the main descriptor
    const parser = new DescriptorParser(reader);

    if (file.descriptorRoot) throw new Error('Multiple descriptor blocks require a separate editing model');
    const root = parser.parseDescriptorObject();
    file.descriptorRoot = root;
    const desc = root.value;
    if (reader.remaining && reader.readBytes(reader.remaining).some((byte) => byte !== 0)) {
      throw new Error('Unexpected bytes after brush descriptor');
    }

    // Extract brush list from the 'Brsh' key which contains VlLs
    const brushList = this.extractBrushList(desc);

    // Track which samples have been used (for fallback index-based matching)
    let sampleIndex = 0;

    for (let i = 0; i < brushList.length; i++) {
      const brushDesc = brushList[i];
      // Check if this is a sampled brush
      const brushDefValue = brushDesc['Brsh'];
      let isSampledBrush = false;
      let isComputedBrush = false;
      let sampledDataUuid: string | null = null;

      // First check the Brsh object's classId
      if (brushDefValue && brushDefValue.type === 'Objc') {
        const classId = brushDefValue.classId;
        if (classId === 'sampledBrush' || classId === 'smpB') {
          isSampledBrush = true;
        } else if (classId === 'computedBrush' || classId === 'cmpB') {
          isComputedBrush = true;
        }
      }

      // Then check for explicit brTp enum and sampledData UUID
      const innerBrushDef = getObject(brushDesc, 'Brsh');
      if (innerBrushDef) {
        const brushType = innerBrushDef['brTp'];
        if (brushType && brushType.type === 'enum') {
          if (brushType.value === 'brtS') {
            isSampledBrush = true;
          } else if (brushType.value === 'brtC') {
            isComputedBrush = true;
          }
        }
        // Check for sampledData key - this contains the UUID reference
        const sampledData = innerBrushDef['sampledData'];
        if (sampledData) {
          isSampledBrush = true;
          if (sampledData.type === 'TEXT') {
            sampledDataUuid = sampledData.value;
          }
        }
      }

      const brush = this.createBrush(
        brushDesc,
        images,
        isSampledBrush ? sampleIndex : -1,
        startIndex + i,
        isComputedBrush,
        sampledDataUuid
      );
      if (brush) {
        const list = desc['Brsh'];
        const preset =
          list?.type === 'VlLs'
            ? list.value.find((item) => item.type === 'Objc' && item.value === brushDesc)
            : undefined;
        if (preset?.type === 'Objc') {
          brush.presetClassName = preset.className;
          brush.presetClassId = preset.classId;
        }
        brushes.push(brush);
        if (isSampledBrush) {
          sampleIndex++;
        }
      }
    }

    return brushes;
  }

  /**
   * Extract brush list from descriptor
   */
  private extractBrushList(desc: Record<string, DescriptorValue>): Record<string, DescriptorValue>[] {
    const result: Record<string, DescriptorValue>[] = [];

    // The brush list is in 'Brsh' key as a VlLs (value list)
    const brsh = desc['Brsh'];

    if (brsh && brsh.type === 'VlLs') {
      for (const item of brsh.value) {
        if (item.type === 'Objc') {
          result.push(item.value);
        } else {
          throw new Error(`Unsupported brush list entry ${item.type}`);
        }
      }
      return result;
    }

    // Alternative keys
    const altKeys = ['prst', 'brushes', 'Ptrn'];
    for (const key of altKeys) {
      const alt = desc[key];
      if (alt && alt.type === 'VlLs') {
        for (const item of alt.value) {
          if (item.type === 'Objc') {
            result.push(item.value);
          }
        }
        return result;
      }
      if (alt && alt.type === 'Objc') {
        result.push(alt.value);
        return result;
      }
    }

    // If no list found, treat entire descriptor as a single brush
    if (result.length === 0 && Object.keys(desc).length > 0) {
      // Check if this looks like a brush preset
      if (desc['Nm  '] || desc['Brsh'] || desc['Dmtr']) {
        result.push(desc);
      }
    }

    return result;
  }

  /**
   * Create a Brush object from parsed descriptor
   */
  private createBrush(
    desc: Record<string, DescriptorValue>,
    images: Map<string, BrushTipImage>,
    sampleIndex: number,
    brushIndex: number,
    forceComputedType: boolean = false,
    sampledDataUuid: string | null = null
  ): Brush | null {
    // Extract brush ID
    let id = getString(desc, 'Idnt') || getString(desc, 'uuid') || '';
    if (!id) {
      id = `brush_${brushIndex}`;
    }

    // Extract brush name from 'Nm  ' (name) key
    let name = getString(desc, 'Nm  ') ?? getString(desc, 'name') ?? 'Unnamed Brush';

    // Get brush definition from 'Brsh' key
    const brushDef = getObject(desc, 'Brsh');

    // Determine brush type
    // If forceComputedType is set, use computed; if sampleIndex >= 0, use sampled
    let type: 'computed' | 'sampled' = forceComputedType ? 'computed' : sampleIndex >= 0 ? 'sampled' : 'computed';
    let diameter: number | undefined;
    let hardness: number | undefined;
    let angle: number | undefined;
    let roundness: number | undefined;
    let spacing: number | undefined;

    if (brushDef) {
      // Check brush type enum if present (for backwards compatibility)
      const brushTypeVal = brushDef['brTp'];
      if (brushTypeVal && brushTypeVal.type === 'enum') {
        type = brushTypeVal.value === 'brtC' ? 'computed' : 'sampled';
      }

      // Also check classId from Brsh object descriptor
      const brshDescriptor = desc['Brsh'];
      if (brshDescriptor && brshDescriptor.type === 'Objc') {
        const classId = brshDescriptor.classId;
        if (classId === 'computedBrush' || classId === 'cmpB') {
          type = 'computed';
        } else if (classId === 'sampledBrush' || classId === 'smpB') {
          type = 'sampled';
        }
      }

      // Extract properties from brush definition
      diameter = getNumber(brushDef, 'Dmtr');
      hardness = getNumber(brushDef, 'Hrdn');
      angle = getNumber(brushDef, 'Angl');
      roundness = getNumber(brushDef, 'Rndn');
      spacing = getNumber(brushDef, 'Spcn');
    }

    // Fallback to top-level properties
    if (diameter === undefined) diameter = getNumber(desc, 'Dmtr');
    if (hardness === undefined) hardness = getNumber(desc, 'Hrdn');
    if (angle === undefined) angle = getNumber(desc, 'Angl');
    if (roundness === undefined) roundness = getNumber(desc, 'Rndn');
    if (spacing === undefined) spacing = getNumber(desc, 'Spcn');

    // Default spacing
    if (spacing === undefined) spacing = 25;

    // Try to find brush tip image
    // First try UUID-based matching (preferred), then fall back to index
    let brushTip: BrushTipImage | undefined;

    if (sampledDataUuid) {
      // Compare the complete identifier; prefix matching can alias different tips.
      const normalizedUuid = sampledDataUuid.replace(/\0/g, '').toLowerCase();
      brushTip = images.get(normalizedUuid);
    }

    // Only use ordering when the descriptor provides no explicit identifier.
    if (!brushTip && !sampledDataUuid && sampleIndex >= 0) {
      brushTip = images.get(`sample_${sampleIndex}`);
    }

    if (type === 'sampled' && !brushTip) {
      throw new Error(`Missing sample for brush "${name}" (${sampledDataUuid ?? sampleIndex})`);
    }

    const sampleDependencies: NonNullable<Brush['sampleDependencies']> = [];
    for (const uuid of sampleReferences(desc)) {
      const source = images.get(uuid.toLowerCase())?.sourceSample;
      if (!source) throw new Error(`Missing referenced sample ${uuid} for brush "${name}"`);
      if (uuid.toLowerCase() !== sampledDataUuid?.toLowerCase()) sampleDependencies.push({ uuid, source });
    }
    const brush: Brush = {
      id,
      name,
      type,
      spacing,
      diameter,
      hardness,
      angle,
      roundness,
      brushTip: this.options.extractImages ? brushTip : undefined,
      sampledDataUuid: sampledDataUuid || undefined,
      sampleDependencies,
      descriptor: this.options.includeRawSettings ? desc : undefined,
      settings: this.options.includeRawSettings ? this.flattenDescriptor(desc) : {}
    };

    return brush;
  }

  /**
   * Flatten descriptor to plain object for JSON output
   */
  private flattenDescriptor(desc: Record<string, DescriptorValue>): Record<string, unknown> {
    const result: Record<string, unknown> = Object.create(null);

    for (const [key, value] of Object.entries(desc)) {
      result[key] = this.flattenValue(value);
    }

    return result;
  }

  private flattenValue(value: DescriptorValue): unknown {
    switch (value.type) {
      case 'long':
      case 'doub':
      case 'bool':
      case 'TEXT':
        return value.value;
      case 'enum':
        return { type: value.typeId, value: value.value };
      case 'UntF':
        return { unit: value.unit, value: value.value };
      case 'GlbO':
      case 'Objc':
        // Preserve classId for proper serialization
        return {
          __classId: value.classId,
          ...this.flattenDescriptor(value.value)
        };
      case 'VlLs':
        return value.value.map((v) => this.flattenValue(v));
      case 'tdta':
        return `<binary data: ${value.value.length} bytes>`;
      default:
        return null;
    }
  }
}
