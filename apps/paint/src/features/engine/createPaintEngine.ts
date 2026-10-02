import type { BrushResource, createBrushResources } from '@app-game/abr-paint/resources';
import type { Brush } from '@app-game/paint-core/brush';
import type { Camera } from '@app-game/paint-core/camera';
import { createDocument } from '@app-game/paint-core/document';
import type { CheckpointedEvent, PaintEvent, SelectionEvent, StateEvent } from '@app-game/paint-core/protocol';
import { defaultPaintSymmetry, type PaintSymmetry } from '@app-game/paint-core/symmetry';
import { gpuError } from '@app-game/solid-gpu/errors';
import type { WorkerFailure } from '@app-game/solid-gpu/worker/workerProtocol';
import { err, ok, type Result } from 'neverthrow';
import { createEffect, createSignal, latest, untrack, type Accessor } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { downloadBlob } from '../../shared/downloadBlob';
import { brushError, engineError, type PaintError } from '../../shared/errors';
import { createEngineRequests } from './createEngineRequests';
import {
  openPaintTransport,
  type EngineCommand,
  type EngineInit,
  type ExecutionMode,
  type PaintTransport
} from './openPaintTransport';

/**
 * Runs the drawing engine for one editor: a connection per mounted canvas, the worker/main-thread switch and the
 * document state the engine reports. Editor UI state lives in other features and outlives connections.
 * Must be created within a Solid owner.
 *
 * Switching modes checkpoints the document (with renderer tool state), disposes the engine, and then changes `mode`;
 * the caller keys the canvas on `mode`, so Solid replaces only the canvas, whose `connect` starts the new engine.
 */
