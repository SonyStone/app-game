// @vitest-environment jsdom
import type { RendererToolState } from '@app-game/abr-paint/gpu/toolState';
import { defaultBrush } from '@app-game/paint-core/brush';
import { defaultCamera } from '@app-game/paint-core/camera';
import { createDocument } from '@app-game/paint-core/document';
import type { PaintEvent } from '@app-game/paint-core/protocol';
import { defaultPaintSymmetry } from '@app-game/paint-core/symmetry';
import { render } from '@solidjs/web';
import { ok } from 'neverthrow';
import { createSignal, flush, Show } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import type { PaintError } from '../../shared/errors';
import { createAbrPresets, type AbrPreset } from '../abr';
import { createBrushTools } from '../brush';
import { createBrushLibrary, createPresetUploads } from '../brush-library';
import { PaintCanvas } from '../canvas';
import { createDeveloperSettings } from '../developer';
import { createPaintShortcuts } from '../studio/createPaintShortcuts';
import { createSymmetry } from '../symmetry';
import { createPaintEngine } from './createPaintEngine';
import type { EngineCommand, EngineHandlers, EngineInit, ExecutionMode } from './openPaintTransport';

const transports = vi.hoisted(() => ({ opened: [] as FakeTransport[] }));
vi.mock('./openPaintTransport', () => ({
  openPaintTransport: (mode: ExecutionMode, canvas: HTMLCanvasElement, init: EngineInit, handlers: EngineHandlers) => {
    const transport = { mode, canvas, init, handlers, post: vi.fn(() => ok()), close: vi.fn() };
    transports.opened.push(transport);
    return ok(transport);
  }
}));

type FakeTransport = {
  mode: ExecutionMode;
  canvas: HTMLCanvasElement;
  init: EngineInit;
  handlers: EngineHandlers;
  post: ReturnType<typeof vi.fn<(command: EngineCommand) => ReturnType<typeof ok>>>;
  close: ReturnType<typeof vi.fn>;
};

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  transports.opened.length = 0;
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
});

