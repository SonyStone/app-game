import type { ICapture, IMeshCapture, ISceneCapture, ITextureCapture, SpectorProgramSource } from '@app-game/spector';
import { createMemo, createSignal, onCleanup, onSettled } from 'solid-js';
import type { AgentClient, FrameTarget } from './agent-client';
import { isCapture, type AgentSnapshot, type CanvasSnapshot, type PushedStatus } from './protocol';

/** Discovery result for one document; inspection errors remain visible beside its URL. */
export interface InspectedFrame {
  readonly target: FrameTarget;
  readonly snapshot?: AgentSnapshot;
  readonly error?: string;
}

/** Owns reactive discovery, capture history and live operations for one mounted panel. */
export function createInspectorSession(client: AgentClient) {
  const [frames, setFrames] = createSignal<readonly InspectedFrame[]>([]);
  const [selection, setSelection] = createSignal<{ documentId: string; canvasId: number }>();
  const [captures, setCaptures] = createSignal<readonly ICapture[]>([]);
  const [showResults, setShowResults] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [capturePending, setCapturePending] = createSignal(false);
  const [operationMessage, setOperationMessage] = createSignal('Connecting to the inspected page…');
  const [errorMessage, setErrorMessage] = createSignal<string>();
  const seenRevisions = new Map<string, number>();
  const transfers = new Map<string, Promise<void>>();
  const sources = new WeakMap<ICapture, { target: FrameTarget; revision: number }>();
  let generation = 0;
  let disposed = false;
  let pendingRefresh: Promise<void> | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;

  const selectedFrame = createMemo(() => frames().find((frame) => frame.target.documentId === selection()?.documentId));
  const selectedCanvas = createMemo(() =>
    selectedFrame()?.snapshot?.canvases.find((canvas) => canvas.id === selection()?.canvasId)
  );
  const canvasCount = createMemo(() =>
    frames().reduce((count, frame) => count + (frame.snapshot?.canvases.length ?? 0), 0)
  );
  const activeCapture = createMemo(() => frames().find((frame) => isActive(frame.snapshot?.status)));
  const busyMessage = createMemo(() => operationMessage() || captureStatusMessage(activeCapture()?.snapshot?.status));

  onSettled(() => {
    unsubscribe = client.subscribe(receiveStatus, navigate);
    void refresh().then(schedulePoll);
  });
  onCleanup(() => {
    disposed = true;
    generation++;
    if (pollTimer !== undefined) clearTimeout(pollTimer);
    unsubscribe?.();
  });

  return {
    frames,
    selectedFrame,
    selectedCanvas,
    canvasCount,
    captures,
    showResults,
    refreshing,
    activeCapture,
    capturePending,
    busyMessage,
    errorMessage,
    refresh,
    selectCanvas(target: FrameTarget, canvas: CanvasSnapshot) {
      setSelection({ documentId: target.documentId, canvasId: canvas.id });
    },
    isSelected(target: FrameTarget, canvas: CanvasSnapshot) {
      return selection()?.documentId === target.documentId && selection()?.canvasId === canvas.id;
    },
    openResults: () => setShowResults(true),
    closeResults: () => setShowResults(false),
    addCapture: (capture: ICapture) => setCaptures((current) => [capture, ...current]),
    capture,
    stopCapture,
    async compileProgram(source: SpectorProgramSource, capture: ICapture): Promise<void> {
      const origin = requireLiveSource(capture);
      await client.call(origin.target, 'compile', origin.revision, source.programId, source.vertex, source.fragment);
    },
    async readMesh(capture: ICapture, commandId: number, attributeName?: string): Promise<IMeshCapture> {
      const origin = liveSource(capture);
      if (!origin) return { status: 'unavailable', commandId, reason: UNAVAILABLE_REASON };
      return client.call(origin.target, 'readMesh', origin.revision, commandId, attributeName);
    },
    async readScene(capture: ICapture): Promise<ISceneCapture> {
      const origin = liveSource(capture);
      if (!origin) return { status: 'unavailable', reason: UNAVAILABLE_REASON };
      return client.call(origin.target, 'readScene', origin.revision);
    },
    async readTexture(
      capture: ICapture,
      commandId: number,
      uniformIndex: number,
      textureIndex: number
    ): Promise<ITextureCapture> {
      const origin = liveSource(capture);
      if (!origin) return { status: 'unavailable', commandId, uniformIndex, textureIndex, reason: UNAVAILABLE_REASON };
      return client.call(origin.target, 'readTexture', origin.revision, commandId, uniformIndex, textureIndex);
    }
  };

  /** Coalesces polls; a navigation starts a new generation without awaiting old page work. */
  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (pendingRefresh) return pendingRefresh;
    const epoch = generation;
    setRefreshing(true);
    const work = (async () => {
      try {
        const targets = await client.listFrames();
        if (!isCurrent(epoch)) return;
        const inspected = await Promise.all(
          targets.map(async (target): Promise<InspectedFrame> => {
            try {
              return { target, snapshot: await client.inspect(target) };
            } catch (error: unknown) {
              return { target, error: toErrorMessage(error) };
            }
          })
        );
        if (!isCurrent(epoch)) return;
        const current = new Map(frames().map((frame) => [frame.target.documentId, frame]));
        const next = inspected.map((frame) => preserveNewerStatus(frame, current.get(frame.target.documentId)));
        setFrames(next);
        repairSelection(next);
        setOperationMessage('');
        const documents = new Set(targets.map((target) => target.documentId));
        for (const id of seenRevisions.keys()) if (!documents.has(id)) seenRevisions.delete(id);
        const error = next.find((frame) => frame.snapshot?.status.type === 'error')?.snapshot?.status;
        if (error?.type === 'error') setErrorMessage(error.message);
        await Promise.all(next.map((frame) => receiveCapture(frame, epoch)));
      } catch (error: unknown) {
        if (isCurrent(epoch)) {
          setOperationMessage('');
          setErrorMessage(toErrorMessage(error));
        }
      } finally {
        if (isCurrent(epoch)) {
          setRefreshing(false);
          pendingRefresh = undefined;
        }
      }
    })();
    pendingRefresh = work;
    return work;
  }

  function receiveCapture(frame: InspectedFrame, epoch: number): Promise<void> {
    const revision = frame.snapshot?.captureRevision ?? 0;
    const documentId = frame.target.documentId;
    if (revision <= (seenRevisions.get(documentId) ?? 0)) return Promise.resolve();
    const transferKey = `${documentId}:${revision}`;
    const pending = transfers.get(transferKey);
    if (pending) return pending;
    const work = (async () => {
      try {
        const json = await client.call(frame.target, 'readCapture', revision);
        if (!isCurrent(epoch) || !frames().some((frame) => frame.target.documentId === documentId)) return;
        const capture: unknown = JSON.parse(json);
        if (!isCapture(capture)) throw new Error('The inspected document returned an invalid Spector capture.');
        sources.set(capture, { target: frame.target, revision });
        seenRevisions.set(documentId, Math.max(revision, seenRevisions.get(documentId) ?? 0));
        setCaptures((current) => [capture, ...current]);
        setShowResults(true);
        setErrorMessage(undefined);
      } catch (error: unknown) {
        if (isCurrent(epoch)) setErrorMessage(toErrorMessage(error));
      } finally {
        if (isCurrent(epoch)) transfers.delete(transferKey);
      }
    })();
    transfers.set(transferKey, work);
    return work;
  }

  function receiveStatus(message: PushedStatus): void {
    if (disposed) return;
    const frame = frames().find(
      (frame) => frame.target.documentId === message.documentId && frame.target.frameId === message.frameId
    );
    if (!frame?.snapshot || message.statusRevision < frame.snapshot.statusRevision) return;
    const updated = {
      ...frame,
      snapshot: {
        ...frame.snapshot,
        status: message.status,
        statusRevision: message.statusRevision,
        captureRevision: message.captureRevision
      }
    };
    setFrames((current) => current.map((item) => (item === frame ? updated : item)));
    if (message.status.type === 'error') setErrorMessage(message.status.message);
    if (message.status.type === 'captured') void receiveCapture(updated, generation);
  }

  function navigate(): void {
    generation++;
    pendingRefresh = undefined;
    transfers.clear();
    seenRevisions.clear();
    setFrames([]);
    setSelection(undefined);
    setErrorMessage(undefined);
    setCapturePending(false);
    setOperationMessage('The inspected page navigated. Reconnecting…');
    void refresh().then(schedulePoll);
  }

  async function capture(commandCount: number): Promise<void> {
    const frame = selectedFrame();
    const canvas = selectedCanvas();
    if (!frame || !canvas || activeCapture() || capturePending()) return;
    const epoch = generation;
    setErrorMessage(undefined);
    setCapturePending(true);
    setOperationMessage('Arming capture…');
    try {
      await client.call(frame.target, 'capture', { canvasId: canvas.id, commandCount });
      if (isCurrent(epoch)) await refresh();
    } catch (error: unknown) {
      if (isCurrent(epoch)) setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrent(epoch)) {
        setCapturePending(false);
        setOperationMessage('');
      }
    }
  }

  async function stopCapture(): Promise<void> {
    const frame = activeCapture();
    if (!frame) return;
    const epoch = generation;
    try {
      await client.call(frame.target, 'stop');
      if (isCurrent(epoch)) await refresh();
    } catch (error: unknown) {
      if (isCurrent(epoch)) setErrorMessage(toErrorMessage(error));
    }
  }

  function repairSelection(next: readonly InspectedFrame[]): void {
    const selected = selection();
    if (
      next.some(
        (frame) =>
          frame.target.documentId === selected?.documentId &&
          frame.snapshot?.canvases.some((canvas) => canvas.id === selected.canvasId)
      )
    )
      return;
    const candidates = next.flatMap((frame) =>
      (frame.snapshot?.canvases ?? []).map((canvas) => ({ target: frame.target, canvas }))
    );
    const best = candidates.toSorted(
      (left, right) => canvasSelectionScore(right.canvas) - canvasSelectionScore(left.canvas)
    )[0];
    setSelection(best ? { documentId: best.target.documentId, canvasId: best.canvas.id } : undefined);
  }

  function liveSource(capture: ICapture) {
    const source = sources.get(capture);
    return source && frames().some((frame) => frame.target.documentId === source.target.documentId)
      ? source
      : undefined;
  }

  function requireLiveSource(capture: ICapture) {
    const source = liveSource(capture);
    if (!source) throw new Error(UNAVAILABLE_REASON);
    return source;
  }

  function isCurrent(epoch: number): boolean {
    return !disposed && epoch === generation;
  }

  function schedulePoll(): void {
    if (disposed) return;
    if (pollTimer !== undefined) clearTimeout(pollTimer);
    pollTimer = setTimeout(
      async () => {
        if (document.visibilityState === 'visible') await refresh();
        schedulePoll();
      },
      activeCapture() ? 500 : 1200
    );
  }
}

