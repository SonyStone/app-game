import { Show, createSignal, createEffect, onCleanup } from 'solid-js';
import type { BrushWithPreview, BrushTipImage } from '~/lib/abr';
import { brushTipToPngBlob, createBrushTipFromCanvas } from '~/lib/abr';

type BrushEditorProps {
  brush?: BrushWithPreview;
  onSave: (brush: BrushWithPreview) => void;
  onCancel: () => void;
  isNew?: boolean;
}

export function BrushEditor(props: BrushEditorProps) {
  const [name, setName] = createSignal(props.brush?.name || 'New Brush');
  const [type, setType] = createSignal<'computed' | 'sampled'>(props.brush?.type || 'computed');
  const [spacing, setSpacing] = createSignal(props.brush?.spacing ?? 25);
  const [diameter, setDiameter] = createSignal(props.brush?.diameter ?? 30);
  const [hardness, setHardness] = createSignal(props.brush?.hardness ?? 100);
  const [angle, setAngle] = createSignal(props.brush?.angle ?? 0);
  const [roundness, setRoundness] = createSignal(props.brush?.roundness ?? 100);
  const [brushTip, setBrushTip] = createSignal<BrushTipImage | undefined>(props.brush?.brushTip);
  const [previewUrl, setPreviewUrl] = createSignal<string | undefined>(props.brush?.imageDataUrl);
  const [isDrawing, setIsDrawing] = createSignal(false);
  
  let canvasRef: HTMLCanvasElement | undefined;
  let previewCanvasRef: HTMLCanvasElement | undefined;

  // Initialize canvas for drawing custom brush tips
  createEffect(() => {
    if (canvasRef && type() === 'sampled') {
      const ctx = canvasRef.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);
        
        // If we have existing brush tip data, draw it
        const tip = brushTip();
        if (tip) {
          drawBrushTipToCanvas(tip, canvasRef);
        }
      }
    }
  });

  // Generate preview when brush tip changes
  createEffect(async () => {
    const tip = brushTip();
    if (tip) {
      try {
        const blob = await brushTipToPngBlob(tip);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      } catch (err) {
        console.error('Failed to generate preview:', err);
      }
    }
  });

  // Cleanup URLs
  onCleanup(() => {
    const url = previewUrl();
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  });

  const handleCanvasMouseDown = (e: MouseEvent) => {
    if (!canvasRef) return;
    setIsDrawing(true);
    draw(e);
  };

  const handleCanvasMouseMove = (e: MouseEvent) => {
    if (!isDrawing() || !canvasRef) return;
    draw(e);
  };

  const handleCanvasMouseUp = () => {
    setIsDrawing(false);
    updateBrushTipFromCanvas();
  };

  const draw = (e: MouseEvent) => {
    if (!canvasRef) return;
    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    const rect = canvasRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
  };

  const updateBrushTipFromCanvas = () => {
    if (!canvasRef) return;
    try {
      const tip = createBrushTipFromCanvas(canvasRef);
      setBrushTip(tip);
      setType('sampled');
    } catch (err) {
      console.error('Failed to create brush tip:', err);
    }
  };

  const clearCanvas = () => {
    if (!canvasRef) return;
    const ctx = canvasRef.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);
    }
    setBrushTip(undefined);
    setPreviewUrl(undefined);
  };

  const handleImageUpload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = async () => {
      try {
        // Draw to canvas
        if (canvasRef) {
          const ctx = canvasRef.getContext('2d');
          if (ctx) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);
            
            // Scale to fit
            const scale = Math.min(
              canvasRef.width / img.width,
              canvasRef.height / img.height
            );
            const w = img.width * scale;
            const h = img.height * scale;
            const x = (canvasRef.width - w) / 2;
            const y = (canvasRef.height - h) / 2;
            
            ctx.drawImage(img, x, y, w, h);
            updateBrushTipFromCanvas();
          }
        }
      } catch (err) {
        console.error('Failed to load image:', err);
      }
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  };

  const handleSave = () => {
    const brush: BrushWithPreview = {
      id: props.brush?.id || `brush_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name(),
      type: type(),
      spacing: spacing(),
      diameter: diameter(),
      hardness: type() === 'computed' ? hardness() : undefined,
      angle: angle(),
      roundness: roundness(),
      brushTip: type() === 'sampled' ? brushTip() : undefined,
      imageDataUrl: type() === 'sampled' ? previewUrl() : undefined,
      settings: props.brush?.settings || {},
    };
    props.onSave(brush);
  };

  return (
    <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={props.onCancel}>
      <div
        class="bg-ps-bg rounded-lg shadow-ps-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="flex items-center justify-between p-4 border-b border-ps-border bg-ps-bg-dark">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded bg-green-500/20 flex items-center justify-center">
              <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <h2 class="text-lg font-medium text-ps-text-bright">
                {props.isNew ? 'Create New Brush' : 'Edit Brush'}
              </h2>
              <p class="text-xs text-ps-text-muted">
                Configure brush properties and tip shape
              </p>
            </div>
          </div>
          <button onClick={props.onCancel} class="p-2 hover:bg-ps-bg-light rounded" aria-label="Close">
            <svg class="w-5 h-5 text-ps-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div class="flex-1 overflow-y-auto p-6">
          <div class="grid grid-cols-2 gap-6">
            {/* Left side - Properties */}
            <div class="space-y-4">
              {/* Name */}
              <div>
                <label class="block text-sm font-medium text-ps-text-muted mb-1">Brush Name</label>
                <input
                  type="text"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                  class="w-full bg-ps-bg-dark border border-ps-border rounded px-3 py-2 text-ps-text focus:border-ps-accent focus:outline-none"
                />
              </div>

              {/* Type */}
              <div>
                <label class="block text-sm font-medium text-ps-text-muted mb-1">Brush Type</label>
                <div class="flex gap-2">
                  <button
                    onClick={() => setType('computed')}
                    class={`flex-1 px-3 py-2 rounded text-sm ${
                      type() === 'computed'
                        ? 'bg-ps-accent text-white'
                        : 'bg-ps-bg-dark border border-ps-border text-ps-text hover:bg-ps-bg-light'
                    }`}
                  >
                    Computed (Round)
                  </button>
                  <button
                    onClick={() => setType('sampled')}
                    class={`flex-1 px-3 py-2 rounded text-sm ${
                      type() === 'sampled'
                        ? 'bg-ps-accent text-white'
                        : 'bg-ps-bg-dark border border-ps-border text-ps-text hover:bg-ps-bg-light'
                    }`}
                  >
                    Sampled (Custom)
                  </button>
                </div>
              </div>

              {/* Spacing */}
              <div>
                <label class="block text-sm font-medium text-ps-text-muted mb-1">
                  Spacing: {spacing()}%
                </label>
                <input
                  type="range"
                  min="1"
                  max="200"
                  value={spacing()}
                  onInput={(e) => setSpacing(parseInt(e.currentTarget.value))}
                  class="w-full"
                />
              </div>

              {/* Diameter */}
              <div>
                <label class="block text-sm font-medium text-ps-text-muted mb-1">
                  Diameter: {diameter()}px
                </label>
                <input
                  type="range"
                  min="1"
                  max="2500"
                  value={diameter()}
                  onInput={(e) => setDiameter(parseInt(e.currentTarget.value))}
                  class="w-full"
                />
              </div>

              {/* Hardness (only for computed) */}
              <Show when={type() === 'computed'}>
                <div>
                  <label class="block text-sm font-medium text-ps-text-muted mb-1">
                    Hardness: {hardness()}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={hardness()}
                    onInput={(e) => setHardness(parseInt(e.currentTarget.value))}
                    class="w-full"
                  />
                </div>
              </Show>

              {/* Angle */}
              <div>
                <label class="block text-sm font-medium text-ps-text-muted mb-1">
                  Angle: {angle()}°
                </label>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={angle()}
                  onInput={(e) => setAngle(parseInt(e.currentTarget.value))}
                  class="w-full"
                />
              </div>

              {/* Roundness */}
              <div>
                <label class="block text-sm font-medium text-ps-text-muted mb-1">
                  Roundness: {roundness()}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={roundness()}
                  onInput={(e) => setRoundness(parseInt(e.currentTarget.value))}
                  class="w-full"
                />
              </div>
            </div>

            {/* Right side - Brush Tip Drawing */}
            <div class="space-y-4">
              <Show
                when={type() === 'sampled'}
                fallback={
                  <div class="space-y-4">
                    <label class="block text-sm font-medium text-ps-text-muted">Brush Preview</label>
                    <div class="aspect-square bg-ps-bg-dark rounded-lg border border-ps-border flex items-center justify-center">
                      <div 
                        class="rounded-full bg-white"
                        style={{
                          width: `${Math.min(diameter(), 200)}px`,
                          height: `${Math.min(diameter(), 200) * (roundness() / 100)}px`,
                          transform: `rotate(${angle()}deg)`,
                          opacity: hardness() / 100,
                          "box-shadow": `0 0 ${Math.max(0, 20 - hardness() / 5)}px ${Math.max(0, 20 - hardness() / 5)}px rgba(255,255,255,0.5)`,
                        }}
                      />
                    </div>
                  </div>
                }
              >
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <label class="block text-sm font-medium text-ps-text-muted">Draw Brush Tip</label>
                    <div class="flex gap-2">
                      <label class="px-3 py-1 text-sm bg-ps-bg-dark border border-ps-border rounded cursor-pointer hover:bg-ps-bg-light">
                        Upload Image
                        <input
                          type="file"
                          accept="image/*"
                          class="hidden"
                          onChange={handleImageUpload}
                        />
                      </label>
                      <button
                        onClick={clearCanvas}
                        class="px-3 py-1 text-sm bg-ps-bg-dark border border-ps-border rounded hover:bg-ps-bg-light"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div class="relative">
                    <canvas
                      ref={canvasRef}
                      width={256}
                      height={256}
                      class="w-full aspect-square bg-white rounded-lg border border-ps-border cursor-crosshair"
                      onMouseDown={handleCanvasMouseDown}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      onMouseLeave={handleCanvasMouseUp}
                    />
                    <p class="text-xs text-ps-text-muted mt-1">
                      Draw with mouse or upload an image. Black = opaque, White = transparent.
                    </p>
                  </div>
                </div>

                {/* Preview */}
                <Show when={previewUrl()}>
                  <div>
                    <label class="block text-sm font-medium text-ps-text-muted mb-2">Result Preview</label>
                    <div class="w-32 h-32 checkered-bg rounded-lg border border-ps-border overflow-hidden">
                      <img
                        src={previewUrl()}
                        alt="Brush preview"
                        class="w-full h-full object-contain"
                        style={{ "image-rendering": "pixelated" }}
                      />
                    </div>
                  </div>
                </Show>
              </Show>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div class="flex items-center justify-end gap-3 p-4 border-t border-ps-border bg-ps-bg-dark">
          <button
            onClick={props.onCancel}
            class="px-4 py-2 text-sm bg-ps-bg-light hover:bg-ps-bg-lighter text-ps-text rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            class="px-4 py-2 text-sm bg-ps-accent hover:bg-ps-accent-hover text-white rounded flex items-center gap-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            {props.isNew ? 'Create Brush' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Draw brush tip data to canvas
 */
function drawBrushTipToCanvas(tip: BrushTipImage, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Create image data
  const imageData = ctx.createImageData(tip.width, tip.height);
  
  for (let i = 0; i < tip.data.length; i++) {
    const value = 255 - tip.data[i]; // Invert: brush tip has 255=opaque, we want 0=black
    imageData.data[i * 4] = value;
    imageData.data[i * 4 + 1] = value;
    imageData.data[i * 4 + 2] = value;
    imageData.data[i * 4 + 3] = 255;
  }

  // Scale to canvas size
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = tip.width;
  tempCanvas.height = tip.height;
  const tempCtx = tempCanvas.getContext('2d');
  if (tempCtx) {
    tempCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
  }
}
