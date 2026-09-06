/**
 * ABR (Photoshop Brush) File Writer - Browser Compatible
 * Creates ABR files from brush data (v6.2 format)
 */

import { BinaryWriter } from './binary-writer';
import { DescriptorSerializer, makeDescriptor } from './descriptor-serializer';
import { AbrFile, Brush, BrushTipImage, DescriptorValue } from './types';

const PHOTOSHOP_SIGNATURE = '8BIM';
const SAMPLE_KEY = 'samp';
const DESCRIPTOR_KEY = 'desc';

/**
 * Generate a UUID v4 (browser compatible)
 */
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface WriteOptions {
  /** ABR major version (default: 6) */
  version?: number;
  /** ABR minor version (default: 2) */
  subVersion?: number;
  /** Use RLE compression for images (default: true) */
  useRleCompression?: boolean;
}

export class AbrWriter {
  private options: Required<WriteOptions>;

  constructor(options: WriteOptions = {}) {
    this.options = {
      version: options.version ?? 6,
      subVersion: options.subVersion ?? 2,
      useRleCompression: options.useRleCompression ?? true,
    };
  }

  /**
   * Generate ABR file as a Uint8Array
   */
  write(abrFile: AbrFile): Uint8Array {
    const writer = new BinaryWriter();

    // Write version header
    writer.writeUInt16BE(this.options.version);
    writer.writeUInt16BE(this.options.subVersion);

    // Collect brushes with tips for sample block
    const sampledBrushes = abrFile.brushes.filter(b => b.brushTip && b.type === 'sampled');
    
    // Generate or preserve UUIDs for brushes
    const brushUuids = new Map<string, string>();
    for (const brush of sampledBrushes) {
      // Use the preserved sampledDataUuid if available, otherwise generate new
      const uuid = brush.sampledDataUuid || generateUuid();
      brushUuids.set(brush.id, uuid);
    }

    // Write sample block - preserve raw data if available (for Photoshop compatibility)
    if (abrFile.rawSampleData && abrFile.rawSampleData.length > 0) {
      // Use preserved raw sample data for perfect round-trip
      this.writeResourceBlock(writer, SAMPLE_KEY, abrFile.rawSampleData);
    } else if (sampledBrushes.length > 0) {
      // Generate new sample data
      const sampleData = this.writeSampleBlock(sampledBrushes, brushUuids);
      this.writeResourceBlock(writer, SAMPLE_KEY, sampleData);
    } else {
      // Write empty samp block for compatibility
      this.writeResourceBlock(writer, SAMPLE_KEY, new Uint8Array(0));
    }
    
    // Write pattern block - preserve raw data if available, otherwise write empty
    if (abrFile.rawPatternData && abrFile.rawPatternData.length > 0) {
      this.writeResourceBlock(writer, 'patt', abrFile.rawPatternData);
    } else {
      // Write empty patt block for compatibility
      this.writeResourceBlock(writer, 'patt', new Uint8Array(0));
    }

    // Write descriptor block with brush settings
    const descriptorData = this.writeDescriptorBlock(abrFile.brushes, brushUuids);
    this.writeResourceBlock(writer, DESCRIPTOR_KEY, descriptorData);

    return writer.toBuffer();
  }

