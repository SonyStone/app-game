/**
 * FullDrawApp Preset
 *
 * A complete drawing app configuration with:
 * - Multiple layers
 * - Full blend mode support
 * - All brush controls
 * - Layer panel
 *
 * Use this preset for a full-featured drawing experience.
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
import { CanvasView } from '../ui/CanvasView';
import { LayerPanel, type LayerItem } from '../ui/LayerPanel';
import { Toolbar } from '../ui/Toolbar';

export interface FullDrawAppConfig {
  /** Canvas width (default: 4000) */
  canvasWidth?: number;
  /** Canvas height (default: 4000) */
  canvasHeight?: number;
  /** Initial brush color */
  initialColor?: string;
  /** Initial brush size */
  initialSize?: number;
  /** Initial number of layers */
  initialLayerCount?: number;
  /** Background color */
  backgroundColor?: string;
  /** Show layer panel */
  showLayerPanel?: boolean;
}

const defaultConfig: Required<FullDrawAppConfig> = {
  canvasWidth: DEFAULT_CANVAS_WIDTH,
  canvasHeight: DEFAULT_CANVAS_HEIGHT,
  initialColor: '#000000',
  initialSize: DEFAULT_BRUSH_SIZE,
  initialLayerCount: 1,
  backgroundColor: '#1a1a1a',
  showLayerPanel: true
};

/**
 * Creates a full-featured drawing app component with layers.
 */
export function createFullDrawApp(userConfig?: FullDrawAppConfig) {
  const config = { ...defaultConfig, ...userConfig };

  return function FullDrawApp(): JSX.Element {
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
    const [blendMode, setBlendMode] = createSignal<BlendMode>(BlendMode.NORMAL);
    const [colorBlendMode, setColorBlendMode] = createSignal<ColorBlendMode>(ColorBlendMode.GAMMA);

    // Layer state
    const [layers, setLayers] = createSignal<LayerItem[]>([]);
    const [activeLayerId, setActiveLayerId] = createSignal<string | null>(null);
    let layerCounter = 0;

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

    // Initialize layers
    const initializeLayers = () => {
      const initialLayers: LayerItem[] = [];
      for (let i = 0; i < config.initialLayerCount; i++) {
        layerCounter++;
        initialLayers.push({
          id: crypto.randomUUID(),
          name: `Layer ${layerCounter}`,
          visible: true,
          opacity: 1,
          locked: false,
          blendMode: 'normal'
        });
      }
      setLayers(initialLayers);
      if (initialLayers.length > 0) {
        setActiveLayerId(initialLayers[0].id);
      }
    };

    // Layer handlers
    const addLayer = () => {
      layerCounter++;
      const newLayer: LayerItem = {
        id: crypto.randomUUID(),
        name: `Layer ${layerCounter}`,
        visible: true,
        opacity: 1,
        locked: false,
        blendMode: 'normal'
      };
      setLayers((prev) => [...prev, newLayer]);
      setActiveLayerId(newLayer.id);
      needsRender = true;
    };

    const deleteLayer = (id: string) => {
      setLayers((prev) => {
        const filtered = prev.filter((l) => l.id !== id);
        // Select another layer if active was deleted
        if (activeLayerId() === id && filtered.length > 0) {
          setActiveLayerId(filtered[filtered.length - 1].id);
        } else if (filtered.length === 0) {
          setActiveLayerId(null);
        }
        return filtered;
      });
      needsRender = true;
    };

    const toggleVisibility = (id: string) => {
      setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
      needsRender = true;
    };

    const changeOpacity = (id: string, opacity: number) => {
      setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, opacity } : l)));
      needsRender = true;
    };

    const renameLayer = (id: string, name: string) => {
      setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
    };

    const moveLayerUp = (id: string) => {
      setLayers((prev) => {
        const index = prev.findIndex((l) => l.id === id);
        if (index < prev.length - 1) {
          const newLayers = [...prev];
          [newLayers[index], newLayers[index + 1]] = [newLayers[index + 1], newLayers[index]];
          return newLayers;
        }
        return prev;
      });
      needsRender = true;
    };

    const moveLayerDown = (id: string) => {
      setLayers((prev) => {
        const index = prev.findIndex((l) => l.id === id);
        if (index > 0) {
          const newLayers = [...prev];
          [newLayers[index], newLayers[index - 1]] = [newLayers[index - 1], newLayers[index]];
          return newLayers;
        }
        return prev;
      });
      needsRender = true;
    };

    const toggleLock = (id: string) => {
      setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)));
    };

    const handleStroke = (points: StrokePoint[]) => {
      // Don't draw on locked layers
      const active = layers().find((l) => l.id === activeLayerId());
      if (active?.locked) return;

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

        // Initialize layers after GPU is ready
        initializeLayers();

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

      blendPass.setBlendMode(untrack(blendMode));
      blendPass.setColorBlendMode(untrack(colorBlendMode));

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

    const resetTransform = () => {
      setTransform({
        panX: 0,
        panY: 0,
        zoom: 1,
        rotation: 0
      });
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
        {/* Full Toolbar */}
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
        />

        {/* Main content area */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
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
            style={{ flex: 1 }}
          />

          {/* Layer Panel */}
          {config.showLayerPanel && (
            <div style={{ padding: '8px', background: '#222' }}>
              <LayerPanel
                layers={layers}
                activeLayerId={activeLayerId}
                onSelectLayer={setActiveLayerId}
                onToggleVisibility={toggleVisibility}
                onChangeOpacity={changeOpacity}
                onRenameLayer={renameLayer}
                onAddLayer={addLayer}
                onDeleteLayer={deleteLayer}
                onMoveLayerUp={moveLayerUp}
                onMoveLayerDown={moveLayerDown}
                onToggleLock={toggleLock}
              />
            </div>
          )}
        </div>
      </div>
    );
  };
}

/** Default full draw app */
export const FullDrawApp = createFullDrawApp();

export default FullDrawApp;
