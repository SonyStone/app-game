import { createResizeObserver } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, onSettled } from 'solid-js';
import type { BrushTipImage, BrushWithPreview } from '../../../../lib/abr';
import type { BrushFormValues } from '../../brush-form-schema';

export type BrushPreviewCanvasProps = {
  brush: BrushWithPreview;
  values: BrushFormValues;
  /** Height of the preview in pixels */
  height?: number;
  /** Aspect ratio (width/height). If not provided, uses container width */
  aspectRatio?: number;
  backgroundColor?: string;
  brushColor?: string;
};

/** Draws a stroke preview and redraws when brush settings or the container size change. */
export function BrushPreviewCanvas(props: BrushPreviewCanvasProps) {
  let canvasRef: HTMLCanvasElement | undefined;
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement | undefined>(undefined, { ownedWrite: true });
  let animationFrameId: number | undefined;

  const [canvasSize, setCanvasSize] = createSignal({ width: 400, height: 100 });

  const render = () => {
    if (!canvasRef) return;

    const canvas = canvasRef;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasSize();
    if (width <= 0 || height <= 0) return;

    const bgColor = props.backgroundColor ?? '#646462';
    const brushColor = props.brushColor ?? '#ffffff';
    const rgb = hexToRgb(brushColor);
    const bgRgb = hexToRgb(bgColor);

    // Set canvas size (with device pixel ratio for sharpness)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    const values = props.values;
    const brush = props.brush;

    // Get or generate brush tip
    let brushTip: BrushTipImage;
    if (brush.brushTip) {
      brushTip = brush.brushTip;
    } else {
      // Generate computed brush tip
      brushTip = generateComputedBrushTip(100, values.hardness);
    }

    // Calculate actual brush size for preview (scale to fit)
    const maxBrushSize = Math.min(height * 0.8, values.diameter);
    const brushSize = Math.max(4, Math.min(maxBrushSize, values.diameter * 0.5));

    // Generate path
    const path = generatePreviewPath(width, height);
    const distances = calculatePathDistances(path);
    const totalLength = distances[distances.length - 1];

    // Calculate spacing in pixels
    const spacingPx = Math.max(1, (brushSize * values.spacing) / 100);

    // Seeded random for consistent results
    const random = seededRandom(42);

    // Shape dynamics
    const shapeDynamics = values.useShapeDynamics ? values.shapeDynamics : null;
    const scattering = values.useScattering ? values.scattering : null;
    const transfer = values.useTransfer ? values.transfer : null;

    // Create alpha mask for smooth max-blending (like Photoshop)
    // This prevents the "pearl necklace" effect from overlapping stamps
    const alphaMask = createAlphaMaskBuffer(Math.ceil(width * dpr), Math.ceil(height * dpr));

    // Stamp along path into the alpha mask
    let currentDist = 0;
    let pathIndex = 0;

    while (currentDist < totalLength) {
      // Find path position at current distance
      while (pathIndex < distances.length - 1 && distances[pathIndex + 1] < currentDist) {
        pathIndex++;
      }

      // Interpolate position
      const t =
        pathIndex < distances.length - 1 && distances[pathIndex + 1] !== distances[pathIndex]
          ? (currentDist - distances[pathIndex]) / (distances[pathIndex + 1] - distances[pathIndex])
          : 0;

      const p1 = path[pathIndex];
      const p2 = path[Math.min(pathIndex + 1, path.length - 1)];
      let x = p1.x + (p2.x - p1.x) * t;
      let y = p1.y + (p2.y - p1.y) * t;

      // Path angle for direction-based effects
      const pathAngle = getPathAngle(path, pathIndex);

      // Apply scattering
      let scatterCount = 1;
      if (scattering) {
        scatterCount = scattering.count;
        if (scattering.countJitter > 0) {
          scatterCount = Math.max(1, Math.round(scatterCount * (1 - (random() * scattering.countJitter) / 100)));
        }
      }

      for (let s = 0; s < scatterCount; s++) {
        let stampX = x;
        let stampY = y;

        // Apply scatter offset
        if (scattering && scattering.scatter > 0) {
          const scatterAmount = (scattering.scatter / 100) * brushSize;
          const perpAngle = pathAngle + Math.PI / 2;

          if (scattering.bothAxes) {
            stampX += (random() - 0.5) * 2 * scatterAmount;
            stampY += (random() - 0.5) * 2 * scatterAmount;
          } else {
            const offset = (random() - 0.5) * 2 * scatterAmount;
            stampX += Math.cos(perpAngle) * offset;
            stampY += Math.sin(perpAngle) * offset;
          }
        }

        // Calculate stamp properties
        let stampSize = brushSize;
        let stampAngle = values.angle;
        let stampRoundness = values.roundness;
        let stampFlipX = values.flipX;
        let stampFlipY = values.flipY;
        let stampOpacity = 1;

        // Apply shape dynamics
        if (shapeDynamics) {
          // Size jitter
          if (shapeDynamics.sizeJitter > 0) {
            const minSize = (shapeDynamics.minimumDiameter / 100) * brushSize;
            const jitterRange = (shapeDynamics.sizeJitter / 100) * (brushSize - minSize);
            stampSize = Math.max(minSize, brushSize - random() * jitterRange);
          }

          // Angle jitter
          if (shapeDynamics.angleJitter > 0) {
            stampAngle += (random() - 0.5) * 2 * shapeDynamics.angleJitter;
          }

          // Roundness jitter
          if (shapeDynamics.roundnessJitter > 0) {
            const minRoundness = shapeDynamics.roundnessMinimum;
            const jitterRange = (shapeDynamics.roundnessJitter / 100) * (stampRoundness - minRoundness);
            stampRoundness = Math.max(minRoundness, stampRoundness - random() * jitterRange);
          }

          // Flip jitters
          if (shapeDynamics.flipXJitter && random() > 0.5) stampFlipX = !stampFlipX;
          if (shapeDynamics.flipYJitter && random() > 0.5) stampFlipY = !stampFlipY;
        }

        // Apply transfer (opacity) - for per-stamp opacity variation
        if (transfer) {
          if (transfer.opacityJitter > 0) {
            const minOpacity = transfer.opacityMinimum / 100;
            const jitterRange = (transfer.opacityJitter / 100) * (1 - minOpacity);
            stampOpacity = Math.max(minOpacity, 1 - random() * jitterRange);
          }
        }

        // Stamp to alpha mask with MAX blending (coordinates in DPR space)
        stampToAlphaMask(
          alphaMask,
          brushTip,
          stampX * dpr,
          stampY * dpr,
          stampSize * dpr,
          stampAngle,
          stampRoundness,
          stampFlipX,
          stampFlipY,
          stampOpacity
        );
      }

      currentDist += spacingPx;
    }

    // Render the alpha mask to the canvas (blended with background in linear space)
    renderAlphaMaskToCanvas(ctx, alphaMask, rgb, bgRgb, dpr);

    // Draw dual brush on top (if enabled and available)
    if (values.useDualBrush && brush.dualBrushTip) {
      const dualMask = createAlphaMaskBuffer(Math.ceil(width * dpr), Math.ceil(height * dpr));

      // Reset for dual brush pass
      currentDist = 0;
      pathIndex = 0;
      const dualRandom = seededRandom(123); // Different seed for variation

      while (currentDist < totalLength) {
        while (pathIndex < distances.length - 1 && distances[pathIndex + 1] < currentDist) {
          pathIndex++;
        }

        const t =
          pathIndex < distances.length - 1 && distances[pathIndex + 1] !== distances[pathIndex]
            ? (currentDist - distances[pathIndex]) / (distances[pathIndex + 1] - distances[pathIndex])
            : 0;

        const p1 = path[pathIndex];
        const p2 = path[Math.min(pathIndex + 1, path.length - 1)];
        const x = p1.x + (p2.x - p1.x) * t;
        const y = p1.y + (p2.y - p1.y) * t;

        const dualOffset = (dualRandom() - 0.5) * brushSize * 0.3;
        stampToAlphaMask(
          dualMask,
          brush.dualBrushTip,
          (x + dualOffset) * dpr,
          (y + dualOffset * 0.5) * dpr,
          brushSize * 0.8 * dpr,
          values.angle + (dualRandom() - 0.5) * 30,
          values.roundness,
          dualRandom() > 0.5,
          dualRandom() > 0.5,
          0.7
        );

        currentDist += spacingPx;
      }

      // Dual brush typically uses multiply blend mode
      ctx.globalCompositeOperation = 'multiply';
      renderAlphaMaskToCanvas(ctx, dualMask, rgb, bgRgb, dpr);
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  // Debounced render
  const debouncedRender = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(render);
  };

  // Use solid-primitives resize observer
  createResizeObserver(containerRef, ({ width, height }) => {
    const newHeight = props.height ?? 100;
    if (width > 0) {
      setCanvasSize({ width, height: newHeight });
    }
  });

  onSettled(() => {
    // Initial render after mount
    const container = containerRef();
    if (container) {
      const width = container.clientWidth || 400;
      setCanvasSize({ width, height: props.height ?? 100 });
    }
    render();
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  });

  // Re-render when values or size change
  createEffect(
    () => [JSON.stringify(props.values), props.brush, canvasSize()],
    () => debouncedRender()
  );

  return (
    <div ref={setContainerRef} class="bg-ps-bg-dark border-ps-border w-full overflow-hidden rounded border">
      <canvas ref={canvasRef} class="block" />
    </div>
  );
}

// Seeded random for consistent preview
function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Generate a smooth S-curve path for preview
function generatePreviewPath(width: number, height: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const padding = 20;
  const amplitude = (height - padding * 2) * 0.35;
  const centerY = height / 2;

  // S-curve using cubic bezier-like sampling
  for (let t = 0; t <= 1; t += 0.005) {
    const x = padding + (width - padding * 2) * t;
    // S-curve formula
    const y = centerY + amplitude * Math.sin(t * Math.PI * 2 - Math.PI / 2) * (1 - Math.abs(t - 0.5) * 0.5);
    points.push({ x, y });
  }

  return points;
}

// Calculate distance along path for each point
function calculatePathDistances(path: { x: number; y: number }[]): number[] {
  const distances = [0];
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    distances.push(distances[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return distances;
}

// Get angle of path at a point (in radians)
function getPathAngle(path: { x: number; y: number }[], index: number): number {
  const i1 = Math.max(0, index - 1);
  const i2 = Math.min(path.length - 1, index + 1);
  const dx = path[i2].x - path[i1].x;
  const dy = path[i2].y - path[i1].y;
  return Math.atan2(dy, dx);
}

// Helper to convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : { r: 255, g: 255, b: 255 };
}

// Smoothstep provides an ease-in-out curve: slow start, fast middle, slow end
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Generate computed brush tip (circular with hardness)
// Uses smoothstep falloff to match Photoshop's soft brush appearance
function generateComputedBrushTip(size: number, hardness: number): BrushTipImage {
  const width = Math.ceil(size);
  const height = Math.ceil(size);
  const data = new Uint8Array(width * height);
  const center = size / 2;
  const radius = center;
  const hardnessRadius = (hardness / 100) * radius;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - center + 0.5;
      const dy = y - center + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= hardnessRadius) {
        data[y * width + x] = 255;
      } else if (dist <= radius) {
        // Linear interpolation factor (0 at hardness edge, 1 at outer edge)
        const t = (dist - hardnessRadius) / (radius - hardnessRadius);
        // Apply smoothstep for non-linear falloff (ease-in-out)
        const falloff = 1 - smoothstep(t);
        data[y * width + x] = Math.round(255 * falloff);
      }
    }
  }

  return { width, height, depth: 8, data };
}

