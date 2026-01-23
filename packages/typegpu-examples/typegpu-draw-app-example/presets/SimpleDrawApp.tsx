/**
 * SimpleDrawApp Preset
 *
 * A minimal drawing app configuration with:
 * - Single layer
 * - Basic brush (no layers UI)
 * - Essential controls only
 *
 * Use this preset for simple sketching or as a starting point for customization.
 */

import { createSignal, onCleanup, onMount, untrack, type JSX } from 'solid-js';
import tgpu, { type TgpuRoot } from 'typegpu';
import { BlendPass } from '../blend/BlendPass';
import { SwapBuffer } from '../blend/SwapBuffer';
import { BrushStroke } from '../brush/BrushStroke';
import {
  DEFAULT_BRUSH_HARDNESS,
  DEFAULT_BRUSH_OPACITY,
  DEFAULT_BRUSH_SIZE,
  DEFAULT_BRUSH_SPACING,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH
} from '../constants';
import { DisplayPass } from '../display/DisplayPass';
import { BlendMode, ColorBlendMode, type CanvasTransform, type StrokePoint } from '../types';
import { BrushSettings } from '../ui/BrushSettings';
import { CanvasView } from '../ui/CanvasView';
import { ColorPicker } from '../ui/ColorPicker';

export interface SimpleDrawAppConfig {
  /** Canvas width (default: 4000) */
  canvasWidth?: number;
  /** Canvas height (default: 4000) */
  canvasHeight?: number;
  /** Initial brush color */
  initialColor?: string;
  /** Initial brush size */
  initialSize?: number;
  /** Show hardness control */
  showHardness?: boolean;
  /** Show spacing control */
  showSpacing?: boolean;
  /** Background color */
  backgroundColor?: string;
}

const defaultConfig: Required<SimpleDrawAppConfig> = {
  canvasWidth: DEFAULT_CANVAS_WIDTH,
  canvasHeight: DEFAULT_CANVAS_HEIGHT,
  initialColor: '#000000',
  initialSize: DEFAULT_BRUSH_SIZE,
  showHardness: true,
  showSpacing: false,
  backgroundColor: '#1a1a1a'
};

/**
 * Creates a simple drawing app component.
 */
