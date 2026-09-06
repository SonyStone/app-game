# ABR Parser

A TypeScript library for parsing Adobe Photoshop brush files (.abr) and extracting brush settings and brush tip images.

## Features

- **Parse ABR files** (v6+, v9, v10 formats)
- **Extract brush settings** including:
  - Name, spacing, diameter, angle, roundness
  - Tip dynamics (size, opacity, flow jitter)
  - Scatter settings
  - Dual brush settings
  - Color dynamics
  - Transfer settings (opacity, flow)
- **Export brush tip images** as PNG files
- **JSON output** with all brush metadata

## Installation

```bash
npm install
```

## Usage

### Command Line

```bash
# Parse a single ABR file
npx ts-node src/cli.ts path/to/brushes.abr

# Output directory (default: ./output)
npx ts-node src/cli.ts path/to/brushes.abr --output ./my-output
```

### Programmatic API

```typescript
import { AbrParser, ImageExporter } from './src';

// Parse an ABR file
const parser = new AbrParser();
const result = parser.parseFile('path/to/brushes.abr');

console.log(`Found ${result.brushes.length} brushes`);

for (const brush of result.brushes) {
  console.log(`- ${brush.name}: ${brush.diameter}px, ${brush.spacing}% spacing`);
  
  if (brush.brushTip) {
    console.log(`  Tip: ${brush.brushTip.width}x${brush.brushTip.height}px`);
  }
}

// Export brush tip images
const exporter = new ImageExporter();
const { exported, errors } = exporter.exportBrushImages(result, 'output/brushes');
console.log(`Exported ${exported.length} images`);
```

## Output Format

### JSON Structure

```json
{
  "file": "brushes.abr",
  "version": 6,
  "subVersion": 2,
  "brushCount": 14,
  "errors": [],
  "brushes": [
    {
      "id": "brush_0",
      "name": "My Brush",
      "type": "sampled",
      "spacing": 25,
      "diameter": 100,
      "angle": 0,
      "roundness": 100,
      "hardness": 50,
      "hasBrushTip": true,
      "brushTipSize": {
        "width": 256,
        "height": 256
      },
      "settings": {
        // Full descriptor data
      }
    }
  ]
}
```

### PNG Images

Brush tip images are exported as grayscale PNG files in the format:
`{BrushName}_brush_{index}.png`

## Supported ABR Versions

| Version | Support |
|---------|---------|
| 1-5 | ❌ Legacy format, not supported |
| 6.x | ✅ Full support |
| 9.x | ✅ Full support |
| 10.x | ✅ Full support |

## Brush Types

The parser handles two types of brushes:

1. **Sampled Brushes** - Have a bitmap brush tip image
2. **Computed Brushes** - Generated mathematically (e.g., hard/soft round)

Computed brushes won't have exported images since they're defined by parameters (diameter, hardness, etc.) rather than bitmaps.

## API Reference

### AbrParser

```typescript
class AbrParser {
  constructor(options?: ParseOptions);
  parseFile(filePath: string): AbrFile;
  parse(buffer: Buffer): AbrFile;
}

type ParseOptions {
  extractImages?: boolean;      // Default: true
  includeRawSettings?: boolean; // Default: true
  continueOnError?: boolean;    // Default: true
}
```

### ImageExporter

```typescript
class ImageExporter {
  exportBrushImages(abrFile: AbrFile, outputDir: string): ExportResult;
  brushToPng(brush: Brush): Buffer | null;
}
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npx ts-node src/cli.ts files/MainBrushes.abr

# Build (optional)
npx tsc
```

## License

MIT
