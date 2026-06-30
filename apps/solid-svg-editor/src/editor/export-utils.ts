import type { ExportFormat } from "./types";

interface ExportDimensions {
  readonly width: number;
  readonly height: number;
  readonly viewBox: readonly [number, number, number, number];
}

export function downloadBlob(content: BlobPart, filename: string, type: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportFile(format: ExportFormat, svgText: string, dimensions: ExportDimensions, scale: number, background: string): Promise<void> {
  if (format === "svg") {
    downloadBlob(svgText, "export.svg", "image/svg+xml");
    return;
  }

  const blob = await rasterizeSvg(svgText, dimensions, scale, background, format);
  downloadBlob(blob, `export.${format === "jpeg" ? "jpg" : format}`, blob.type);
}

export async function copyExport(format: ExportFormat, svgText: string, dimensions: ExportDimensions, scale: number, background: string): Promise<void> {
  if (format === "svg") {
    await navigator.clipboard.writeText(svgText);
    return;
  }

  const blob = await rasterizeSvg(svgText, dimensions, scale, background, format);
  const clipboardItem = new ClipboardItem({ [blob.type]: blob });
  await navigator.clipboard.write([clipboardItem]);
}

async function rasterizeSvg(
  svgText: string,
  dimensions: ExportDimensions,
  scale: number,
  background: string,
  format: Exclude<ExportFormat, "svg">
): Promise<Blob> {
  const blob = new Blob([svgText], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(dimensions.width * scale));
  canvas.height = Math.max(1, Math.round(dimensions.height * scale));
  const context = canvas.getContext("2d");

  if (!context) {
    URL.revokeObjectURL(url);
    throw new Error("Canvas is unavailable");
  }

  if (format === "jpeg") {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  const output = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
      } else {
        reject(new Error("Raster export failed"));
      }
    }, mime);
  });
  return output;
}