export function createSimpleDrawApp(userConfig?: SimpleDrawAppConfig) {
  const config = { ...defaultConfig, ...userConfig };

  return function SimpleDrawApp(): JSX.Element {
    let canvasRef!: HTMLCanvasElement;

    const setCanvasRef = (el: HTMLCanvasElement) => {
      canvasRef = el;
    };

    // UI State
    const [brushColor, setBrushColor] = createSignal(config.initialColor);
    const [brushSize, setBrushSize] = createSignal(config.initialSize);
    const [brushOpacity, setBrushOpacity] = createSignal(DEFAULT_BRUSH_OPACITY);
    const [brushHardness, setBrushHardness] = createSignal(DEFAULT_BRUSH_HARDNESS);
    const [brushSpacing, setBrushSpacing] = createSignal(DEFAULT_BRUSH_SPACING);

    // GPU State
    let root: TgpuRoot | null = null;
    let context: GPUCanvasContext | null = null;
    let brushStroke: BrushStroke | null = null;
    let swapBuffer: SwapBuffer | null = null;
    let blendPass: BlendPass | null = null;
    let displayPass: DisplayPass | null = null;

    // Canvas transform
    const [transform, setTransform] = createSignal<CanvasTransform>({
      panX: 0,
      panY: 0,
      zoom: 1,
      rotation: 0
    });

    // Render state
    let needsRender = false;
    let pendingPoints: StrokePoint[] = [];
    let strokeInProgress = false;

    const handleStroke = (points: StrokePoint[]) => {
      pendingPoints.push(...points);
      strokeInProgress = true;
      needsRender = true;
    };

    const handleStrokeEnd = () => {
      strokeInProgress = false;
      needsRender = true;
    };

    const handleTransformChange = (newTransform: CanvasTransform) => {
      setTransform(newTransform);
      needsRender = true;
    };

    async function initWebGPU() {
      if (!canvasRef) return;

      try {
        root = await tgpu.init();
        context = canvasRef.getContext('webgpu');
        if (!context || !navigator.gpu) {
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

        brushStroke = new BrushStroke(root, config.canvasWidth, config.canvasHeight);
        swapBuffer = new SwapBuffer(root, config.canvasWidth, config.canvasHeight);
        blendPass = new BlendPass(root);
        displayPass = new DisplayPass(root, format);

        // Clear to white
        const encoder = root.device.createCommandEncoder();
        swapBuffer.clearRead(encoder, [1, 1, 1, 1]);
        root.device.queue.submit([encoder.finish()]);

        displayPass.updateTransform(transform(), width, height, config.canvasWidth, config.canvasHeight);
        needsRender = true;
      } catch (err) {
        console.error('Failed to initialize WebGPU:', err);
      }
    }

    function render() {
      if (!root || !context || !brushStroke || !swapBuffer || !blendPass || !displayPass) return;
      if (!needsRender) return;
      needsRender = false;

      brushStroke.setBrushSettings({
        color: untrack(brushColor),
        size: untrack(brushSize),
        opacity: untrack(brushOpacity),
        hardness: untrack(brushHardness)
      });

      blendPass.setBlendMode(BlendMode.NORMAL);
      blendPass.setColorBlendMode(ColorBlendMode.GAMMA);

      if (pendingPoints.length > 0) {
        brushStroke.addStrokePoints(pendingPoints);
        pendingPoints = [];
      }

      const encoder = root.device.createCommandEncoder();

      if (brushStroke.pendingCount > 0) {
        brushStroke.render(true);
        brushStroke.clearPending();
      }

      const brushTextureView = brushStroke.textureView;

      if (strokeInProgress) {
        displayPass.setBrushOverlay(brushTextureView);
      } else {
        const needsComposite = displayPass.hasBrushOverlayActive;
        if (needsComposite) {
          blendPass.render(encoder, brushTextureView, swapBuffer);
          brushStroke.clearTexture();
        }
        displayPass.setBrushOverlay(null);
      }

      displayPass.updateTransform(
        untrack(transform),
        canvasRef.width,
        canvasRef.height,
        config.canvasWidth,
        config.canvasHeight
      );

      const outputView = context.getCurrentTexture().createView();
      displayPass.render(encoder, swapBuffer.read.view, outputView);
      root.device.queue.submit([encoder.finish()]);
    }

    const clearCanvas = () => {
      if (!root || !swapBuffer) return;
      const encoder = root.device.createCommandEncoder();
      swapBuffer.clearRead(encoder, [1, 1, 1, 1]);
      root.device.queue.submit([encoder.finish()]);
      needsRender = true;
    };

    const handleResize = () => {
      if (!canvasRef) return;
      const width = canvasRef.clientWidth;
      const height = canvasRef.clientHeight;
      if (width !== canvasRef.width || height !== canvasRef.height) {
        canvasRef.width = width;
        canvasRef.height = height;
        needsRender = true;
      }
    };

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

    // Toolbar styles
    const toolbarStyle: JSX.CSSProperties = {
      display: 'flex',
      'align-items': 'center',
      gap: '16px',
      padding: '8px 16px',
      background: '#2a2a2a',
      'border-bottom': '1px solid #444',
      'flex-wrap': 'wrap'
    };

    const buttonStyle: JSX.CSSProperties = {
      background: '#444',
      color: '#ccc',
      border: '1px solid #555',
      padding: '6px 12px',
      'border-radius': '4px',
      cursor: 'pointer'
    };

    return (
      <div
        style={{
          display: 'flex',
          'flex-direction': 'column',
          width: '100%',
          height: '100vh',
          background: config.backgroundColor
        }}
      >
        {/* Simple Toolbar */}
        <div style={toolbarStyle}>
          <ColorPicker color={brushColor} setColor={setBrushColor} />

          <BrushSettings
            size={brushSize}
            setSize={setBrushSize}
            opacity={brushOpacity}
            setOpacity={setBrushOpacity}
            hardness={brushHardness}
            setHardness={setBrushHardness}
            spacing={brushSpacing}
            setSpacing={setBrushSpacing}
          />

          <button onClick={clearCanvas} style={buttonStyle}>
            Clear
          </button>
        </div>

        {/* Canvas */}
        <CanvasView
          ref={setCanvasRef}
          transform={transform}
          onTransformChange={handleTransformChange}
          onStroke={handleStroke}
          onStrokeEnd={handleStrokeEnd}
          brushSize={brushSize}
          brushSpacing={brushSpacing}
          canvasWidth={config.canvasWidth}
          canvasHeight={config.canvasHeight}
          onResize={handleResize}
        />
      </div>
    );
  };
}

/** Default simple draw app */
export const SimpleDrawApp = createSimpleDrawApp();

export default SimpleDrawApp;
