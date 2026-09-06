/**
 * ABR Parser - Browser Edition
 * Re-exports the core parser and adds browser-specific utilities.
 */

// Re-export everything from the browser-safe package (excludes Node.js-only modules)
export {
  AbrParser,
  AbrWriter,
  BinaryReader,
  BinaryWriter,
  DescriptorParser,
  DescriptorSerializer,
  createAbrFile,
  createBrush,
  createBrushTip,
  makeDescriptor
} from '@app-game/abr-parser/browser';

// Re-export core types (can be extended by browser types)
export type {
  AbrFile,
  Brush,
  BrushDynamics,
  BrushTipImage,
  DescriptorValue,
  DynamicControl,
  ExportResult,
  ParseOptions,
  Pattern,
  ResourceBlock
} from '@app-game/abr-parser/browser';

export type { WriteOptions } from '@app-game/abr-parser/browser';

// Browser-specific utilities
export {
  brushTipToDataUrl,
  brushTipToPngBlob,
  createBrushTipFromCanvas,
  createBrushTipFromImage,
  downloadAbrFile
} from './browser-utils';

// Browser-specific extended types
export type { AbrFileWithMeta, BrushWithPreview } from './browser-utils';
