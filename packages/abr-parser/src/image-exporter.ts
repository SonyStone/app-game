/**
 * Image Exporter - Export brush tips to PNG files
 */

import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import { Brush, BrushTipImage, ExportResult } from './types';

export class ImageExporter {
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /**
   * Ensure output directory exists
   */
  private ensureDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Export a single brush tip image to PNG
   */
  exportBrushTip(brush: Brush): ExportResult {
    if (!brush.brushTip) {
      return {
        success: false,
        brushId: brush.id,
        brushName: brush.name,
        error: 'No brush tip image available'
      };
    }

    try {
      this.ensureDir();

      const safeName = this.sanitizeFilename(brush.name);
      const filename = `${safeName}_${brush.id.substring(0, 8)}.png`;
      const filePath = path.join(this.outputDir, filename);

      this.writePng(filePath, brush.brushTip);

      return {
        success: true,
        brushId: brush.id,
        brushName: brush.name,
        filePath
      };
    } catch (err) {
      return {
        success: false,
        brushId: brush.id,
        brushName: brush.name,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Export all brush tips from an array of brushes
   */
  exportAllBrushTips(brushes: Brush[]): ExportResult[] {
    return brushes.map((brush) => this.exportBrushTip(brush));
  }

  /**
   * Write grayscale image data to PNG file
   */
  private writePng(filePath: string, image: BrushTipImage): void {
    const { width, height, data } = image;

    // Create PNG with RGBA format
    const png = new PNG({ width, height });

    // Convert grayscale to RGBA
    // In brush tips, lighter = less paint, darker = more paint
    // We'll output as grayscale with alpha
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = y * width + x;
        const dstIdx = (y * width + x) * 4;

        // Grayscale value (0 = black/full paint, 255 = white/no paint)
        const gray = data[srcIdx];

        // Convert to RGBA where:
        // - RGB is black (the brush color will be applied later)
        // - Alpha is inverse of grayscale (darker = more opaque)
        png.data[dstIdx] = 0; // R
        png.data[dstIdx + 1] = 0; // G
        png.data[dstIdx + 2] = 0; // B
        png.data[dstIdx + 3] = 255 - gray; // A (inverted)
      }
    }

    // Write to file
    const buffer = PNG.sync.write(png);
    fs.writeFileSync(filePath, buffer);
  }

  /**
   * Sanitize filename for filesystem
   */
  private sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 50);
  }

  /**
   * Export brush tip as PNG buffer (for web use)
   */
  static brushTipToBuffer(image: BrushTipImage): Buffer {
    const { width, height, data } = image;

    const png = new PNG({ width, height });

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = y * width + x;
        const dstIdx = (y * width + x) * 4;

        const gray = data[srcIdx];

        png.data[dstIdx] = 0;
        png.data[dstIdx + 1] = 0;
        png.data[dstIdx + 2] = 0;
        png.data[dstIdx + 3] = 255 - gray;
      }
    }

    return PNG.sync.write(png);
  }

  /**
   * Export brush tip as base64 data URL (for web use)
   */
  static brushTipToDataUrl(image: BrushTipImage): string {
    const buffer = ImageExporter.brushTipToBuffer(image);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }
}
