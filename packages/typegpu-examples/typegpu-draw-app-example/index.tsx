import { createSignal, onCleanup, onMount, untrack, type JSX } from 'solid-js';
import tgpu, { type TgpuRoot } from 'typegpu';
import { BlendPass } from './blend/BlendPass';
import { SwapBuffer } from './blend/SwapBuffer';
import { BrushStroke } from './brush/BrushStroke';
import {
  DEFAULT_BRUSH_HARDNESS,
  DEFAULT_BRUSH_OPACITY,
  DEFAULT_BRUSH_SIZE,
  DEFAULT_BRUSH_SPACING,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH
} from './constants';
import { DisplayPass } from './display/DisplayPass';
import { BlendMode, ColorBlendMode, type CanvasTransform, type StrokePoint } from './types';
import { CanvasView } from './ui/CanvasView';
import { PointerDebugOverlay } from './ui/PointerDebugOverlay';
import { Toolbar } from './ui/Toolbar';

export default function TypeGPUDrawApp(): JSX.Element {
  const [canvasRef, setCanvasRef] = createSignal<HTMLCanvasElement | undefined>(undefined);
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement | undefined>(undefined);

  // UI State
  const [brushColor, setBrushColor] = createSignal('#000000');
  const [brushSize, setBrushSize] = createSignal(DEFAULT_BRUSH_SIZE);
  const [brushOpacity, setBrushOpacity] = createSignal(DEFAULT_BRUSH_OPACITY);
  const [brushHardness, setBrushHardness] = createSignal(DEFAULT_BRUSH_HARDNESS);
  const [brushSpacing, setBrushSpacing] = createSignal(DEFAULT_BRUSH_SPACING);
  const [blendMode, setBlendMode] = createSignal<BlendMode>(BlendMode.NORMAL);
  const [colorBlendMode, setColorBlendMode] = createSignal<ColorBlendMode>(ColorBlendMode.GAMMA);

  // Debug state
  const [debugEnabled, setDebugEnabled] = createSignal(false);

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
    const canvas = canvasRef();
    if (!canvas) return;

    try {
      root = await tgpu.init();

      // Configure canvas
      context = canvas.getContext('webgpu');
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

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = width;
      canvas.height = height;

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
      canvasRef()?.width || DEFAULT_CANVAS_WIDTH,
      canvasRef()?.height || DEFAULT_CANVAS_HEIGHT,
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
  });

  onCleanup(() => {
    stop();

    brushStroke?.destroy();
    swapBuffer?.destroy();
    displayPass?.destroy();
    root?.destroy();
  });

  return (
    <div
      ref={setContainerRef}
      style={{
        display: 'flex',
        'flex-direction': 'column',
        width: '100%',
        height: '100vh',
        background: '#1a1a1a'
      }}
    >
      {/* Toolbar with all controls */}
      <Toolbar
        brushColor={brushColor}
        setBrushColor={setBrushColor}
        brushSize={brushSize}
        setBrushSize={setBrushSize}
        brushOpacity={brushOpacity}
        setBrushOpacity={setBrushOpacity}
        brushHardness={brushHardness}
        setBrushHardness={setBrushHardness}
        brushSpacing={brushSpacing}
        setBrushSpacing={setBrushSpacing}
        blendMode={blendMode}
        setBlendMode={setBlendMode}
        colorBlendMode={colorBlendMode}
        setColorBlendMode={setColorBlendMode}
        onClear={clearCanvas}
        onResetView={resetTransform}
        debugEnabled={debugEnabled}
        setDebugEnabled={setDebugEnabled}
      />

      {/* Canvas */}
      <CanvasView
        ref={setCanvasRef}
        transform={transform}
        onTransformChange={handleTransformChange}
        onStroke={handleStroke}
        onStrokeEnd={handleStrokeEnd}
        brushSize={brushSize}
        brushSpacing={brushSpacing}
        canvasWidth={DEFAULT_CANVAS_WIDTH}
        canvasHeight={DEFAULT_CANVAS_HEIGHT}
        debug={debugEnabled}
        onResize={() => {
          const canvas = canvasRef();
          if (!canvas) return;

          const width = canvas.clientWidth;
          const height = canvas.clientHeight;

          if (width !== canvas.width || height !== canvas.height) {
            canvas.width = width;
            canvas.height = height;

            // Drawing canvas stays the same size (DEFAULT_CANVAS_WIDTH x DEFAULT_CANVAS_HEIGHT)
            // Only the display adapts to window size

            needsRender = true;
          }
        }}
      />

      {/* Debug overlay */}
      <PointerDebugOverlay enabled={debugEnabled} container={containerRef} />
    </div>
  );
}
