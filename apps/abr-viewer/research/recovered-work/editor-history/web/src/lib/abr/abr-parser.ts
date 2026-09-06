/**
 * ABR (Photoshop Brush) File Parser - Browser Compatible
 * Supports ABR version 6+ (modern format)
 */

import { BinaryReader } from './binary-reader';
import { DescriptorParser, getNumber, getString, getObject } from './descriptor-parser';
import {
  AbrFile,
  Brush,
  BrushTipImage,
  ResourceBlock,
  ParseOptions,
  DescriptorValue,
} from './types';

const PHOTOSHOP_SIGNATURE = '8BIM';
const SAMPLE_KEY = 'samp';
const PATTERN_KEY = 'patt';
const DESCRIPTOR_KEY = 'desc';

export class AbrParser {
  private options: Required<ParseOptions>;

  constructor(options: ParseOptions = {}) {
    this.options = {
      extractImages: options.extractImages ?? true,
      includeRawSettings: options.includeRawSettings ?? true,
      continueOnError: options.continueOnError ?? true,
      generateDataUrls: options.generateDataUrls ?? true,
    };
  }

  /**
   * Parse an ABR file from an ArrayBuffer (browser)
   */
  parse(buffer: ArrayBuffer | Uint8Array): AbrFile {
    const reader = new BinaryReader(buffer);
    const result: AbrFile = {
      version: 0,
      subVersion: 0,
      brushes: [],
      errors: [],
    };

    try {
      // Read version header
      result.version = reader.readUInt16BE();
      result.subVersion = reader.readUInt16BE();

      // Validate version - we support v6+
      if (result.version < 6) {
        result.errors.push(`Unsupported ABR version: ${result.version}. Only version 6+ is supported.`);
        return result;
      }

      // Parse resource blocks
      const sampleBlocks: ResourceBlock[] = [];
      const descriptorBlocks: ResourceBlock[] = [];
      const patternBlocks: ResourceBlock[] = [];

      while (!reader.isEof() && reader.remaining >= 12) {
        try {
          const block = this.readResourceBlock(reader);
          if (!block) continue;

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
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push(`Error reading resource block at offset ${reader.position}: ${message}`);
          if (!this.options.continueOnError) throw err;
          break;
        }
      }

      // Parse brush samples (images)
      const brushImages = new Map<string, BrushTipImage>();
      for (const block of sampleBlocks) {
        try {
          const images = this.parseSampleBlock(block.data, result.subVersion);
          for (const [id, image] of images) {
            brushImages.set(id, image);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push(`Error parsing sample block: ${message}`);
          if (!this.options.continueOnError) throw err;
        }
      }

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

      // Parse brush descriptors
      let brushIndex = 0;
      for (const block of descriptorBlocks) {
        try {
          const brushes = this.parseDescriptorBlock(block.data, brushImages, brushIndex);
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
  private readResourceBlock(reader: BinaryReader): ResourceBlock | null {
    const startPos = reader.position;
    const signature = reader.readString(4);

    if (signature !== PHOTOSHOP_SIGNATURE) {
      // Not a valid block, try to find next one
      reader.seek(startPos + 1);
      return null;
    }

    const key = reader.readString(4);
    const length = reader.readUInt32BE();

    if (reader.remaining < length) {
      throw new Error(`Block length ${length} exceeds remaining data ${reader.remaining}`);
    }

    const data = reader.readBytes(length);

    return { signature, key, length, data };
  }

  /**
   * Parse a sample block containing brush tip images
   * Returns images indexed by both sample index and UUID (if available)
   */
  private parseSampleBlock(data: Uint8Array, subVersion: number): Map<string, BrushTipImage> {
    const reader = new BinaryReader(data);
    const images = new Map<string, BrushTipImage>();
    let imageIndex = 0;

    while (!reader.isEof() && reader.remaining >= 4) {
      const brushLength = reader.readUInt32BE();
      if (brushLength === 0 || reader.remaining < brushLength) break;

      const brushStart = reader.position;
      // Pad brush end to 4-byte boundary
      let brushEnd = brushStart + brushLength;
      while (brushEnd % 4 !== 0) brushEnd++;

      try {
        // Read UUID from the start of the sample (37 chars + null = 38 bytes)
        // Format: "$xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\0"
        // Note: The UUID in the sample block has a leading '$' which is NOT present
        // in the descriptor's sampledData field, so we strip it
        let uuid: string | undefined;
        if (reader.remaining >= 38) {
          const uuidBytes = reader.readBytes(37);
          const uuidChars: string[] = [];
          for (let i = 0; i < uuidBytes.length; i++) {
            if (uuidBytes[i] !== 0) {
              uuidChars.push(String.fromCharCode(uuidBytes[i]));
            }
          }
          uuid = uuidChars.join('');
          // Strip leading '$' if present
          if (uuid.startsWith('$')) {
            uuid = uuid.slice(1);
          }
          reader.skip(1); // null terminator
        }

        // ABR v6+ sample format: after UUID, there's additional header data
        // For subversion 1: 10 more bytes, for subversion 2: 263 more bytes
        const remainingHeaderSize = subVersion === 1 ? 10 : 263;

        if (reader.remaining < remainingHeaderSize + 19) {
          reader.seek(brushEnd);
          imageIndex++;
          continue;
        }

        // Skip remaining header
        reader.skip(remainingHeaderSize);

        // Read bounds: top, left, bottom, right
        const top = reader.readUInt32BE();
        const left = reader.readUInt32BE();
        const bottom = reader.readUInt32BE();
        const right = reader.readUInt32BE();

        const width = right - left;
        const height = bottom - top;

        if (width <= 0 || height <= 0 || width > 10000 || height > 10000) {
          reader.seek(brushEnd);
          imageIndex++;
          continue;
        }

        // Bit depth (2 bytes)
        const depth = reader.readUInt16BE();

        // Compression type (1 byte): 0 = raw, 1 = RLE
        const compression = reader.readUInt8();

        // Validate depth and compression
        if ((depth !== 8 && depth !== 16) || (compression !== 0 && compression !== 1)) {
          reader.seek(brushEnd);
          imageIndex++;
          continue;
        }

        // Generate a sample ID for matching with descriptors
        const brushId = `sample_${imageIndex}`;

        // Read image data
        const imageData = new Uint8Array(width * height);

        if (compression === 0) {
          // Uncompressed grayscale
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              if (depth === 8) {
                imageData[y * width + x] = reader.readUInt8();
              } else if (depth === 16) {
                imageData[y * width + x] = reader.readUInt16BE() >> 8;
              }
            }
          }
        } else if (compression === 1) {
          // RLE compressed
          const rowByteCounts: number[] = [];
          for (let y = 0; y < height; y++) {
            rowByteCounts.push(reader.readUInt16BE());
          }

          // Decompress each row
          for (let y = 0; y < height; y++) {
            let x = 0;
            const rowEnd = reader.position + rowByteCounts[y];

            while (x < width && reader.position < rowEnd) {
              const count = reader.readInt8();

              if (count >= 0) {
                const numValues = count + 1;
                for (let i = 0; i < numValues && x < width; i++) {
                  if (depth === 8) {
                    imageData[y * width + x++] = reader.readUInt8();
                  } else if (depth === 16) {
                    imageData[y * width + x++] = reader.readUInt16BE() >> 8;
                  }
                }
              } else if (count > -128) {
                const numRepeat = 1 - count;
                let value: number;
                if (depth === 8) {
                  value = reader.readUInt8();
                } else {
                  value = reader.readUInt16BE() >> 8;
                }
                for (let i = 0; i < numRepeat && x < width; i++) {
                  imageData[y * width + x++] = value;
                }
              }
            }

            reader.seek(rowEnd);
          }
        }

        const brushImage: BrushTipImage = {
          width,
          height,
          depth,
          data: imageData,
        };

        // Store by sample index
        images.set(brushId, brushImage);

        // Also store by UUID if we extracted one
        if (uuid && uuid.length > 0) {
          images.set(uuid, brushImage);
        }

      } catch (err) {
        // Skip this brush sample on error
      }

      reader.seek(brushEnd);
      imageIndex++;
    }

    return images;
  }

  /**
   * Parse a descriptor block containing brush settings
   */
  private parseDescriptorBlock(data: Uint8Array, images: Map<string, BrushTipImage>, startIndex: number): Brush[] {
    const reader = new BinaryReader(data);
    const brushes: Brush[] = [];

    // Descriptor block starts with version (4 bytes)
    const version = reader.readUInt32BE();

    // Parse the main descriptor
    const parser = new DescriptorParser(reader);

    try {
      const desc = parser.parseDescriptor();

      // Extract brush list from the 'Brsh' key which contains VlLs
      const brushList = this.extractBrushList(desc);

      // Track which samples have been used (for fallback index-based matching)
      let sampleIndex = 0;

      for (let i = 0; i < brushList.length; i++) {
        const brushDesc = brushList[i];
        try {
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

          const brush = this.createBrush(brushDesc, images, isSampledBrush ? sampleIndex : -1, startIndex + i, isComputedBrush, sampledDataUuid);
          if (brush) {
            brushes.push(brush);
            if (isSampledBrush) {
              sampleIndex++;
            }
          }
        } catch (err) {
          console.error('Error creating brush:', err);
        }
      }
    } catch (err) {
      console.error('Error parsing descriptor:', err);
    }

    return brushes;
  }

  /**
   * Extract brush list from descriptor
   */
  private extractBrushList(desc: Record<string, DescriptorValue>): Record<string, DescriptorValue>[] {
    const result: Record<string, DescriptorValue>[] = [];

    const brsh = desc['Brsh'];

    if (brsh && brsh.type === 'VlLs') {
      for (const item of brsh.value) {
        if (item.type === 'Objc') {
          result.push(item.value);
        }
      }
      return result;
    }

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

    if (result.length === 0 && Object.keys(desc).length > 0) {
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
    let id = getString(desc, 'Idnt') || getString(desc, 'uuid') || '';
    if (!id) {
      id = `brush_${brushIndex}`;
    }

    let name = getString(desc, 'Nm  ') || getString(desc, 'name') || 'Unnamed Brush';

    const brushDef = getObject(desc, 'Brsh');

    // Determine brush type
    // If forceComputedType is set, use computed; if sampleIndex >= 0, use sampled
    let type: 'computed' | 'sampled' = forceComputedType ? 'computed' : (sampleIndex >= 0 ? 'sampled' : 'computed');
    let diameter: number | undefined;
    let hardness: number | undefined;
    let angle: number | undefined;
    let roundness: number | undefined;
    let spacing: number | undefined;
    let finalSampledDataUuid: string | undefined = sampledDataUuid || undefined;

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

      diameter = getNumber(brushDef, 'Dmtr');
      hardness = getNumber(brushDef, 'Hrdn');
      angle = getNumber(brushDef, 'Angl');
      roundness = getNumber(brushDef, 'Rndn');
      spacing = getNumber(brushDef, 'Spcn');
      
      // Get sampledData UUID if not already provided
      if (!finalSampledDataUuid) {
        const sampledDataVal = brushDef['sampledData'];
        if (sampledDataVal && sampledDataVal.type === 'TEXT') {
          finalSampledDataUuid = sampledDataVal.value as string;
        }
      }
    }

    if (diameter === undefined) diameter = getNumber(desc, 'Dmtr');
    if (hardness === undefined) hardness = getNumber(desc, 'Hrdn');
    if (angle === undefined) angle = getNumber(desc, 'Angl');
    if (roundness === undefined) roundness = getNumber(desc, 'Rndn');
    if (spacing === undefined) spacing = getNumber(desc, 'Spcn');

    if (spacing === undefined) spacing = 25;

    let brushTip: BrushTipImage | undefined;
    let imageDataUrl: string | undefined;

    // First, try to find the main brush tip by UUID from sampledDataUuid
    if (finalSampledDataUuid && images.has(finalSampledDataUuid)) {
      brushTip = images.get(finalSampledDataUuid);
    }

    // Fallback to sample index if UUID lookup didn't work
    if (!brushTip && sampleIndex >= 0 && images.has(`sample_${sampleIndex}`)) {
      brushTip = images.get(`sample_${sampleIndex}`);
    }

    if (this.options.generateDataUrls && brushTip) {
      imageDataUrl = this.brushTipToDataUrl(brushTip);
    }

    // Check for dual brush and get its image if available
    let dualBrushTip: BrushTipImage | undefined;
    let dualBrushImageDataUrl: string | undefined;

    const dualBrush = getObject(desc, 'dualBrush');
    if (dualBrush) {
      const dualBrushDef = getObject(dualBrush as unknown as Record<string, DescriptorValue>, 'Brsh');
      if (dualBrushDef) {
        // Try to find the dual brush image by UUID
        const sampledDataVal = dualBrushDef['sampledData'];
        if (sampledDataVal) {
          let dualBrushUuid: string | undefined;
          if (sampledDataVal.type === 'TEXT') {
            dualBrushUuid = sampledDataVal.value as string;
          } else if (typeof sampledDataVal === 'string') {
            dualBrushUuid = sampledDataVal;
          }
          if (dualBrushUuid && images.has(dualBrushUuid)) {
            dualBrushTip = images.get(dualBrushUuid);
            if (this.options.generateDataUrls && dualBrushTip) {
              dualBrushImageDataUrl = this.brushTipToDataUrl(dualBrushTip);
            }
          }
        }
      }
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
      sampledDataUuid: finalSampledDataUuid,
      imageDataUrl,
      dualBrushTip: this.options.extractImages ? dualBrushTip : undefined,
      dualBrushImageDataUrl,
      settings: this.options.includeRawSettings ? this.flattenDescriptor(desc) : {},
    };

    return brush;
  }

  /**
   * Convert brush tip to PNG data URL for browser display
   * Renders as white brush stroke on transparent background for visibility on dark UI
   */
  brushTipToDataUrl(brushTip: BrushTipImage): string {
    const { width, height, data } = brushTip;

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Create ImageData
    const imageData = ctx.createImageData(width, height);

    // Convert grayscale to RGBA
    // In ABR format: grayscale value represents brush opacity directly
    // 255 = fully opaque brush, 0 = transparent
    // We render as white brush on transparent background for visibility on dark UI
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = y * width + x;
        const dstIdx = (y * width + x) * 4;

        const gray = data[srcIdx];

        // Render as white brush with grayscale as alpha
        imageData.data[dstIdx] = 255;     // R
        imageData.data[dstIdx + 1] = 255; // G
        imageData.data[dstIdx + 2] = 255; // B
        imageData.data[dstIdx + 3] = gray; // A (grayscale = opacity)
      }
    }

    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL('image/png');
  }

  /**
   * Flatten descriptor to plain object for JSON output
   */
  private flattenDescriptor(desc: Record<string, DescriptorValue>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

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
      case 'Objc':
        // Preserve classId for proper serialization
        return {
          __classId: value.classId,
          ...this.flattenDescriptor(value.value)
        };
      case 'VlLs':
        return value.value.map(v => this.flattenValue(v));
      case 'tdta':
        return `<binary data: ${value.value.length} bytes>`;
      default:
        return null;
    }
  }
}

/**
 * Convert brush tip to PNG Blob for download
 * Downloads as white brush on transparent background
 */
export function brushTipToPngBlob(brushTip: BrushTipImage): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { width, height, data } = brushTip;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const imageData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = y * width + x;
        const dstIdx = (y * width + x) * 4;

        const gray = data[srcIdx];

        // White brush with grayscale as alpha
        imageData.data[dstIdx] = 255;
        imageData.data[dstIdx + 1] = 255;
        imageData.data[dstIdx + 2] = 255;
        imageData.data[dstIdx + 3] = gray;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create blob'));
      }
    }, 'image/png');
  });
}
