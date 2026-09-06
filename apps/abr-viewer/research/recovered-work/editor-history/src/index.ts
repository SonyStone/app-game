/**
 * ABR Parser - Main Entry Point
 * 
 * A TypeScript library for parsing and writing Photoshop ABR brush files.
 * Extracts and creates brush settings and brush tip images.
 */

export { AbrParser } from './abr-parser';
export { AbrWriter, createBrush, createAbrFile, createBrushTip } from './abr-writer';
export type { WriteOptions } from './abr-writer';
export { ImageExporter } from './image-exporter';
export { BinaryReader } from './binary-reader';
export { BinaryWriter } from './binary-writer';
export { DescriptorParser } from './descriptor-parser';
export { DescriptorSerializer, makeDescriptor } from './descriptor-serializer';
export * from './types';
