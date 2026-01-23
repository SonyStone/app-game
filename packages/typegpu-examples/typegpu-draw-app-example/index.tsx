import { createEffect, createSignal, on, onCleanup, onMount, untrack, type JSX } from 'solid-js';
import tgpu, { type TgpuRoot } from 'typegpu';
import { BlendPass } from './blend/BlendPass';
import { SwapBuffer } from './blend/SwapBuffer';
import { BrushStroke } from './brush/BrushStroke';
import { useCanvasTransform } from './canvas/useCanvasTransform';
import { usePointerInput } from './canvas/usePointerInput';
import {
  BLEND_MODE_LABELS,
  COLOR_BLEND_MODE_LABELS,
  DEFAULT_BRUSH_HARDNESS,
  DEFAULT_BRUSH_OPACITY,
  DEFAULT_BRUSH_SIZE,
  DEFAULT_BRUSH_SPACING,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH
} from './constants';
import { DisplayPass } from './display/DisplayPass';
import { BlendMode, ColorBlendMode, type CanvasTransform, type StrokePoint } from './types';

export default function TypeGPUDrawApp(): JSX.Element {
  let canvasRef!: HTMLCanvasElement;

  // UI State
  const [brushColor, setBrushColor] = createSignal('#000000');
  const [brushSize, setBrushSize] = createSignal(DEFAULT_BRUSH_SIZE);
  const [brushOpacity, setBrushOpacity] = createSignal(DEFAULT_BRUSH_OPACITY);
  const [brushHardness, setBrushHardness] = createSignal(DEFAULT_BRUSH_HARDNESS);
  const [brushSpacing, setBrushSpacing] = createSignal(DEFAULT_BRUSH_SPACING);
  const [blendMode, setBlendMode] = createSignal<BlendMode>(BlendMode.NORMAL);
  const [colorBlendMode, setColorBlendMode] = createSignal<ColorBlendMode>(ColorBlendMode.GAMMA);

  // GPU State
  let root: TgpuRoot | null = null;
  let context: GPUCanvasContext | null = null;
  let brushStroke: BrushStroke | null = null;
  let swapBuffer: SwapBuffer | null = null;
  let blendPass: BlendPass | null = null;
  let displayPass: DisplayPass | null = null;

  // Canvas transform state
  const [transform, setTransform] = createSignal<CanvasTransform>({
    panX: 0,
    panY: 0,
    zoom: 1,
    rotation: 0
  });

  // Track if we need to render
  let needsRender = false;
  let pendingPoints: StrokePoint[] = [];
  let strokeInProgress = false;

  // Handle stroke input
  const handleStroke = (points: StrokePoint[]) => {
    pendingPoints.push(...points);
    strokeInProgress = true;
    needsRender = true;
  };

  // Handle stroke end - this is when we commit the stroke to the canvas
  const handleStrokeEnd = () => {
    strokeInProgress = false;
    needsRender = true;
  };

  // Handle transform changes
  const handleTransformChange = (newTransform: CanvasTransform) => {
    setTransform(newTransform);
    needsRender = true;
  };

  // Initialize WebGPU
  async function initWebGPU() {
    if (!canvasRef) return;

    try {
      root = await tgpu.init();

      // Configure canvas
      context = canvasRef.getContext('webgpu');
      if (!context) {
        throw new Error('Failed to get WebGPU context');
      }

      if (!navigator.gpu) {
        throw new Error('WebGPU not supported');
      }

      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device: root.device,
        format,
        alphaMode: 'premultiplied'
      });

      const width = canvasRef.clientWidth;
      const height = canvasRef.clientHeight;
      canvasRef.width = width;
      canvasRef.height = height;

      // Create render components with fixed canvas size
      // The drawing canvas is separate from the display size
      brushStroke = new BrushStroke(root, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT);
      swapBuffer = new SwapBuffer(root, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT);
      blendPass = new BlendPass(root);
      displayPass = new DisplayPass(root, format);

      // Clear canvas to white
      const encoder = root.device.createCommandEncoder();
      swapBuffer.clearRead(encoder, [1, 1, 1, 1]);
      root.device.queue.submit([encoder.finish()]);

      // Update display transform (pass both display and canvas dimensions)
      displayPass.updateTransform(transform(), width, height, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT);

      needsRender = true;
    } catch (err) {
      console.error('Failed to initialize WebGPU:', err);
    }
  }

  // Render loop
  function render() {
    if (!root || !context || !brushStroke || !swapBuffer || !blendPass || !displayPass) {
      return;
    }

    if (!needsRender) return;
    needsRender = false;

    // Update brush settings
    brushStroke.setBrushSettings({
      color: untrack(brushColor),
      size: untrack(brushSize),
      opacity: untrack(brushOpacity),
      hardness: untrack(brushHardness)
    });

    // Update blend modes
    blendPass.setBlendMode(untrack(blendMode));
    blendPass.setColorBlendMode(untrack(colorBlendMode));

    // Add pending stroke points
    if (pendingPoints.length > 0) {
      brushStroke.addStrokePoints(pendingPoints);
      pendingPoints = [];
    }

    // Create command encoder
    const encoder = root.device.createCommandEncoder();

    // Always accumulate stamps during rendering (true = don't clear)
    const hasPendingStamps = brushStroke.pendingCount > 0;
    if (hasPendingStamps) {
      brushStroke.render(true); // Always accumulate
      brushStroke.clearPending();
    }

    // Get the brush texture view for display/compositing
    const brushTextureView = brushStroke.textureView;

    if (strokeInProgress) {
      // During stroke: show brush overlay for preview
      displayPass.setBrushOverlay(brushTextureView);
    } else {
      // Stroke ended or not active
      // Check if we need to composite (stroke just ended with content)
      // We detect this by checking if overlay was previously set
      const needsComposite = displayPass.hasBrushOverlayActive;

      if (needsComposite) {
        // Composite accumulated brush strokes to canvas permanently
        blendPass.render(encoder, brushTextureView, swapBuffer);
        brushStroke.clearTexture(); // Clear for next stroke
      }
      displayPass.setBrushOverlay(null); // Remove overlay
    }

    // Update display transform
    const currentTransform = untrack(transform);
    displayPass.updateTransform(
      currentTransform,
      canvasRef.width,
      canvasRef.height,
      DEFAULT_CANVAS_WIDTH,
      DEFAULT_CANVAS_HEIGHT
    );

    // Render to screen
    const outputView = context.getCurrentTexture().createView();
    displayPass.render(encoder, swapBuffer.read.view, outputView);

    // Submit
    root.device.queue.submit([encoder.finish()]);
  }

  // Clear canvas
  const clearCanvas = () => {
    if (!root || !swapBuffer) return;

    const encoder = root.device.createCommandEncoder();
    swapBuffer.clearRead(encoder, [1, 1, 1, 1]);
    root.device.queue.submit([encoder.finish()]);
    needsRender = true;
  };

  // Reset transform
  const resetTransform = () => {
    setTransform({
      panX: 0,
      panY: 0,
      zoom: 1,
      rotation: 0
    });
    needsRender = true;
  };

  // Handle resize - only resizes display, not the drawing canvas
  const handleResize = () => {
    if (!canvasRef) return;

    const width = canvasRef.clientWidth;
    const height = canvasRef.clientHeight;

    if (width !== canvasRef.width || height !== canvasRef.height) {
      canvasRef.width = width;
      canvasRef.height = height;

      // Drawing canvas stays the same size (DEFAULT_CANVAS_WIDTH x DEFAULT_CANVAS_HEIGHT)
      // Only the display adapts to window size

      needsRender = true;
    }
  };

  // Animation frame using requestAnimationFrame
  let animationFrameId: number | null = null;
  let isRunning = false;

  const loop = () => {
    if (!isRunning) return;
    render();
    animationFrameId = requestAnimationFrame(loop);
  };

  const start = () => {
    if (isRunning) return;
    isRunning = true;
    loop();
  };

  const stop = () => {
    isRunning = false;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };

  onMount(async () => {
    await initWebGPU();
    start();

    window.addEventListener('resize', handleResize);
  });

  onCleanup(() => {
    stop();
    window.removeEventListener('resize', handleResize);

    brushStroke?.destroy();
    swapBuffer?.destroy();
    displayPass?.destroy();
    root?.destroy();
  });

  // Setup pointer input
  createEffect(
    on([() => canvasRef], () => {
      if (!canvasRef) return;

      usePointerInput({
        canvas: () => canvasRef,
        transform,
        onStroke: handleStroke,
        onStrokeEnd: handleStrokeEnd,
        brushSize,
        brushSpacing,
        canvasWidth: DEFAULT_CANVAS_WIDTH,
        canvasHeight: DEFAULT_CANVAS_HEIGHT
      });
    })
  );

  // Setup canvas transform
  createEffect(
    on([() => canvasRef], () => {
      if (!canvasRef) return;

      useCanvasTransform({
        canvas: () => canvasRef,
        transform,
        onTransformChange: handleTransformChange
      });
    })
  );

  return (
    <div
      style={{
        display: 'flex',
        'flex-direction': 'column',
        width: '100%',
        height: '100vh',
        background: '#1a1a1a'
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '16px',
          padding: '8px 16px',
          background: '#2a2a2a',
          'border-bottom': '1px solid #444',
          'flex-wrap': 'wrap'
        }}
      >
        {/* Color Picker */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <label style={{ color: '#ccc', 'font-size': '12px' }}>Color:</label>
          <input
            type="color"
            value={brushColor()}
            onInput={(e) => setBrushColor(e.currentTarget.value)}
            style={{ width: '32px', height: '32px', border: 'none', cursor: 'pointer' }}
          />
        </div>

        {/* Brush Size */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <label style={{ color: '#ccc', 'font-size': '12px' }}>Size:</label>
          <input
            type="range"
            min="1"
            max="100"
            value={brushSize()}
            onInput={(e) => setBrushSize(parseInt(e.currentTarget.value))}
            style={{ width: '80px' }}
          />
          <span style={{ color: '#999', 'font-size': '12px', width: '30px' }}>{brushSize()}</span>
        </div>

        {/* Brush Opacity */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <label style={{ color: '#ccc', 'font-size': '12px' }}>Opacity:</label>
          <input
            type="range"
            min="0"
            max="100"
            value={brushOpacity() * 100}
            onInput={(e) => setBrushOpacity(parseInt(e.currentTarget.value) / 100)}
            style={{ width: '80px' }}
          />
          <span style={{ color: '#999', 'font-size': '12px', width: '30px' }}>{Math.round(brushOpacity() * 100)}%</span>
        </div>

        {/* Brush Hardness */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <label style={{ color: '#ccc', 'font-size': '12px' }}>Hardness:</label>
          <input
            type="range"
            min="0"
            max="100"
            value={brushHardness() * 100}
            onInput={(e) => setBrushHardness(parseInt(e.currentTarget.value) / 100)}
            style={{ width: '80px' }}
          />
          <span style={{ color: '#999', 'font-size': '12px', width: '30px' }}>
            {Math.round(brushHardness() * 100)}%
          </span>
        </div>

        {/* Brush Spacing */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <label style={{ color: '#ccc', 'font-size': '12px' }}>Spacing:</label>
          <input
            type="range"
            min="1"
            max="100"
            value={brushSpacing()}
            onInput={(e) => setBrushSpacing(parseInt(e.currentTarget.value))}
            style={{ width: '80px' }}
          />
          <span style={{ color: '#999', 'font-size': '12px', width: '30px' }}>{brushSpacing()}%</span>
        </div>

        {/* Blend Mode */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <label style={{ color: '#ccc', 'font-size': '12px' }}>Blend:</label>
          <select
            value={blendMode()}
            onChange={(e) => setBlendMode(parseInt(e.currentTarget.value) as BlendMode)}
            style={{
              background: '#333',
              color: '#ccc',
              border: '1px solid #555',
              padding: '4px 8px',
              'border-radius': '4px'
            }}
          >
            {Object.entries(BLEND_MODE_LABELS).map(([value, label]) => (
              <option value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Color Blend Mode */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <label style={{ color: '#ccc', 'font-size': '12px' }}>Color Space:</label>
          <select
            value={colorBlendMode()}
            onChange={(e) => setColorBlendMode(parseInt(e.currentTarget.value) as ColorBlendMode)}
            style={{
              background: '#333',
              color: '#ccc',
              border: '1px solid #555',
              padding: '4px 8px',
              'border-radius': '4px'
            }}
          >
            {Object.entries(COLOR_BLEND_MODE_LABELS).map(([value, label]) => (
              <option value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Clear Button */}
        <button
          onClick={clearCanvas}
          style={{
            background: '#444',
            color: '#ccc',
            border: '1px solid #555',
            padding: '6px 12px',
            'border-radius': '4px',
            cursor: 'pointer'
          }}
        >
          Clear
        </button>

        {/* Reset Transform */}
        <button
          onClick={resetTransform}
          style={{
            background: '#444',
            color: '#ccc',
            border: '1px solid #555',
            padding: '6px 12px',
            'border-radius': '4px',
            cursor: 'pointer'
          }}
        >
          Reset View
        </button>
      </div>

      {/* Help text */}
      <div
        style={{
          padding: '4px 16px',
          background: '#222',
          'font-size': '11px',
          color: '#888'
        }}
      >
        Draw with left mouse • Middle mouse to pan • Scroll to zoom • Alt+drag to rotate
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          flex: 1,
          width: '100%',
          cursor: 'crosshair',
          'touch-action': 'none'
        }}
      />
    </div>
  );
}
