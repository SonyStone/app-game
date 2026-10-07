import { newClipboardItem, writeClipboard } from '@solid-primitives/clipboard';

import type { ExportFormat } from './types';

interface ExportDimensions {
  readonly width: number;
  readonly height: number;
  readonly viewBox: readonly [number, number, number, number];
}

/** Export settings like GodSVG's export dialog. */
export type ExportOptions = {
  readonly format: ExportFormat;
  /** Multiplier for the document size; raster sizes are capped at `maxRasterSize` per side. */
  readonly scale: number;
  /** Raster background, or `undefined` for transparent (JPG falls back to white, it has no alpha). */
  readonly background: string | undefined;
  /** JPG and lossy WebP quality, 0–1 (GodSVG default 0.75). */
  readonly quality: number;
  /** WebP is lossless unless this is set, as in GodSVG. */
  readonly lossyWebp: boolean;
};

/** Largest raster side the browser canvas reliably supports. */
export const maxRasterSize = 16384;

/** Saves a file through a temporary link; the object URL is released after the download has started. */
export function downloadBlob(content: BlobPart, filename: string, type: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The export file name: the tab's name with the format's extension (`Tiger.svg` → `Tiger.png`). */
export function exportFileName(tabName: string, format: ExportFormat): string {
  const base = tabName.replace(/\.[^./\\]+$/, '') || 'image';
  return `${base}.${format === 'jpeg' ? 'jpg' : format}`;
}

/** Raster size in pixels for a scale, capped at `maxRasterSize` per side. */
export function rasterSize(dimensions: ExportDimensions, scale: number): { readonly width: number; readonly height: number } {
  return {
    width: Math.min(maxRasterSize, Math.max(1, Math.round(dimensions.width * scale))),
    height: Math.min(maxRasterSize, Math.max(1, Math.round(dimensions.height * scale)))
  };
}

/** Encodes the export: the SVG text itself, or a raster image rendered by the browser. */
export async function renderExport(svgText: string, dimensions: ExportDimensions, options: ExportOptions): Promise<Blob> {
  if (options.format === 'svg') {
    return new Blob([svgText], { type: 'image/svg+xml' });
  }

  return rasterizeSvg(svgText, dimensions, options);
}

export async function exportFile(svgText: string, dimensions: ExportDimensions, options: ExportOptions, fileName: string): Promise<void> {
  const blob = await renderExport(svgText, dimensions, options);
  downloadBlob(blob, fileName, blob.type);
}

export async function copyExport(svgText: string, dimensions: ExportDimensions, options: ExportOptions): Promise<void> {
  if (options.format === 'svg') {
    await writeClipboard(svgText);
    return;
  }

  const blob = await rasterizeSvg(svgText, dimensions, options);
  await writeClipboard([newClipboardItem(blob.type, blob)]);
}

async function rasterizeSvg(svgText: string, dimensions: ExportDimensions, options: ExportOptions): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));

  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const size = rasterSize(dimensions, options.scale);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas is unavailable');
    }

    const background = options.format === 'jpeg' ? (options.background ?? '#ffffff') : options.background;

    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const mime = options.format === 'jpeg' ? 'image/jpeg' : `image/${options.format}`;
    // Chromium writes lossless WebP at quality 1.
    const quality = options.format === 'webp' && !options.lossyWebp ? 1 : options.quality;

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Raster export failed'))), mime, quality);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
