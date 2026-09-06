/**
 * ABR Parser - Main Entry Point
 *
 * A TypeScript library for parsing and writing Photoshop ABR brush files.
 * Extracts and creates brush settings and brush tip images.
 */

export { AbrParser, AbrWriter } from './node';
export { createAbrFile, createBrush, createBrushTip } from './abr-writer';
export type { WriteOptions } from './abr-writer';
export { BinaryReader } from './binary-reader';
export { BinaryWriter } from './binary-writer';
export * from './descriptor-keys';
export { DescriptorParser } from './descriptor-parser';
export { DescriptorSerializer, makeDescriptor } from './descriptor-serializer';
export { ImageExporter } from './image-exporter';
export * from './types';
