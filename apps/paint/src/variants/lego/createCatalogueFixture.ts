import { createMemo, createSignal } from 'solid-js';
import { fourLayers, seededDocument } from '../../component-canvas/seededLayers';
import { createBrushTools, maxBrushSize } from '../../features/brush';
import { builtInPresets, createBrushLibrary, type BrushPreset } from '../../features/brush-library';
import type { PreviewAttachment } from '../../features/brush-library/previewAttachment';
import { hexToWheel, wheelToHex, type ColorWheelSettings } from '../../features/color-wheel';
import { hexToHsv } from '../../features/color/hsv';
import type { CoolorusSettings } from '../../features/coolorus-wheel';
import type { PaintError } from '../../shared/errors';
import type { LegoServices } from './LegoServices';
import { runPartCommand } from './partCommand';

/** One in-memory catalogue scope, shared by all specimens. Uses real brush tools; never reads or writes user storage. */
export function createCatalogueFixture() {
  const library = createBrushLibrary({});
  const presets: BrushPreset[] = Array.from({ length: 64 }, (_, index) => ({
    ...builtInPresets[index % builtInPresets.length]!,
    id: `catalogue:${index}`,
    name: `Sample ${index + 1}`,
    resourceIds: []
  }));
  const tools = createBrushTools({
    library: {
      ...library,
      find: (id) => presets.find((preset) => preset.id === id) ?? library.find(id),
      load: async (id) => presets.find((preset) => preset.id === id) ?? library.find(id)
    },
    storage: { readState: async () => undefined, writeState: () => {} }
  });
  const color = createMemo(() => tools.brush().color);
  const [recent, setRecent] = createSignal<readonly string[]>([
    '#c4463a',
    '#3d6a8c',
    '#e6b93d',
    '#40816b',
    '#72567b',
    '#e9ded0'
  ]);
  const [settings, setSettings] = createSignal<ColorWheelSettings>({
    picker: 'wheel',
    harmony: 'none',
    mask: 'none',
    maskAngle: 0,
    customMask: []
  });
  const [coolorus, setCoolorus] = createSignal<CoolorusSettings>({ hues: 'ryb', lockLightness: false });
  const drawing = seededDocument(fourLayers);
  const [state, setState] = createSignal(drawing.state());
  const [error, setError] = createSignal<PaintError>();
  const setColor = (color: string) => {
    tools.updateBrush({ color });
  };
  const remember = (hex: string) => {
    setRecent((colors) => [hex, ...colors.filter((color) => color !== hex)].slice(0, 12));
  };
  const services: LegoServices = {
    brush: {
      size: createMemo(() => tools.brush().size),
      opacity: createMemo(() => tools.brush().opacity),
      maxSize: createMemo(() => maxBrushSize(tools.brush())),
      update: tools.updateBrush
    },
    color: {
      value: color,
      background: createMemo(() => tools.brush().backgroundColor ?? '#ffffff'),
      hsv: createMemo(() => hexToHsv(color())),
      set: setColor,
      restore: setColor,
      swap: tools.swapColors,
      recent: { colors: recent, remember },
      coolorus: {
        settings: coolorus,
        update: (patch) => {
          setCoolorus((current) => ({ ...current, ...patch }));
        }
      },
      oklch: {
        wheel: createMemo(() => hexToWheel(color())),
        edit: (wheel) => {
          setColor(wheelToHex(wheel));
        },
        settle: () => {
          remember(color());
        },
        settings,
        update: (patch) => {
          setSettings((current) => ({ ...current, ...patch }));
        }
      }
    },
    tools: { current: createMemo(tools.tool), preset: createMemo(tools.preset), toggle: () => true },
    history: { canUndo: createMemo(() => true), canRedo: createMemo(() => false), undo: () => {}, redo: () => {} },
    symmetry: { mode: createMemo(() => 'off' as const), setMode: () => {}, toggle: () => {} },
    quickShape: { enabled: createMemo(() => true), toggle: () => {} },
    windows: { isOpen: () => false, toggle: () => {} },
    presets: {
      all: () => presets,
      resources: library.resources,
      recent: () => presets.slice(0, 7).map((preset) => preset.id),
      use: () => {},
      choose: async (id) => {
        await tools.selectPreset(id, 'brush');
      }
    },
    transform: { active: () => false, toggle: () => {} },
    selection: { selected: () => false },
    layers: {
      wantThumbnails: () => () => {},
      thumbnail: () => undefined,
      state,
      ready: createMemo(() => true),
      action: (action) => {
        drawing.changeLayer(action);
        setState(drawing.state());
      },
      blending: (linear) => {
        drawing.setLinearBlending(linear);
        setState(drawing.state());
      }
    },
    files: {
      ready: createMemo(() => true),
      import: () => {},
      download: () => {},
      png: () => {},
      psd: () => {},
      place: async () => {}
    },
    run: (command) => runPartCommand({ setError }, command)
  };

  return { services, tools, presets, error, library: { ...library, presets: services.presets.all } };
}

/** Stable gallery sample provider. Paints a simple curve and never starts a PaintSession, worker, or cache write. */
export const attachCataloguePreview: NonNullable<Parameters<typeof PreviewAttachment>[0]['value']> = (canvas) => ({
  update(configuration) {
    canvas.width = configuration.width;
    canvas.height = configuration.height;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = configuration.background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = configuration.kind === 'brush' ? (configuration.brush.color ?? '#444444') : '#444444';
      context.lineWidth = Math.max(2, canvas.height * 0.12);
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(canvas.width * 0.12, canvas.height * 0.65);
      context.bezierCurveTo(
        canvas.width * 0.35,
        0,
        canvas.width * 0.65,
        canvas.height,
        canvas.width * 0.88,
        canvas.height * 0.35
      );
      context.stroke();
    }

    canvas.dataset.previewState = 'ready';
  },
  pause() {},
  dispose() {}
});