// Create an alpha mask buffer for max-blending brush stamps
// This mimics Photoshop's stroke rendering where overlapping stamps don't accumulate
function createAlphaMaskBuffer(
  width: number,
  height: number
): {
  data: Float32Array;
  width: number;
  height: number;
} {
  return {
    data: new Float32Array(width * height),
    width,
    height
  };
}

// Convert sRGB to linear color space (gamma 2.2)
function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

// Convert linear to sRGB color space
function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

// Bilinear interpolation for smooth brush tip sampling
function sampleBrushTipBilinear(brushTip: BrushTipImage, x: number, y: number): number {
  // Clamp to brush bounds
  if (x < 0 || x >= brushTip.width - 1 || y < 0 || y >= brushTip.height - 1) {
    // Handle edge cases with nearest neighbor
    const ix = Math.max(0, Math.min(brushTip.width - 1, Math.round(x)));
    const iy = Math.max(0, Math.min(brushTip.height - 1, Math.round(y)));
    if (ix < 0 || ix >= brushTip.width || iy < 0 || iy >= brushTip.height) return 0;
    return brushTip.data[iy * brushTip.width + ix] / 255;
  }

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = x - x0;
  const fy = y - y0;

  // Get four neighboring pixels
  const v00 = brushTip.data[y0 * brushTip.width + x0] / 255;
  const v10 = brushTip.data[y0 * brushTip.width + x1] / 255;
  const v01 = brushTip.data[y1 * brushTip.width + x0] / 255;
  const v11 = brushTip.data[y1 * brushTip.width + x1] / 255;

  // Bilinear interpolation
  const v0 = v00 * (1 - fx) + v10 * fx;
  const v1 = v01 * (1 - fx) + v11 * fx;
  return v0 * (1 - fy) + v1 * fy;
}