it.each([false, true])(
  'switches execution mode, keeping the document, UI settings and a selected preset (ABR: %s)',
  async (withTip) => {
    history.replaceState(null, '', '/');
    const editor = await mount();
    const { engine, tools, symmetry, presets, developer } = editor;
    const originalCanvas = document.querySelector('canvas')!;
    const stage = originalCanvas.parentElement;
    const first = transports.opened[0]!;
    expect(first.mode).toBe('worker');
    expect(first.canvas).toBe(originalCanvas);

    const settings = { ...defaultPaintSymmetry(), mode: 'mandala' as const, x: -51, segments: 7 };
    expect(symmetry.update(settings)).toBe(false);
    expect(symmetry.symmetry()).toEqual(defaultPaintSymmetry());
    reply(first, { type: 'ready' });
    expect(symmetry.update(settings)).toBe(true);
    expect(first.post).toHaveBeenLastCalledWith({ type: 'feature', feature: 'symmetry', command: settings });

    if (withTip) {
      const applying = presets.usePreset(inkPreset(), 'abr:ink');
      await vi.waitFor(() => expect(uploaded(first)).toBeDefined());
      confirmUpload(first);
      expect(await applying).toEqual(ok());
      flush();
      expect(tools.brush().engine).toEqual(inkPreset().engine);
    }

    tools.updateBrush({ size: 123, color: '#123456', backgroundColor: '#abcdef' });
    flush();
    tools.chooseTool('eraser');
    flush();
    tools.chooseTool('brush');
    flush();
    expect(tools.brush()).toMatchObject({ color: '#123456', backgroundColor: '#abcdef' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    flush();
    expect(tools.brush()).toMatchObject({ color: '#abcdef', backgroundColor: '#123456' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', repeat: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', altKey: true }));
    flush();
    expect(tools.brush()).toMatchObject({ color: '#abcdef', backgroundColor: '#123456' });
    expect(developer.adaptiveQuality()).toBe(true);
    developer.setAdaptiveQuality(false);
    developer.setLiveTail(false);
    developer.setShowPenCursor(true);
    developer.setDebug(true);
    flush();

    expect(engine.switchMode('main')).toBe(true);
    flush();
    expect(first.post).toHaveBeenLastCalledWith({ type: 'checkpoint', includeTools: true });
    expect(engine.switching()).toBe(true);
    expect(engine.canEdit()).toBe(false);
    expect(symmetry.update(defaultPaintSymmetry())).toBe(false);
    expect(symmetry.symmetry()).toEqual(settings);
    reply(first, { type: 'error', recoverable: false, message: 'Storage is full' });
    expect(engine.switching()).toBe(false);
    expect(editor.error()).toMatchObject({ kind: 'engine', code: 'failed', message: 'Storage is full' });
    expect(symmetry.symmetry()).toEqual(settings);
    expect(tools.brush()).toMatchObject({ color: '#abcdef', backgroundColor: '#123456' });
    expect(document.querySelector('canvas')).toBe(originalCanvas);
    expect(transports.opened).toHaveLength(1);
    expect(first.close).not.toHaveBeenCalled();

    expect(engine.switchMode('main')).toBe(true);
    flush();
    const tools2: RendererToolState = {
      version: 1,
      mixer: withTip
        ? {
            key: 'previous-mixer',
            color: '#123456',
            remaining: 0.125,
            settings: { load: 0.75, autoFill: false, autoClean: false },
            pixels: new Uint8Array(3 * 256 * 256 * 8)
          }
        : undefined
    };
    const historySource = { id: 7, label: 'State 7', layers: [] };
    reply(first, { type: 'checkpointed', tools: tools2, historySource });
    expect(first.post).toHaveBeenLastCalledWith({ type: 'dispose' });
    expect(document.querySelector('canvas')).toBe(originalCanvas);
    const lateMessage = first.handlers.message;
    reply(first, { type: 'disposed' });
    expect(first.close).toHaveBeenCalledOnce();
    expect(transports.opened).toHaveLength(2);
    const replacement = document.querySelector('canvas')!;
    expect(replacement).not.toBe(originalCanvas);
    expect(replacement.parentElement).toBe(stage);
    expect(engine.switching()).toBe(true);
    const second = transports.opened[1]!;
    expect(second).toMatchObject({ mode: 'main', canvas: replacement });
    expect(second.init).toMatchObject({ tools: tools2, historySource });

    reply(second, { type: 'ready' });
    if (withTip) {
      expect(engine.ready()).toBe(false);
      expect(engine.switching()).toBe(true);
      expect(editor.library.find(tools.preset()!)?.name).toBe('Ink');
      await vi.waitFor(() => expect(uploaded(second)).toBeDefined());
      confirmUpload(second);
      await vi.waitFor(() => {
        flush();
        expect(engine.ready()).toBe(true);
      });
      expect(tools.brush().engine).toEqual(inkPreset().engine);
    }

    expect(engine.switching()).toBe(false);
    expect(engine.mode()).toBe('main');
    expect(new URL(location.href).searchParams.get('paintThread')).toBe('main');
    expect(engine.canEdit()).toBe(true);
    expect(symmetry.symmetry()).toEqual(settings);
    expect(tools.brush().size).toBe(123);
    expect(tools.brush()).toMatchObject({ color: '#abcdef', backgroundColor: '#123456' });
    if (withTip) {
      const ink = tools.preset();
      tools.selectPreset('builtin:soft-round', 'brush');
      flush();
      expect(tools.brush().engine).toBeUndefined();
      expect(tools.brush().size).toBe(defaultBrush().size);
      // The ink preset remembers its size change.
      tools.selectPreset(ink, 'brush');
      flush();
      expect(tools.brush().size).toBe(123);
      expect(tools.brush().engine?.id).toBe('textured');
    }

    expect(developer.adaptiveQuality()).toBe(false);
    expect(second.post).toHaveBeenCalledWith({ type: 'adaptive-quality', enabled: false });
    expect(developer.showPenCursor()).toBe(true);
    expect(second.post).toHaveBeenCalledWith({ type: 'live-tail', enabled: false });
    expect(second.post).toHaveBeenCalledWith({ type: 'debug', enabled: true });
    editor.clearError();
    lateMessage({ type: 'error', message: 'Retired engine', recoverable: false });
    flush();
    expect(editor.error()).toBeUndefined();

    dispose?.();
    dispose = undefined;
    expect(second.post).toHaveBeenLastCalledWith({ type: 'dispose' });
    expect(second.close).not.toHaveBeenCalled();
    reply(second, { type: 'disposed' });
    expect(second.close).toHaveBeenCalledOnce();
  }
);

it('pauses on a renderer failure and resets the camera and symmetry from a restored document', async () => {
  const { engine, error, symmetry } = await mount();
  const transport = transports.opened[0]!;
  const camera = { ...defaultCamera(), x: 12, zoom: 3 };
  const features = { symmetry: { ...defaultPaintSymmetry(), mode: 'radial' as const, segments: 5 } };
  reply(transport, { type: 'ready' });
  reply(transport, { type: 'restored', camera, features });
  expect(engine.restored()).toEqual({ camera, features });
  expect(symmetry.symmetry()).toEqual(features.symmetry);
  reply(transport, { type: 'error', recoverable: true, code: 'lost', message: 'Device lost' });
  expect(engine.ready()).toBe(false);
  expect(error()).toMatchObject({ kind: 'gpu', code: 'lost' });
});

it('resets the editor when the worker fails: pauses input, ends the stroke, settles uploads and clears the selection', async () => {
  const { engine, error, onSelection } = await mount();
  const transport = transports.opened[0]!;
  reply(transport, { type: 'ready' });
  expect(engine.canEdit()).toBe(true);
  engine.send({ type: 'begin', brush: defaultBrush(), samples: [{ x: 1, y: 1, pressure: 1, time: 0 }] });
  expect(engine.isDrawing()).toBe(true);
  const upload = engine.putResources([
    { id: 'tip', width: 1, height: 1, format: 'r8unorm', pixels: new Uint8Array([255]) }
  ]);
  onSelection.mockClear();

  transport.handlers.error({ kind: 'error', cause: new ErrorEvent('error', { message: 'Worker crashed' }) });
  flush();

  expect(engine.ready()).toBe(false);
  expect(engine.canEdit()).toBe(false);
  expect(engine.isDrawing()).toBe(false);
  expect(error()).toMatchObject({ kind: 'engine', code: 'stopped', message: 'Worker crashed' });
  expect((await upload).isErr()).toBe(true);
  expect(onSelection).toHaveBeenCalledOnce();
  expect(onSelection).toHaveBeenCalledWith({
    type: 'selection',
    selection: { selected: false, inverted: false },
    hasClipboard: false
  });
});

it('restarts a stopped engine on a new canvas after asking the failed one to save and dispose', async () => {
  const { engine, error } = await mount();
  const first = transports.opened[0]!;
  reply(first, { type: 'ready' });
  reply(first, stateEvent('saving'));
  expect(engine.restart()).toBe(false);

  first.handlers.error({ kind: 'error', cause: new ErrorEvent('error', { message: 'Worker crashed' }) });
  flush();
  expect(error()).toMatchObject({ kind: 'engine', code: 'stopped' });
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  expect(first.post).toHaveBeenLastCalledWith({ type: 'save' });

  expect(engine.restart('main')).toBe(true);
  flush();
  expect(first.post).toHaveBeenLastCalledWith({ type: 'dispose' });
  expect(transports.opened).toHaveLength(2);
  expect(transports.opened[1]!.mode).toBe('main');
  expect(error()).toBeUndefined();
  reply(transports.opened[1]!, { type: 'ready' });
  expect(engine.canEdit()).toBe(true);
});

it('keeps a stroke and a switch in progress when autosave fails in the background', async () => {
  const { engine, error } = await mount();
  const transport = transports.opened[0]!;
  reply(transport, { type: 'ready' });
  engine.send({ type: 'begin', brush: defaultBrush(), samples: [{ x: 1, y: 1, pressure: 1, time: 0 }] });
  reply(transport, { type: 'error', recoverable: false, background: true, message: 'Quota exceeded' });
  expect(error()).toMatchObject({ message: 'Quota exceeded' });
  expect(engine.isDrawing()).toBe(true);

  engine.send({ type: 'end' });
  expect(engine.switchMode('main')).toBe(true);
  reply(transport, { type: 'error', recoverable: false, background: true, message: 'Quota exceeded' });
  expect(engine.switching()).toBe(true);
  reply(transport, { type: 'error', recoverable: false, message: 'Checkpoint failed' });
  expect(engine.switching()).toBe(false);
});

it('reads a displayed color through a correlated request', async () => {
  const { engine } = await mount();
  const transport = transports.opened[0]!;
  reply(transport, { type: 'ready' });
  const picking = engine.pickColor({ x: 12, y: 34 });
  const request = transport.post.mock.calls
    .map(([command]) => command)
    .find((command) => command.type === 'pick-color');
  expect(request).toMatchObject({ type: 'pick-color', point: { x: 12, y: 34 } });
  reply(transport, {
    type: 'picked-color',
    requestId: request!.type === 'pick-color' ? request!.requestId : '',
    result: { ok: true, value: { color: '#102030' } }
  });
  expect((await picking)._unsafeUnwrap()).toEqual({ color: '#102030' });
});

it('uploads a resource set again when its own upload evicts a member that was already resident', async () => {
  const { engine } = await mount();
  const transport = transports.opened[0]!;
  reply(transport, { type: 'ready' });
  const resource = (id: string) => ({
    id,
    width: 1,
    height: 1,
    format: 'r8unorm' as const,
    pixels: new Uint8Array([255])
  });

  const pattern = engine.putResources([resource('pattern')]);
  replyToUpload(transport, 'pattern', []);
  expect(await pattern).toEqual(ok());

  const preset = engine.putResources([resource('tip'), resource('pattern')]);
  await vi.waitFor(() => replyToUpload(transport, 'tip', ['pattern']));
  await vi.waitFor(() => replyToUpload(transport, 'pattern', []));
  expect(await preset).toEqual(ok());
  expect(uploads(transport)).toEqual(['pattern', 'tip', 'pattern']);
});

it('abandons a switch that gets no checkpoint, keeping the engine editable', async () => {
  vi.useFakeTimers();
  try {
    const { engine, error } = await mount();
    const transport = transports.opened[0]!;
    reply(transport, { type: 'ready' });
    expect(engine.switchMode('main')).toBe(true);
    flush();
    expect(engine.canEdit()).toBe(false);

    vi.advanceTimersByTime(60_000);
    flush();
    expect(engine.switching()).toBe(false);
    expect(engine.canEdit()).toBe(true);
    expect(engine.mode()).toBe('worker');
    expect(error()).toMatchObject({ kind: 'engine', code: 'timeout' });
  } finally {
    vi.useRealTimers();
  }
});

it.each(['error', 'timeout'] as const)(
  'completes a switch when the retired engine fails to dispose (%s)',
  async (failure) => {
    vi.useFakeTimers();
    try {
      const { engine } = await mount();
      const first = transports.opened[0]!;
      reply(first, { type: 'ready' });
      engine.switchMode('main');
      flush();
      reply(first, { type: 'checkpointed' });
      expect(first.post).toHaveBeenLastCalledWith({ type: 'dispose' });

      if (failure === 'error') {
        reply(first, { type: 'error', recoverable: false, message: 'Storage closed' });
      } else {
        vi.advanceTimersByTime(60_000);
        flush();
      }

      expect(first.close).toHaveBeenCalledOnce();
      expect(engine.mode()).toBe('main');
      expect(transports.opened).toHaveLength(2);
      reply(transports.opened[1]!, { type: 'ready' });
      expect(engine.canEdit()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  }
);

it('ends a switch whose replacement engine never becomes ready', async () => {
  vi.useFakeTimers();
  try {
    const { engine, error } = await mount();
    const first = transports.opened[0]!;
    reply(first, { type: 'ready' });
    engine.switchMode('main');
    flush();
    reply(first, { type: 'checkpointed' });
    reply(first, { type: 'disposed' });
    expect(transports.opened).toHaveLength(2);
    expect(engine.switching()).toBe(true);

    vi.advanceTimersByTime(60_000);
    flush();
    expect(engine.switching()).toBe(false);
    expect(error()).toMatchObject({ kind: 'engine', code: 'timeout' });
  } finally {
    vi.useRealTimers();
  }
});

it('stays paused when the renderer fails while a preset is restored', async () => {
  const { engine, presets } = await mount();
  const first = transports.opened[0]!;
  reply(first, { type: 'ready' });
  const applying = presets.usePreset(inkPreset(), 'abr:ink');
  await vi.waitFor(() => expect(uploaded(first)).toBeDefined());
  confirmUpload(first);
  expect(await applying).toEqual(ok());

  // A recovered renderer reports `ready` again, then is lost before the preset's restore settles.
  reply(first, { type: 'ready' });
  expect(engine.ready()).toBe(false);
  reply(first, { type: 'error', recoverable: true, code: 'lost', message: 'Device lost' });
  await new Promise((resolve) => setTimeout(resolve));
  flush();
  expect(engine.ready()).toBe(false);
});

it('refuses to switch during a stroke and saves pending changes when the page is hidden', async () => {
  const { engine } = await mount();
  const transport = transports.opened[0]!;
  reply(transport, { type: 'ready' });
  engine.send({ type: 'begin', brush: defaultBrush(), samples: [{ x: 1, y: 1, pressure: 1, time: 0 }] });
  expect(engine.switchMode('main')).toBe(false);

  reply(transport, stateEvent('unsaved'));
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  expect(transport.post).toHaveBeenLastCalledWith({ type: 'save' });

  transport.post.mockClear();
  reply(transport, stateEvent('saved'));
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  expect(transport.post).not.toHaveBeenCalledWith({ type: 'save' });
});

function stateEvent(saveState: Extract<PaintEvent, { type: 'state' }>['saveState']): PaintEvent {
  return {
    type: 'state',
    document: createDocument().state(),
    saveState,
    camera: defaultCamera(),
    features: { symmetry: defaultPaintSymmetry() },
    saved: saveState === 'saved',
    residentTiles: 0,
    gpuBytes: 0,
    renderMs: 0
  } as PaintEvent;
}

/**
 * Assembles the engine with the UI state that must survive an engine replacement, as the studio does, and waits for
 * the brush state to load, so that the engine becomes ready on its first `ready` event.
 */
async function mount() {
  let editor!: ReturnType<typeof assemble>;
  dispose = render(() => {
    editor = assemble();
    return (
      <div>
        <Show when={editor.engine.session()} keyed>
          {(session) => (
            <PaintCanvas
              connect={(canvas) => editor.engine.connect(canvas, session.mode)}
              input={{
                camera: defaultCamera,
                size: () => ({ width: 256, height: 256 }),
                brush: editor.tools.brush,
                ready: () => false,
                navigate: () => {},
                send: () => {},
                cursor: () => {}
              }}
              crosshair={false}
            />
          )}
        </Show>
      </div>
    );
  }, document.body);
  flush();
  await editor.tools.loaded;
  return editor;
}

function assemble() {
  const [error, setError] = createSignal<PaintError>();
  const onSelection = vi.fn<Parameters<typeof createPaintEngine>[0]['onSelection']>();
  const developer = createDeveloperSettings();
  const library = createBrushLibrary({});
  const tools = createBrushTools({ library });
  const engine = createPaintEngine({
    settings: developer,
    onError: setError,
    onSelection,
    prepare: () => uploads.restore()
  });
  const symmetry = createSymmetry({
    restored: () => engine.restored()?.features,
    canUpdate: engine.canEdit,
    send: engine.send
  });
  const uploads = createPresetUploads({
    resources: library.resources,
    upload: engine.putResources,
    canChange: () => engine.canEdit() && !engine.isDrawing(),
    select: tools.selectPreset,
    inUse: tools.presets,
    onUnavailable: (preset) => tools.abandonPreset(preset.id),
    loaded: tools.loaded
  });
  const presets = createAbrPresets({
    library,
    choose: (preset) => uploads.choose(preset, tools.slot()),
    canChange: () => engine.canEdit() && !engine.isDrawing() && !uploads.isBusy()
  });
  createPaintShortcuts({
    closePanel: () => false,
    tool: tools.tool,
    chooseTool: tools.chooseTool,
    selectionAction: () => {},
    deselect: () => {},
    selectAll: () => {},
    invertSelection: () => {},
    chooseWand: () => {},
    undo: () => {},
    redo: () => {},
    save: () => {},
    swapColors: tools.swapColors,
    resetColors: tools.resetColors,
    scaleBrush: tools.scaleSize,
    zoomBy: () => {},
    resetZoom: () => {},
    transform: () => {},
    confirm: () => false,
    cancel: () => {}
  });
  return {
    engine,
    tools,
    library,
    symmetry,
    presets,
    developer,
    error,
    onSelection,
    clearError: () => setError(undefined)
  };
}

function reply(transport: FakeTransport, event: PaintEvent) {
  transport.handlers.message(event);
  flush();
}

function uploaded(transport: FakeTransport) {
  return transport.post.mock.calls.map(([command]) => command).find((command) => command.type === 'brush-resources');
}

function uploads(transport: FakeTransport) {
  return transport.post.mock.calls.flatMap(([command]) =>
    command.type === 'brush-resources' && command.action === 'put' ? [command.resource.id] : []
  );
}

/** Acknowledges the latest upload, which must be `id`, reporting `evicted` as removed from the engine cache. */
function replyToUpload(transport: FakeTransport, id: string, evicted: string[]) {
  const request = transport.post.mock.calls
    .map(([command]) => command)
    .findLast((command) => command.type === 'brush-resources');
  if (request?.type !== 'brush-resources' || request.action !== 'put' || request.resource.id !== id) {
    throw new Error(`Expected an upload of ${id}`);
  }

  reply(transport, {
    type: 'brush-resources',
    requestId: request.requestId,
    result: { ok: true, value: { evicted, stats: { bytes: 1, entries: 1, pinnedBytes: 0 } } }
  });
}

function confirmUpload(transport: FakeTransport) {
  const request = uploaded(transport);
  if (!request || request.type !== 'brush-resources') {
    throw new Error('Expected tip upload');
  }

  reply(transport, {
    type: 'brush-resources',
    requestId: request.requestId,
    result: { ok: true, value: { evicted: [], stats: { bytes: 1, entries: 1, pinnedBytes: 0 } } }
  });
}

function inkPreset() {
  return {
    name: 'Ink',
    engine: { id: 'textured', settings: { tipId: 'ink-tip' } },
    resources: [{ id: 'ink-tip', width: 1, height: 1, format: 'r8unorm', pixels: new Uint8Array([255]) }],
    size: defaultBrush().size,
    spacing: defaultBrush().spacing
  } as unknown as AbrPreset;
}
