/**
 * Browser-specific utilities for ABR files
 * These functions use browser APIs (Canvas, Blob) and won't work in Node.js
 */

import type { Brush as CoreBrush, BrushTipImage, AbrFile as CoreAbrFile } from 'abr-parser';

/**
 * Extended Brush type with browser-specific display properties
 */
export type BrushWithPreview = CoreBrush & {
  /** Data URL for browser display of main brush tip */
  imageDataUrl?: string;
  /** Dual brush tip (if dual brush is enabled) */
  dualBrushTip?: BrushTipImage;
  /** Data URL for browser display of dual brush tip */
  dualBrushImageDataUrl?: string;
}

/**
 * Extended AbrFile type with browser-specific properties
 */
export type AbrFileWithMeta = CoreAbrFile & {
  /** Original filename */
  fileName?: string;
  /** Brushes with preview data URLs */
  brushes: BrushWithPreview[];
}

/**
 * Convert brush tip to PNG Blob for download
 * Downloads as white brush on transparent background
 */
export function brushTipToPngBlob(brushTip: BrushTipImage): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { width, height, data } = brushTip;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const imageData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = y * width + x;
        const dstIdx = (y * width + x) * 4;

        const gray = data[srcIdx];

        // White brush with grayscale as alpha
        imageData.data[dstIdx] = 255;
        imageData.data[dstIdx + 1] = 255;
        imageData.data[dstIdx + 2] = 255;
        imageData.data[dstIdx + 3] = gray;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create blob'));
      }
    }, 'image/png');
  });
}

/**
 * Create brush tip from a canvas element (converts to grayscale)
 */
export function createBrushTipFromCanvas(canvas: HTMLCanvasElement): BrushTipImage {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const grayscale = new Uint8Array(canvas.width * canvas.height);
  
  // Convert RGBA to grayscale (using luminosity method weighted by alpha)
  for (let i = 0; i < grayscale.length; i++) {
    const r = imageData.data[i * 4];
    const g = imageData.data[i * 4 + 1];
    const b = imageData.data[i * 4 + 2];
    const a = imageData.data[i * 4 + 3];
    
    // For brush tips, darker = more opaque paint
    // We invert and use alpha to determine brush opacity
    const luminosity = 0.299 * r + 0.587 * g + 0.114 * b;
    // Invert and apply alpha
    grayscale[i] = Math.round((255 - luminosity) * (a / 255));
  }
  
  return {
    width: canvas.width,
    height: canvas.height,
    depth: 8,
    data: grayscale,
  };
}

/**
 * Create brush tip from an Image element
 */
export async function createBrushTipFromImage(img: HTMLImageElement, maxSize: number = 1024): Promise<BrushTipImage> {
  // Scale down if needed
  let width = img.width;
  let height = img.height;
  
  if (width > maxSize || height > maxSize) {
    const scale = maxSize / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  
  ctx.drawImage(img, 0, 0, width, height);
  
  return createBrushTipFromCanvas(canvas);
}

/**
 * Convert brush tip to data URL for display in browser
 */
export function brushTipToDataUrl(brushTip: BrushTipImage): string {
  const { width, height, data } = brushTip;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const imageData = ctx.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = y * width + x;
      const dstIdx = (y * width + x) * 4;

      const gray = data[srcIdx];

      // White brush with grayscale as alpha
      imageData.data[dstIdx] = 255;
      imageData.data[dstIdx + 1] = 255;
      imageData.data[dstIdx + 2] = 255;
      imageData.data[dstIdx + 3] = gray;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Download an ABR file in the browser
 */
export function downloadAbrFile(data: Uint8Array, filename: string): void {
  // Create a new Uint8Array to ensure we have a clean ArrayBuffer
  const cleanData = new Uint8Array(data);
  const blob = new Blob([cleanData], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.abr') ? filename : filename + '.abr';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