function preserveNewerStatus(inspected: InspectedFrame, current: InspectedFrame | undefined): InspectedFrame {
  if (!inspected.snapshot || !current?.snapshot || inspected.snapshot.statusRevision >= current.snapshot.statusRevision)
    return inspected;
  return {
    ...inspected,
    snapshot: {
      ...inspected.snapshot,
      status: current.snapshot.status,
      statusRevision: current.snapshot.statusRevision,
      captureRevision: Math.max(inspected.snapshot.captureRevision, current.snapshot.captureRevision)
    }
  };
}

function isActive(status: AgentSnapshot['status'] | undefined): boolean {
  return status?.type === 'waiting' || status?.type === 'capturing' || status?.type === 'processing';
}

function captureStatusMessage(status: AgentSnapshot['status'] | undefined): string {
  if (status?.type === 'waiting') return 'Waiting for WebGL activity… Move the camera when ready, or cancel.';
  if (status?.type === 'capturing')
    return `Capturing WebGL activity… ${status.commandCount.toLocaleString()} calls recorded.`;
  if (status?.type === 'processing')
    return `Processing capture… ${status.commandCount.toLocaleString()} calls recorded.`;
  return '';
}

function canvasSelectionScore(canvas: CanvasSnapshot): number {
  return (
    Number(canvas.context !== 'Not observed') * 1_000_000_000 +
    Number(canvas.visible) * 100_000_000 +
    canvas.width * canvas.height
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const UNAVAILABLE_REASON =
  'Live data requires a capture from a document that is still open; imported captures contain metadata only.';