export function createPaintEngine(options: {
  /** Developer switches, sent to every connection whenever it becomes ready and whenever they change. */
  settings: { debug: Accessor<boolean>; liveTail: Accessor<boolean>; adaptiveQuality: Accessor<boolean> };
  /** Reports engine failures; `undefined` clears the previous one when a new connection starts. */
  onError: (error: PaintError | undefined) => void;
  /** Receives the engine's lasso outline and clipboard state, and an empty selection when an engine is replaced. */
  onSelection: (event: SelectionEvent) => void;
  /**
   * Runs when a connection reports `ready`, before `ready` becomes true: for example re-uploading the selected brush
   * preset. Returns `undefined` when there is nothing to prepare. A failure keeps the engine paused.
   */
  prepare?: () => Promise<Result<void, PaintError>> | undefined;
  /**
   * Per-frame timing for the performance monitor. While `enabled`, every connection sends `frame` events, with its CPU
   * submission time and its wait for submitted GPU work, to `receive` once the frame's GPU work has finished.
   */
  frames?: { enabled: Accessor<boolean>; receive: (event: FrameEvent) => void };
}) {
  const [mode, setMode] = createSignal<ExecutionMode>(initialMode());
  const [switchTarget, setSwitchTarget, requestedSwitch] = createImmediateSignal<ExecutionMode | undefined>(undefined);
  const [ready, setReady] = createSignal(false);
  const [, setDrawing, isDrawing] = createImmediateSignal(false);
  const [state, setState] = createSignal(createDocument().state());
  const [saveState, setSaveState] = createSignal<StateEvent['saveState']>('saved');
  const [metrics, setMetrics] = createSignal({ tiles: 0, gpu: 0, ms: 0 });
  const [paging, setPaging] = createSignal<EnginePaging>({});
  const [debugTiles, setDebugTiles] = createSignal<string[]>([]);
  const [restored, setRestored] = createSignal<RestoredView>();
  const switching = () => switchTarget() !== undefined;
  const canEdit = () => ready() && !switching();

  const resources = createEngineRequests<ResourceReply>({
    timeoutMs: requestTimeoutMs,
    failure: (message) => brushError('upload', message)
  });
  const commands = createEngineRequests<void>({
    timeoutMs: requestTimeoutMs,
    failure: (message) => brushError('command', message)
  });
  /** Resource ids resident in the current connection's cache; a new engine starts empty. */
  const resident = new Set<string>();
  /** The connection of the mounted canvas, while it accepts commands. */
  let connection: PaintTransport | undefined;
  /** Renderer tools and history source moving from a checkpointed engine to its replacement. */
  let handoff: Pick<EngineInit, 'tools' | 'historySource'> = {};

  syncWhenEditable(options.settings.adaptiveQuality, (enabled) => ({ type: 'adaptive-quality', enabled }));
  syncWhenEditable(options.settings.liveTail, (enabled) => ({ type: 'live-tail', enabled }));
  syncWhenEditable(options.settings.debug, (enabled) => ({ type: 'debug', enabled }));

  if (options.frames) {
    syncWhenEditable(options.frames.enabled, (enabled) => ({ type: 'diagnostics', enabled }));
  }

  createEffect(options.settings.debug, (enabled) => {
    if (!enabled) {
      setDebugTiles([]);
    }
  });

  return {
    /** Execution mode of the mounted engine; key the canvas on it so a switch replaces the canvas. */
    mode,
    /** True from a switch request until the replacement engine is ready or the switch fails. */
    switching,
    /** The connected engine has initialized and restored the document. */
    ready,
    /** The engine accepts document commands: ready and not switching. */
    canEdit,
    /** Document layers, history and selection state; replaced only when the revision changes. */
    state,
    /** Autosave progress: completed changes are `saving` until written, a stroke in progress is `unsaved`. */
    saveState,
    /** GPU cache bytes, resident tiles and the last frame's CPU submission time. */
    metrics,
    /** Storage, virtual texture and readback statistics for the canvas wireframe. */
    paging,
    /** Occupied tile keys while the canvas wireframe is enabled. */
    debugTiles,
    /** Camera and symmetry of a loaded, imported or replaced document; UI state resets from it. */
    restored,
    /** Whether a stroke is in progress, including `begin` sent earlier in the current event. */
    isDrawing,
    /** Whether a brush command is waiting for the engine. */
    commandBusy: commands.busy,
    /** Like `commandBusy`, including a command started earlier in the current event. */
    isCommandBusy: commands.isBusy,
    connect,
    send,
    switchMode,
    putResource,
    runBrushCommand
  };

  /**
   * Opens an engine for the mounted `canvas` in `executionMode`, normally the current `mode`, and returns its
   * disconnect function; call it under the canvas's owner. Disconnecting asks the engine to save and dispose, and
   * closes the transport when it has, or after `disposeGraceMs`.
   */
  function connect(canvas: HTMLCanvasElement, executionMode: ExecutionMode): () => void {
    resources.disconnect();
    commands.disconnect();
    resident.clear();
    setDrawing(false);
    options.onError(undefined);
    let phase: 'active' | 'closing' | 'closed' = 'active';
    let firstState = true;
    let retiring = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    const opened = openPaintTransport(
      executionMode,
      canvas,
      { size: { width: canvas.clientWidth, height: canvas.clientHeight }, dpr: devicePixelRatio, ...handoff },
      { message: receive, error: fail }
    );
    if (opened.isErr()) {
      options.onError(opened.error);
      return () => {};
    }

    const transport = opened.value;
    connection = transport;
    return disconnect;

    function receive(event: PaintEvent) {
      if (phase === 'closing') {
        if (event.type === 'disposed' || event.type === 'error') {
          close();
        }

        return;
      }

      if (phase === 'closed' || connection !== transport) {
        return;
      }

      switch (event.type) {
        case 'brush-resources':
          resources.receive(event.requestId, event.result);
          break;
        case 'brush-command':
          commands.receive(event.requestId, event.result);
          break;
        case 'checkpointed':
          retire(event);
          break;
        case 'disposed':
          replace();
          break;
        case 'selection':
          options.onSelection(event);
          break;
        case 'ready':
          void finishReady();
          break;
        case 'restored':
          setRestored({ camera: event.camera, symmetry: event.symmetry ?? defaultPaintSymmetry() });
          break;
        case 'state':
          update(event);
          break;
        case 'error':
          setDrawing(false);
          setSwitchTarget(undefined);
          options.onError(runtimeError(event));
          if (event.recoverable || retiring) {
            setReady(false);
          }

          break;
        case 'download':
          downloadBlob(event.blob, event.name);
          break;
        case 'frame':
          options.frames?.receive(event);
          break;
      }
    }

    /** A checkpoint requested by `switchMode` succeeded: keep its tools and dispose this engine. */
    function retire(event: CheckpointedEvent) {
      if (requestedSwitch() === undefined || retiring) {
        return;
      }

      handoff = { tools: event.tools, historySource: event.historySource };
      retiring = true;
      transport.post({ type: 'dispose' });
    }

    /** The retired engine saved and disposed itself; changing `mode` remounts the canvas for the new engine. */
    function replace() {
      const target = requestedSwitch();
      if (target === undefined) {
        return;
      }

      close();
      connection = undefined;
      setReady(false);
      setDebugTiles([]);
      setPaging({});
      options.onSelection(emptySelection);
      setMode(target);
    }

    async function finishReady() {
      const preparing = options.prepare?.();
      if (preparing) {
        setReady(false);
        const prepared = await preparing;
        if (connection !== transport) {
          return;
        }

        if (prepared.isErr()) {
          setSwitchTarget(undefined);
          options.onError(prepared.error);
          return;
        }
      }

      handoff = {};
      setReady(true);
      setSwitchTarget(undefined);
      rememberMode(executionMode);
    }

    function update(event: StateEvent) {
      if (firstState) {
        setRestored({ camera: event.camera, symmetry: event.symmetry });
      }

      setPaging((previous) => ({
        storage: event.storage,
        virtual: event.virtual,
        rasterDraws: event.rasterDraws,
        readback: event.readback,
        debugPages: event.debugPages ?? previous.debugPages
      }));
      if (event.debugTiles) {
        setDebugTiles(event.debugTiles);
      }

      if (firstState || event.document.revision !== latest(state).revision) {
        setState(event.document);
      }

      setSaveState(event.saveState);
      setMetrics({ tiles: event.residentTiles, gpu: event.gpuBytes, ms: event.renderMs });
      firstState = false;
    }

    /** The worker or the main-thread engine failed; input stays disabled until the editor is reloaded. */
    function fail(failure: WorkerFailure) {
      if (phase !== 'active' || connection !== transport) {
        return;
      }

      resources.disconnect();
      commands.disconnect();
      options.onSelection(emptySelection);
      // The failed engine discarded any stroke in progress; the next pen-down must start a new one.
      setDrawing(false);
      setSwitchTarget(undefined);
      setReady(false);
      options.onError(engineError('stopped', transportFailureMessage(failure), failure));
    }

    function disconnect() {
      if (connection === transport) {
        connection = undefined;
        resources.disconnect();
        commands.disconnect();
      }

      if (phase !== 'active') {
        return;
      }

      phase = 'closing';
      transport.post({ type: 'dispose' });
      graceTimer = setTimeout(close, disposeGraceMs);
    }

    function close() {
      clearTimeout(graceTimer);
      phase = 'closed';
      transport.close();
    }
  }

  /**
   * Sends a document or view command to the connected engine, in order. Commands are dropped while the engine is
   * switching or when no engine is connected; `begin`, `end` and `cancel` also track whether a stroke is in progress.
   */
  function send(command: EngineCommand) {
    // View and selection effects also send from effect callbacks, where a read must be explicitly untracked.
    if (untrack(requestedSwitch) !== undefined) {
      return;
    }

    if (command.type === 'begin') {
      setDrawing(true);
    }

    if (command.type === 'end' || command.type === 'cancel') {
      setDrawing(false);
    }

    connection?.post(command).mapErr(options.onError);
  }

  /**
   * Starts switching to `next`: the engine checkpoints the document, then `mode` changes once it has disposed.
   * Returns false, without side effects, when `next` is current or the engine is not ready.
   */
  function switchMode(next: ExecutionMode): boolean {
    if (next === latest(mode) || !latest(ready) || requestedSwitch() !== undefined) {
      return false;
    }

    setSwitchTarget(next);
    post({ type: 'checkpoint', includeTools: true }).mapErr(options.onError);
    return true;
  }

  /** Uploads a brush resource unless it is already resident in the connected engine. Never rejects. */
  async function putResource(resource: BrushResource): Promise<Result<void, PaintError>> {
    if (resident.has(resource.id)) {
      return ok();
    }

    const uploaded = await resources.request(
      (requestId) => post({ type: 'brush-resources', requestId, action: 'put', resource }),
      resource.id,
      ({ evicted }) => {
        evicted.forEach((id) => resident.delete(id));
        resident.add(resource.id);
      }
    );
    return uploaded.map(() => undefined);
  }

  /** Runs an engine-specific brush command, such as loading a Mixer Brush, with the given brush. Never rejects. */
  function runBrushCommand(brush: Brush, command: unknown): Promise<Result<void, PaintError>> {
    return commands.request((requestId) => post({ type: 'brush-command', requestId, brush, command }));
  }

  /** Posts to the connected engine regardless of the switch; request replies and the switch handshake use this. */
  function post(command: EngineCommand): Result<void, PaintError> {
    if (!connection) {
      return err(engineError('disconnected', 'Wait for the drawing engine to finish preparing.'));
    }

    return connection.post(command);
  }

  /** Sends `value` whenever the engine becomes editable and whenever the value changes. */
  function syncWhenEditable<T>(value: Accessor<T>, command: (value: T) => EngineCommand) {
    createEffect(
      () => (canEdit() ? { value: value() } : undefined),
      (current) => {
        if (current) {
          post(command(current.value));
        }
      }
    );
  }
}

