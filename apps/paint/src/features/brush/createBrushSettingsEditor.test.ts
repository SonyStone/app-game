// @vitest-environment jsdom
import type { BrushAsset } from '@app-game/abr-brush/library';
import { initAbr } from '@app-game/abr-parser';
import { defaultBrush } from '@app-game/paint-core/brush';
import { createRoot, createSignal, flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import type { PaintSession } from '../session';
import { createBrushSettingsEditor } from './createBrushSettingsEditor';

vi.mock('@app-game/abr-parser', () => ({ initAbr: vi.fn(async () => {}) }));

it('initializes the parser only for an ABR source with an editor or pinned-setting consumer', async () => {
  vi.mocked(initAbr).mockClear();
  const state = createRoot((dispose) => {
    const [source, setSource] = createSignal<BrushAsset>();
    const [needed, setNeeded] = createSignal(false);
    const session = {
      tools: { preset: () => 'test' },
      library: { find: () => ({ abrSource: source() }) },
      brush: defaultBrush,
      engine: {}
    } as unknown as PaintSession;
    createBrushSettingsEditor(session, needed);
    return { dispose, setSource, setNeeded };
  });
  try {
    flush();
    expect(initAbr).not.toHaveBeenCalled();
    state.setNeeded(true);
    flush();
    expect(initAbr).not.toHaveBeenCalled();
    state.setNeeded(false);
    state.setSource({} as BrushAsset);
    flush();
    expect(initAbr).not.toHaveBeenCalled();
    state.setNeeded(true);
    flush();
    expect(initAbr).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    state.setNeeded(false);
    state.setNeeded(true);
    flush();
    expect(initAbr).toHaveBeenCalledTimes(1);
  } finally {
    state.dispose();
  }
});