// Stamp brush tip to alpha mask using standard alpha blending in LINEAR color space
function stampToAlphaMask(
  mask: { data: Float32Array; width: number; height: number },
  brushTip: BrushTipImage,
  x: number,
  y: number,
  size: number,
  angle: number,
  roundness: number,
  flipX: boolean,
  flipY: boolean,
  opacity: number
) {
  const scale = size / brushTip.width;
  const cos = Math.cos((-angle * Math.PI) / 180);
  const sin = Math.sin((-angle * Math.PI) / 180);
  const scaleY = roundness / 100;

  // Calculate bounding box of rotated/scaled stamp
  const halfSize = size / 2;
  const boundingRadius = (halfSize * Math.sqrt(2)) / scaleY; // Account for roundness squash
  const minX = Math.max(0, Math.floor(x - boundingRadius));
  const maxX = Math.min(mask.width - 1, Math.ceil(x + boundingRadius));
  const minY = Math.max(0, Math.floor(y - boundingRadius));
  const maxY = Math.min(mask.height - 1, Math.ceil(y + boundingRadius));

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      // Transform pixel position back to brush tip coordinates
      const dx = px - x;
      const dy = py - y;

      // Inverse rotation
      const rx = dx * cos + dy * sin;
      const ry = (-dx * sin + dy * cos) / scaleY;

      // Apply flip
      const fx = flipX ? -rx : rx;
      const fy = flipY ? -ry : ry;

      // Convert to brush tip pixel coordinates (centered)
      const bx = fx / scale + brushTip.width / 2;
      const by = fy / scale + brushTip.height / 2;

      if (bx >= 0 && bx < brushTip.width && by >= 0 && by < brushTip.height) {
        // Sample with bilinear interpolation for smooth results
        const srgbAlpha = sampleBrushTipBilinear(brushTip, bx, by) * opacity;

        // Convert to linear space for proper blending
        const srcAlpha = srgbToLinear(srgbAlpha);

        const maskIndex = py * mask.width + px;
        const dstAlpha = mask.data[maskIndex];

        // Standard "over" alpha blending: result = src + dst * (1 - src)
        mask.data[maskIndex] = srcAlpha + dstAlpha * (1 - srcAlpha);
      }
    }
  }
}