  /**
   * Generate ABR file and trigger download
   */
  download(abrFile: AbrFile, filename: string = 'brushes.abr'): void {
    const buffer = this.write(abrFile);
    // Create a new ArrayBuffer and copy data to avoid SharedArrayBuffer issues
    const arrayBuffer = new ArrayBuffer(buffer.length);
    new Uint8Array(arrayBuffer).set(buffer);
    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.abr') ? filename : `${filename}.abr`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Write a resource block (8BIM format)
   */
  private writeResourceBlock(writer: BinaryWriter, key: string, data: Uint8Array): void {
    writer.writeString(PHOTOSHOP_SIGNATURE, 4);
    writer.writeString(key, 4);
    writer.writeUInt32BE(data.length);
    writer.writeBytes(data);
    // Note: ABR format does not use padding after resource blocks
  }

  /**
   * Write sample block containing brush tip images
   */
  private writeSampleBlock(brushes: Brush[], uuids: Map<string, string>): Uint8Array {
    const writer = new BinaryWriter();

    for (const brush of brushes) {
      if (!brush.brushTip) continue;

      const uuid = uuids.get(brush.id) || generateUuid();
      const sampleWriter = new BinaryWriter();

      // Write UUID (37 chars with leading '$' + null = 38 bytes)
      const uuidString = '$' + uuid;
      sampleWriter.writeString(uuidString, 37);
      sampleWriter.writeUInt8(0); // null terminator

      // Write header padding (263 bytes for subversion 2)
      const headerSize = this.options.subVersion === 1 ? 10 : 263;
      sampleWriter.writePadding(headerSize);

      // Write image bounds (top, left, bottom, right)
      const { width, height } = brush.brushTip;
      sampleWriter.writeUInt32BE(0);        // top
      sampleWriter.writeUInt32BE(0);        // left
      sampleWriter.writeUInt32BE(height);   // bottom
      sampleWriter.writeUInt32BE(width);    // right

      // Write depth (8-bit grayscale)
      sampleWriter.writeUInt16BE(8);

      // Write compression type
      const useRle = this.options.useRleCompression;
      sampleWriter.writeUInt8(useRle ? 1 : 0);

      // Write image data
      if (useRle) {
        this.writeRleCompressedImage(sampleWriter, brush.brushTip);
      } else {
        sampleWriter.writeBytes(brush.brushTip.data);
      }

      // Write sample length and data
      const sampleData = sampleWriter.toBuffer();
      writer.writeUInt32BE(sampleData.length);
      writer.writeBytes(sampleData);

      // Pad to 4-byte boundary
      const padding = (4 - (sampleData.length % 4)) % 4;
      if (padding > 0) {
        writer.writePadding(padding);
      }
    }

    return writer.toBuffer();
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
      while (i + runLength < data.length && 
             data[i + runLength] === data[i] && 
             runLength < 128) {
        runLength++;
      }

      if (runLength > 2) {
        // Encode as a run: -(runLength - 1), value
        result.push(256 - runLength + 1);
        result.push(data[i]);
        i += runLength;
      } else {
        // Look for literal sequence
        let literalLength = 1;
        while (i + literalLength < data.length && literalLength < 128) {
          if (i + literalLength + 2 < data.length &&
              data[i + literalLength] === data[i + literalLength + 1] &&
              data[i + literalLength] === data[i + literalLength + 2]) {
            break;
          }
          literalLength++;
        }

        // Encode as literal
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
  private writeDescriptorBlock(brushes: Brush[], uuids: Map<string, string>): Uint8Array {
    const writer = new BinaryWriter();

    // Write descriptor version
    writer.writeUInt32BE(16);

    // Build the brush list descriptor
    const brushList: DescriptorValue[] = [];

    for (const brush of brushes) {
      const brushDesc = this.createBrushDescriptor(brush, uuids.get(brush.id));
      // Use 'brushPreset' as classId, empty className for Photoshop compatibility
      brushList.push(makeDescriptor.obj('brushPreset', brushDesc, ''));
    }

    // Create the root descriptor
    const rootDesc: Record<string, DescriptorValue> = {
      'Brsh': makeDescriptor.list(brushList),
    };

    // Serialize the descriptor
    const serializer = new DescriptorSerializer(writer);
    serializer.serializeDescriptor(rootDesc, '', 'null');

    return writer.toBuffer();
  }

  /**
   * Create a descriptor for a single brush
   */
  private createBrushDescriptor(brush: Brush, uuid?: string): Record<string, DescriptorValue> {
    const desc: Record<string, DescriptorValue> = {};

    // Brush name
    desc['Nm  '] = makeDescriptor.text(brush.name);

    // Brush definition - use proper class names for Photoshop compatibility
    const brushClassName = brush.type === 'computed' ? 'computedBrush' : 'sampledBrush';

    // Start with the original Brsh structure if available to preserve property order
    let brushDef: Record<string, DescriptorValue> = {};
    
    if (brush.settings?.['Brsh'] && typeof brush.settings['Brsh'] === 'object') {
      // Copy original Brsh properties in their original order
      const originalBrsh = brush.settings['Brsh'] as Record<string, unknown>;
      for (const [key, value] of Object.entries(originalBrsh)) {
        if (key === '__classId') continue; // Skip metadata field
        const converted = this.convertToDescriptorValue(value);
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

    desc['Brsh'] = makeDescriptor.obj(brushClassName, brushDef, '');

    // Include other settings from the original brush if available
    if (brush.settings) {
      this.mergeSettings(desc, brush.settings);
    }

    return desc;
  }

  /**
   * Merge original settings back into descriptor
   */
  private mergeSettings(desc: Record<string, DescriptorValue>, settings: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(settings)) {
      if (key === 'Nm  ' || key === 'Brsh' || key === '__classId') continue;
      
      const converted = this.convertToDescriptorValue(value);
      if (converted && !desc[key]) {
        desc[key] = converted;
      }
    }
  }

  /**
   * Convert a plain value back to DescriptorValue
   */
  private convertToDescriptorValue(value: unknown): DescriptorValue | null {
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
      for (const item of value) {
        const converted = this.convertToDescriptorValue(item);
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
      const classId = (obj.__classId as string) || 'null';
      const items: Record<string, DescriptorValue> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === '__classId') continue; // Skip the metadata field
        const converted = this.convertToDescriptorValue(v);
        if (converted) items[k] = converted;
      }
      return makeDescriptor.obj(classId, items);
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
    settings: {},
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
    errors: [],
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
    data,
  };
}

/**
 * Create brush tip from a canvas element (converts to grayscale)
 */
export function createBrushTipFromCanvas(canvas: HTMLCanvasElement): BrushTipImage {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const grayscale = new Uint8Array(canvas.width * canvas.height);
  
  // Convert RGBA to grayscale (using luminosity method weighted by alpha)
  for (let i = 0; i < grayscale.length; i++) {
    const r = imageData.data[i * 4];
    const g = imageData.data[i * 4 + 1];
    const b = imageData.data[i * 4 + 2];
    const a = imageData.data[i * 4 + 3];
    
    // For brush tips, darker = more opaque paint
    // We invert and use alpha to determine brush opacity
    const luminosity = 0.299 * r + 0.587 * g + 0.114 * b;
    // Invert and apply alpha
    grayscale[i] = Math.round((255 - luminosity) * (a / 255));
  }
  
  return {
    width: canvas.width,
    height: canvas.height,
    depth: 8,
    data: grayscale,
  };
}

/**
 * Create brush tip from an Image element
 */
export async function createBrushTipFromImage(img: HTMLImageElement, maxSize: number = 1024): Promise<BrushTipImage> {
  // Scale down if needed
  let width = img.width;
  let height = img.height;
  
  if (width > maxSize || height > maxSize) {
    const scale = maxSize / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  
  ctx.drawImage(img, 0, 0, width, height);
  
  return createBrushTipFromCanvas(canvas);
}
