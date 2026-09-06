#!/usr/bin/env node
/**
 * ABR Parser CLI
 * Command-line tool to parse ABR files and export brush data
 */

import * as fs from 'fs';
import * as path from 'path';
import { AbrParser } from './abr-parser';
import { ImageExporter } from './image-exporter';
import { AbrFile } from './types';

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('ABR Parser - Photoshop Brush File Parser');
    console.log('Usage: ts-node cli.ts <abr-file> [output-dir]');
    console.log('');
    console.log('Options:');
    console.log('  <abr-file>   Path to .abr file to parse');
    console.log('  [output-dir] Directory to export images (default: ./output)');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputDir = args[1] || './output';

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  console.log(`Parsing: ${inputFile}`);
  console.log('');

  const parser = new AbrParser({
    extractImages: true,
    includeRawSettings: true,
    continueOnError: true,
  });

  // Read file and parse
  const fileBuffer = fs.readFileSync(inputFile);
  const result = parser.parse(fileBuffer);

  // Print summary
  printSummary(result, inputFile);

  // Export brush data to JSON
  const jsonOutput = {
    file: path.basename(inputFile),
    version: result.version,
    subVersion: result.subVersion,
    brushCount: result.brushes.length,
    errors: result.errors,
    brushes: result.brushes.map(brush => ({
      id: brush.id,
      name: brush.name,
      type: brush.type,
      spacing: brush.spacing,
      diameter: brush.diameter,
      hardness: brush.hardness,
      angle: brush.angle,
      roundness: brush.roundness,
      hasBrushTip: !!brush.brushTip,
      brushTipSize: brush.brushTip 
        ? { width: brush.brushTip.width, height: brush.brushTip.height }
        : null,
      settings: brush.settings,
    })),
  };

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write JSON output
  const baseName = path.basename(inputFile, '.abr');
  const jsonPath = path.join(outputDir, `${baseName}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`JSON output: ${jsonPath}`);

  // Export brush tip images
  const exporter = new ImageExporter(path.join(outputDir, baseName));
  let exportedCount = 0;
  let failedCount = 0;

  for (const brush of result.brushes) {
    if (brush.brushTip) {
      const exportResult = exporter.exportBrushTip(brush);
      if (exportResult.success) {
        exportedCount++;
        console.log(`  Exported: ${exportResult.filePath}`);
      } else {
        failedCount++;
        console.log(`  Failed to export ${brush.name}: ${exportResult.error}`);
      }
    }
  }

  console.log('');
  console.log(`Images exported: ${exportedCount}`);
  if (failedCount > 0) {
    console.log(`Images failed: ${failedCount}`);
  }
}

function printSummary(result: AbrFile, filePath: string) {
  console.log('='.repeat(60));
  console.log('ABR FILE SUMMARY');
  console.log('='.repeat(60));
  console.log(`File: ${path.basename(filePath)}`);
  console.log(`Version: ${result.version}.${result.subVersion}`);
  console.log(`Brushes found: ${result.brushes.length}`);
  console.log('');

  if (result.errors.length > 0) {
    console.log('Warnings/Errors:');
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
    console.log('');
  }

  if (result.brushes.length > 0) {
    console.log('Brushes:');
    console.log('-'.repeat(60));
    
    for (let i = 0; i < result.brushes.length; i++) {
      const brush = result.brushes[i];
      console.log(`${i + 1}. ${brush.name}`);
      console.log(`   Type: ${brush.type}`);
      console.log(`   Spacing: ${brush.spacing}%`);
      if (brush.diameter !== undefined) console.log(`   Diameter: ${brush.diameter}px`);
      if (brush.hardness !== undefined) console.log(`   Hardness: ${brush.hardness}%`);
      if (brush.brushTip) {
        console.log(`   Brush Tip: ${brush.brushTip.width}x${brush.brushTip.height}px`);
      }
      console.log('');
    }
  }

  console.log('='.repeat(60));
  console.log('');
}

main();
