import { defaultBrush } from '@app-game/paint-core/brush';
import { createDocument } from '@app-game/paint-core/document';
import { ok } from 'neverthrow';
import { createMemo, createSignal } from 'solid-js';
import { vi } from 'vitest';
import { createColorWheelSettings, hexToWheel, wheelToHex } from '../../features/color-wheel';
import { createRecentColors } from '../../features/color/createRecentColors';
import { hexToHsv } from '../../features/color/hsv';
import { createCoolorusSettings } from '../../features/coolorus-wheel/createCoolorusSettings';
import type { LegoServices } from './LegoServices';
import { runPartCommand } from './partCommand';

/** Fake narrow capabilities for frame/definition tests. No PaintSession mock or GPU engine is required. */
export function createTestServices() {
  const [brush, setBrush] = createSignal({ ...defaultBrush(), color: '#ff0000' });
  const value = createMemo(() => brush().color);
  const recent = createRecentColors();
  const setColor = vi.fn((color: string) => setBrush((current) => ({ ...current, color })));
  const errors = vi.fn();
  const services: LegoServices = {
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
    windows: { isOpen: () => false, toggle: vi.fn() },
    presets: {
      all: () => [],
      resources: vi.fn(async () => ok([])),
      recent: () => [],
      use: vi.fn(),
      choose: vi.fn(async () => {})
    },
    transform: { active: () => false, toggle: vi.fn() },
    selection: { selected: () => false },
    layers: {
      state: createMemo(createDocument().state),
      ready: createMemo(() => true),
      action: vi.fn(),
      blending: vi.fn()
    },
    files: {
      ready: createMemo(() => true),
      import: vi.fn(),
      download: vi.fn(),
      png: vi.fn(),
      psd: vi.fn(),
      place: vi.fn()
    },
    run: (command: () => unknown) => runPartCommand({ setError: errors }, command)
  };
  return { services, setBrush, brush, errors };
}
