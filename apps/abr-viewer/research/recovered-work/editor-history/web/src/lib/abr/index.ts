/**
 * ABR Parser - Browser Edition
 * Re-exports the core parser and adds browser-specific utilities.
 */

// Re-export everything from the core package
export {
  AbrParser,
  AbrWriter,
  BinaryReader,
  BinaryWriter,
  DescriptorParser,
  DescriptorSerializer,
  makeDescriptor,
  createBrush,
  createAbrFile,
  createBrushTip,
} from 'abr-parser';

// Re-export core types (can be extended by browser types)
export type {
  Brush,
  AbrFile,
  BrushTipImage,
  BrushDynamics,
  DynamicControl,
  ParseOptions,
  ExportResult,
  DescriptorValue,
  Pattern,
  ResourceBlock,
} from 'abr-parser';

export type { WriteOptions } from 'abr-parser';

// Browser-specific utilities
export {
  brushTipToPngBlob,
  brushTipToDataUrl,
  createBrushTipFromCanvas,
  createBrushTipFromImage,
  downloadAbrFile,
} from './browser-utils';

// Browser-specific extended types
export type { BrushWithPreview, AbrFileWithMeta } from './browser-utils';
