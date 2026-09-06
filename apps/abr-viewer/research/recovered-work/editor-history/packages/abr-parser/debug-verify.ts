import { AbrParser } from './src/abr-parser';
import { AbrWriter } from './src/abr-writer';
import * as fs from 'fs';

// Use parse() with buffer instead of parseFile() to avoid require() issues
const parser = new AbrParser({ includeRawSettings: true });
const originalData = fs.readFileSync('./files/Brushes To Implement.abr');
const original = parser.parse(originalData);

console.log('=== Original file ===');
console.log('Brushes:', original.brushes.length);
console.log('Has rawHierarchyData:', !!original.rawHierarchyData, original.rawHierarchyData?.length, 'bytes');
console.log('Hierarchy items:', original.hierarchy?.length ?? 0);
if (original.hierarchy) {
  for (const item of original.hierarchy) {
    const indent = item.type === 'groupEnd' ? '  ' : item.type === 'preset' ? '    ' : '';
    console.log(`  ${indent}${item.type}${item.name ? ': "' + item.name + '"' : ''}${item.uuid ? ' (uuid: ' + item.uuid + ')' : ''}`);
  }
}

// Roundtrip
const writer = new AbrWriter();
const buffer = writer.write(original);
const outputPath = './test-output/roundtrip-Brushes To Implement.abr';
fs.writeFileSync(outputPath, buffer);

// Re-parse roundtrip
const reparsedData = fs.readFileSync(outputPath);
const reparsed = parser.parse(reparsedData);
console.log('\n=== Roundtrip file ===');
console.log('Brushes:', reparsed.brushes.length);
console.log('Has rawHierarchyData:', !!reparsed.rawHierarchyData, reparsed.rawHierarchyData?.length, 'bytes');
console.log('Hierarchy items:', reparsed.hierarchy?.length ?? 0);
if (reparsed.hierarchy) {
  for (const item of reparsed.hierarchy) {
    const indent = item.type === 'groupEnd' ? '  ' : item.type === 'preset' ? '    ' : '';
    console.log(`  ${indent}${item.type}${item.name ? ': "' + item.name + '"' : ''}${item.uuid ? ' (uuid: ' + item.uuid + ')' : ''}`);
  }
}

// Compare
console.log('\n=== Comparison ===');
console.log('Original hierarchy raw bytes:', original.rawHierarchyData?.length ?? 0);
console.log('Roundtrip hierarchy raw bytes:', reparsed.rawHierarchyData?.length ?? 0);
console.log('Hierarchy match:', JSON.stringify(original.hierarchy) === JSON.stringify(reparsed.hierarchy));
console.log('Errors:', reparsed.errors);
