import type { BrushResource } from '@app-game/abr-paint/resources';
import type { Brush } from '@app-game/paint-core/brush';
import { defaultBrush } from '@app-game/paint-core/brush';
import { createDocument } from '@app-game/paint-core/document';
import { identityPressureCurve, isIdentityPressureCurve, type PressureCurve } from '@app-game/paint-core/pressureCurve';
import { ok } from 'neverthrow';
import { createMemo, createSignal, type Accessor, type Setter } from 'solid-js';
import { vi } from 'vitest';
import { createBrushSettingsEditor } from '../../features/brush/createBrushSettingsEditor';
import { createColorWheelSettings, hexToWheel, wheelToHex } from '../../features/color-wheel';
import { createRecentColors } from '../../features/color/createRecentColors';
import { hexToHsv } from '../../features/color/hsv';
import { createCoolorusSettings } from '../../features/coolorus-wheel/createCoolorusSettings';
import type { PaintSession } from '../../features/session';
import { defaultCell } from './grid';
import { createMockLayers } from './layersPrototype/mockLayers';
import type { LegoServices } from './LegoServices';
import { runPartCommand } from './partCommand';

/** Fake narrow capabilities for frame/definition tests. No PaintSession mock or GPU engine is required. */
export function createTestServices() {
  const [brush, setBrush] = createSignal({ ...defaultBrush(), color: '#ff0000' });
  const value = createMemo(() => brush().color);
  const recent = createRecentColors();
  const setColor = vi.fn((color: string) => setBrush((current) => ({ ...current, color })));
  const errors = vi.fn();
  const [penCurve, setPenCurve] = createSignal<PressureCurve>();
  const [gridCell, setGridCell] = createSignal(defaultCell);
  const services: LegoServices = {
    brushEditor: { ...createBrushEditor(brush, setBrush), open: () => {} },
    brush: {
      size: createMemo(() => brush().size),
      opacity: createMemo(() => brush().opacity),
      maxSize: createMemo(() => 5000 as const),
      update: vi.fn((patch) => setBrush((current) => ({ ...current, ...patch })))
    },
    color: {
      value,
      background: createMemo(() => brush().backgroundColor ?? '#ffffff'),
      hsv: createMemo(() => hexToHsv(value())),
      set: setColor,
      restore: setColor,
      swap: vi.fn(),
      recent,
      coolorus: createCoolorusSettings(),
      oklch: {
        wheel: createMemo(() => hexToWheel(value())),
        edit: vi.fn((wheel) => setColor(wheelToHex(wheel))),
        settle: vi.fn(),
        ...createColorWheelSettings()
      }
    },
    tools: { current: createMemo(() => 'brush' as const), preset: createMemo(() => ''), toggle: vi.fn(() => true) },
    history: { canUndo: createMemo(() => true), canRedo: createMemo(() => true), undo: vi.fn(), redo: vi.fn() },
    symmetry: {
      mode: createMemo(() => 'off' as const),
      canUpdate: createMemo(() => true),
      setMode: vi.fn(),
      toggle: vi.fn()
    },
    quickShape: { enabled: createMemo(() => true), toggle: vi.fn() },
    windows: { isOpen: () => false, toggle: vi.fn() },
    pen: {
      curve: () => penCurve() ?? identityPressureCurve,
      calibrated: () => !!penCurve(),
      marker: () => undefined,
      measured: () => [],
      save: vi.fn((curve: PressureCurve) => setPenCurve(isIdentityPressureCurve(curve) ? undefined : curve)),
      reset: vi.fn(() => setPenCurve(undefined)),
      open: vi.fn(),
      measure: vi.fn()
    },
    presets: {
      importFile: vi.fn(async () => {}),
      exportFile: vi.fn(async () => {}),
      all: () => [],
      resources: vi.fn(async () => ok([])),
      recent: () => [],
      use: vi.fn(),
      choose: vi.fn(async () => {})
    },
    transform: { active: () => false, toggle: vi.fn() },
    selection: { selected: () => false },
    layers: {
      wantThumbnails: vi.fn(() => vi.fn()),
      thumbnail: vi.fn(() => undefined),
      state: createMemo(createDocument().state),
      ready: createMemo(() => true),
      action: vi.fn(),
      blending: vi.fn()
    },
    layersPrototype: createMockLayers(),
    files: {
      ready: createMemo(() => true),
      import: vi.fn(),
      download: vi.fn(),
      png: vi.fn(),
      psd: vi.fn(),
      place: vi.fn()
    },
    options: {
      cell: () => gridCell(),
      setCell: vi.fn((cell: number) => setGridCell(cell)),
      open: vi.fn(),
      editLayout: vi.fn()
    },
    run: (command: () => unknown) => runPartCommand({ setError: errors }, command)
  };
  return { services, setBrush, brush, errors };
}

/**
 * The real brush settings editor over `brush`, as a session without presets has it: the brush's own document, with
 * document edits held for the one unnamed preset and published into `brush`.
 */
function createBrushEditor(brush: Accessor<Brush>, setBrush: Setter<Brush>) {
  const [edit, setEdit] = createSignal<ReturnType<PaintSession['tools']['documentEdit']>>(undefined, {
    ownedWrite: true
  });
  const tools = {
    preset: () => '',
    documentText: () => edit()?.abrDocument,
    documentEdit: () => edit(),
    setDocumentEdit: (_id: string, abrDocument: string, engine: Brush['engine'], resources: readonly BrushResource[]) =>
      setEdit({ base: undefined, abrDocument, engine, resources }),
    restoreDocumentEdit: (_id: string, restored: ReturnType<PaintSession['tools']['documentEdit']>) =>
      setEdit(restored),
    updateBrush: (patch: Partial<Brush>) => setBrush((current) => ({ ...current, ...patch }))
  };
  return createBrushSettingsEditor({
    tools,
    brush,
    library: { find: () => undefined },
    engine: { putResources: async () => ok(undefined) }
  } as unknown as PaintSession);
}