// Render alpha mask to canvas with color, blending with background in LINEAR space
function renderAlphaMaskToCanvas(
  ctx: CanvasRenderingContext2D,
  mask: { data: Float32Array; width: number; height: number },
  color: { r: number; g: number; b: number },
  bgColor: { r: number; g: number; b: number },
  dpr: number
) {
  // Convert colors to linear space
  const linearFg = {
    r: srgbToLinear(color.r / 255),
    g: srgbToLinear(color.g / 255),
    b: srgbToLinear(color.b / 255)
  };
  const linearBg = {
    r: srgbToLinear(bgColor.r / 255),
    g: srgbToLinear(bgColor.g / 255),
    b: srgbToLinear(bgColor.b / 255)
  };

  const imageData = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    const linearAlpha = mask.data[i];

    // Blend foreground and background in linear space
    const linearR = linearFg.r * linearAlpha + linearBg.r * (1 - linearAlpha);
    const linearG = linearFg.g * linearAlpha + linearBg.g * (1 - linearAlpha);
    const linearB = linearFg.b * linearAlpha + linearBg.b * (1 - linearAlpha);

    // Convert back to sRGB for display
    const idx = i * 4;
    imageData.data[idx] = Math.round(linearToSrgb(linearR) * 255);
    imageData.data[idx + 1] = Math.round(linearToSrgb(linearG) * 255);
    imageData.data[idx + 2] = Math.round(linearToSrgb(linearB) * 255);
    imageData.data[idx + 3] = 255; // Fully opaque - we've already blended with background
  }

  // Create temp canvas at mask size and draw
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = mask.width;
  tempCanvas.height = mask.height;
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.putImageData(imageData, 0, 0);

  // Draw scaled to account for DPR
  ctx.drawImage(tempCanvas, 0, 0, mask.width / dpr, mask.height / dpr);
}