/** The engine API used by editor features. */
export type PaintEngine = ReturnType<typeof createPaintEngine>;

/** A frame's engine timing, sent while frame timing is enabled. */
export type FrameEvent = Extract<PaintEvent, { type: 'frame' }>;

/** Storage, virtual texture and readback statistics from the latest state event. */
export type EnginePaging = Pick<StateEvent, 'storage' | 'virtual' | 'debugPages' | 'rasterDraws' | 'readback'>;

/** View state stored with the document. `symmetry` is absent when an older document or engine did not report it. */
export type RestoredView = { camera: Camera; symmetry?: PaintSymmetry };

/** Acknowledgement of a resource upload. */
type ResourceReply = { evicted: string[]; stats: ReturnType<ReturnType<typeof createBrushResources>['stats']> };

/** A resource upload or brush command waits this long before the caller may retry. */
const requestTimeoutMs = 30_000;

/**
 * Time a disposing engine has to save the document and close storage before its transport is closed anyway. Large
 * unsaved strokes can take seconds to write, so this is longer than the transport's own shutdown grace period.
 */
const disposeGraceMs = 30_000;

/** Selection reset sent to the editor when an engine is replaced or fails; the clipboard belongs to the engine. */
const emptySelection: SelectionEvent = { type: 'selection', points: [], hasClipboard: false };

/** `?paintThread=main` selects the main-thread engine; the worker is the default. */
function initialMode(): ExecutionMode {
  return new URL(location.href).searchParams.get('paintThread') === 'main' ? 'main' : 'worker';
}

/** Records the running mode in the URL without navigation, so a reload keeps it. */
function rememberMode(mode: ExecutionMode) {
  const url = new URL(location.href);
  if (mode === 'worker') {
    url.searchParams.delete('paintThread');
  } else {
    url.searchParams.set('paintThread', 'main');
  }

  history.replaceState(history.state, '', url.href);
}

/** Renderer failures carry a GPU code and can be restored; other runtime failures reject a single command. */
function runtimeError(event: Extract<PaintEvent, { type: 'error' }>): PaintError {
  if (event.recoverable) {
    return gpuError(event.code ?? 'lost', event.message, event);
  }

  return engineError('failed', event.message, event);
}

function transportFailureMessage(failure: WorkerFailure): string {
  if (failure.kind === 'error' && failure.cause.message) {
    return failure.cause.message;
  }

  return 'The drawing engine stopped.';
}
