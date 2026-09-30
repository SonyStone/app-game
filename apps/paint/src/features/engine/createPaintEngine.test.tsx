// @vitest-environment jsdom
import type { RendererToolState } from '@app-game/abr-paint/gpu/toolState';
import { defaultBrush } from '@app-game/paint-core/brush';
import { defaultCamera } from '@app-game/paint-core/camera';
import type { PaintEvent } from '@app-game/paint-core/protocol';
import { defaultPaintSymmetry } from '@app-game/paint-core/symmetry';
import { render } from '@solidjs/web';
import { ok } from 'neverthrow';
import { createSignal, flush, Show } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import type { PaintError } from '../../shared/errors';
import { createAbrPresets, type AbrPreset } from '../abr';
import { createBrushTools } from '../brush';
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
    const editor = mount();
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
    expect(first.post).toHaveBeenLastCalledWith({ type: 'symmetry', settings });

    if (withTip) {
      const applying = presets.usePreset(inkPreset());
      await vi.waitFor(() => expect(uploaded(first)).toBeDefined());
      confirmUpload(first);
      expect(await applying).toEqual(ok());
      flush();
      expect(tools.brush().engine).toEqual(inkPreset().engine);
    }

    tools.updateBrush({ size: 123, color: '#123456', backgroundColor: '#abcdef' });
    flush();
    tools.chooseTool('brush');
    flush();
    tools.chooseTool(withTip ? 'abr-brush' : 'brush');
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
    expect(symmetry.canUpdate()).toBe(false);
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
      expect(presets.preset()?.name).toBe('Ink');
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
    expect(symmetry.canUpdate()).toBe(true);
    expect(symmetry.symmetry()).toEqual(settings);
    expect(tools.brush().size).toBe(123);
    expect(tools.brush()).toMatchObject({ color: '#abcdef', backgroundColor: '#123456' });
    if (withTip) {
      tools.chooseTool('brush');
      flush();
      expect(tools.brush().engine).toBeUndefined();
      expect(tools.brush().size).toBe(defaultBrush().size);
      tools.chooseTool('abr-brush');
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

it('pauses on a renderer failure and resets the camera and symmetry from a restored document', () => {
  const { engine, error } = mount();
  const transport = transports.opened[0]!;
  const camera = { ...defaultCamera(), x: 12, zoom: 3 };
  reply(transport, { type: 'ready' });
  reply(transport, { type: 'restored', camera });
  expect(engine.restored()).toEqual({ camera, symmetry: defaultPaintSymmetry() });
  reply(transport, { type: 'error', recoverable: true, code: 'lost', message: 'Device lost' });
  expect(engine.ready()).toBe(false);
  expect(error()).toMatchObject({ kind: 'gpu', code: 'lost' });
});

it('resets the editor when the worker fails: pauses input, ends the stroke, settles uploads and clears the selection', async () => {
  const { engine, error, onSelection } = mount();
  const transport = transports.opened[0]!;
  reply(transport, { type: 'ready' });
  expect(engine.canEdit()).toBe(true);
  engine.send({ type: 'begin', brush: defaultBrush(), samples: [{ x: 1, y: 1, pressure: 1, time: 0 }] });
  expect(engine.isDrawing()).toBe(true);
  const upload = engine.putResource({ id: 'tip', width: 1, height: 1, format: 'r8unorm', pixels: new Uint8Array([255]) });
  onSelection.mockClear();

  transport.handlers.error({ kind: 'error', cause: new ErrorEvent('error', { message: 'Worker crashed' }) });
  flush();

  expect(engine.ready()).toBe(false);
  expect(engine.canEdit()).toBe(false);
  expect(engine.isDrawing()).toBe(false);
  expect(error()).toMatchObject({ kind: 'engine', code: 'stopped', message: 'Worker crashed' });
  expect((await upload).isErr()).toBe(true);
  expect(onSelection).toHaveBeenCalledOnce();
  expect(onSelection).toHaveBeenCalledWith({ type: 'selection', points: [], hasClipboard: false });
});

/** Assembles the engine with the UI state that must survive an engine replacement, as the studio does. */
function mount() {
  let editor!: ReturnType<typeof assemble>;
  dispose = render(() => {
    editor = assemble();
    return (
      <div>
        <Show when={editor.engine.mode()} keyed>
          {(mode) => (
            <PaintCanvas
              connect={(canvas) => editor.engine.connect(canvas, mode)}
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
  return editor;
}

function assemble() {
  const [error, setError] = createSignal<PaintError>();
  const onSelection = vi.fn<Parameters<typeof createPaintEngine>[0]['onSelection']>();
  const developer = createDeveloperSettings();
  const tools = createBrushTools();
  const engine = createPaintEngine({
    settings: developer,
    onError: setError,
    onSelection,
    prepare: () => presets.restore()
  });
  const symmetry = createSymmetry({
    restored: () => engine.restored()?.symmetry,
    canUpdate: engine.canEdit,
    send: engine.send
  });
  const presets = createAbrPresets({
    upload: engine.putResource,
    canChange: () => engine.canEdit() && !engine.isDrawing(),
    select: tools.selectPreset
  });
  createPaintShortcuts({
    closePanel: () => {},
    tool: tools.tool,
    chooseTool: tools.chooseTool,
    selectionAction: () => {},
    deselect: () => {},
    undo: () => {},
    redo: () => {},
    save: () => {},
    swapColors: tools.swapColors,
    resetColors: tools.resetColors,
    scaleBrush: tools.scaleSize,
    cancel: () => {}
  });
  return { engine, tools, symmetry, presets, developer, error, onSelection, clearError: () => setError(undefined) };
}

function reply(transport: FakeTransport, event: PaintEvent) {
  transport.handlers.message(event);
  flush();
}

function uploaded(transport: FakeTransport) {
  return transport.post.mock.calls.map(([command]) => command).find((command) => command.type === 'brush-resources');
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
