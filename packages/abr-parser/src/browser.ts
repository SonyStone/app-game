/**
 * ABR Parser - Browser Entry Point
 *
 * This entry point excludes Node.js-only modules (ImageExporter, fs operations)
 * for use in browser environments.
 */

export { AbrParser } from './abr-parser';
export { AbrWriter, createAbrFile, createBrush, createBrushTip } from './abr-writer';
export type { WriteOptions } from './abr-writer';
export { BinaryReader } from './binary-reader';
export { BinaryWriter } from './binary-writer';
export { DescriptorParser } from './descriptor-parser';
export { DescriptorSerializer, makeDescriptor } from './descriptor-serializer';
export * from './types';
