import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentClient, FrameTarget } from './agent-client';
import { createInspectorSession } from './inspector-session';
import { AGENT_VERSION, type AgentCommands, type AgentSnapshot, type PushedStatus } from './protocol';

describe('inspector session', () => {
  const disposers: Array<() => void> = [];
  afterEach(() => disposers.splice(0).forEach((dispose) => dispose()));

  async function mount(fake = createClient()) {
    const session = createRoot((dispose) => {
      disposers.push(dispose);
      return createInspectorSession(fake.client);
    });
    await nextTask();
    await session.refresh();
    return { session, fake };
  }

  it('ingests revision one again after reloading the same URL', async () => {
    const { session, fake } = await mount();
    fake.complete('document-a');
    await session.refresh();
    expect(session.captures()).toHaveLength(1);
    fake.targets = [{ ...fake.targets[0]!, documentId: 'document-b' }];
    fake.complete('document-b');
    fake.navigate();
    await session.refresh();
    expect(session.captures()).toHaveLength(2);
    expect(session.frames()[0]?.target.documentId).toBe('document-b');
  });

  it('retries a failed capture transfer on the next refresh', async () => {
    const { session, fake } = await mount();
    fake.complete('document-a');
    fake.read = async () => {
      throw new Error('transfer interrupted');
    };
    await session.refresh();
    expect(session.captures()).toHaveLength(0);
    expect(session.errorMessage()).toBe('transfer interrupted');
    fake.read = async () => captureJson;
    await session.refresh();
    expect(session.captures()).toHaveLength(1);
    expect(session.errorMessage()).toBeUndefined();
  });

  it('coalesces pushed and polled capture transfers', async () => {
    const { session, fake } = await mount();
    const result = deferred<string>();
    fake.read = () => result.promise;
    fake.complete('document-a');
    fake.push('document-a');
    const refresh = session.refresh();
    await nextTask();
    expect(fake.requests.filter((request) => request.method === 'readCapture')).toHaveLength(1);
    result.resolve(captureJson);
    await refresh;
    expect(session.captures()).toHaveLength(1);
  });

  it('discards a transfer that finishes after navigation', async () => {
    const { session, fake } = await mount();
    const result = deferred<string>();
    fake.read = () => result.promise;
    fake.complete('document-a');
    const oldRefresh = session.refresh();
    await nextTask();
    fake.targets = [{ ...fake.targets[0]!, documentId: 'document-b' }];
    fake.navigate();
    await session.refresh();
    result.resolve(captureJson);
    await oldRefresh;
    expect(session.captures()).toHaveLength(0);
    expect(session.frames()[0]?.target.documentId).toBe('document-b');
    expect(session.refreshing()).toBe(false);
  });

  it('does not let an old frame discovery overwrite a new document', async () => {
    const fake = createClient();
    const old = deferred<AgentSnapshot>();
    fake.client.inspect = async (target) => (target.documentId === 'document-a' ? old.promise : snapshot());
    const session = createRoot((dispose) => {
      disposers.push(dispose);
      return createInspectorSession(fake.client);
    });
    await nextTask();
    fake.targets = [{ ...fake.targets[0]!, documentId: 'document-b' }];
    fake.navigate();
    await session.refresh();
    old.resolve(snapshot());
    await nextTask();
    expect(session.frames()[0]?.target.documentId).toBe('document-b');
  });

  it('keeps same-URL frames independent and compiles in the selected capture document', async () => {
    const fake = createClient();
    fake.targets.push({ ...fake.targets[0]!, documentId: 'document-b', frameId: 2, isTop: false });
    const { session } = await mount(fake);
    expect(session.canvasCount()).toBe(2);
    fake.complete('document-a');
    await session.refresh();
    const captureA = session.captures()[0]!;
    fake.complete('document-b');
    await session.refresh();
    await session.compileProgram({ programId: 9, vertex: 'vertex', fragment: 'fragment' }, captureA);
    expect(fake.requests.at(-1)).toEqual({
      documentId: 'document-a',
      method: 'compile',
      args: [1, 9, 'vertex', 'fragment']
    });
  });

  it('rejects live shader editing after its document has gone away', async () => {
    const { session, fake } = await mount();
    fake.complete('document-a');
    await session.refresh();
    const capture = session.captures()[0]!;
    fake.targets = [];
    fake.navigate();
    await session.refresh();
    await expect(session.compileProgram({ programId: 1, vertex: '', fragment: '' }, capture)).rejects.toThrow(
      'document'
    );
    expect(fake.requests.some((request) => request.method === 'compile')).toBe(false);
  });

  it('ignores status from a replaced document even when frame IDs match', async () => {
    const { session, fake } = await mount();
    fake.targets = [{ ...fake.targets[0]!, documentId: 'document-b' }];
    fake.navigate();
    await session.refresh();
    fake.complete('document-a');
    fake.push('document-a');
    expect(session.frames()[0]?.snapshot?.status.type).toBe('idle');
    expect(session.captures()).toHaveLength(0);
  });

  it('stops subscriptions and ignores in-flight work when its Solid owner is disposed', async () => {
    const { session, fake } = await mount();
    const result = deferred<string>();
    fake.read = () => result.promise;
    fake.complete('document-a');
    const refresh = session.refresh();
    await nextTask();
    disposers.pop()?.();
    result.resolve(captureJson);
    await refresh;
    expect(fake.unsubscribed).toBe(true);
    expect(session.captures()).toHaveLength(0);
  });
});

function createClient() {
  let onStatus: (status: PushedStatus) => void = () => {};
  let onNavigate: () => void = () => {};
  const snapshots = new Map<string, AgentSnapshot>();
  const fake = {
    targets: [
      { documentId: 'document-a', frameId: 0, url: 'https://example.test/model', isTop: true }
    ] as FrameTarget[],
    requests: [] as { documentId: string; method: keyof AgentCommands; args: unknown[] }[],
    read: async () => captureJson,
    unsubscribed: false,
    navigate: () => onNavigate(),
    complete(documentId: string) {
      snapshots.set(documentId, {
        ...snapshot(),
        captureRevision: 1,
        statusRevision: 4,
        status: { type: 'captured', canvasId: 1, commandCount: 1 }
      });
    },
    push(documentId: string) {
      const state = snapshots.get(documentId)!;
      onStatus({
        type: 'webgl-spector-panel-status',
        frameId: 0,
        documentId,
        status: state.status,
        statusRevision: state.statusRevision,
        captureRevision: state.captureRevision
      });
    }
  };
  const client = {
    listFrames: async () => [...fake.targets],
    inspect: async (target: FrameTarget) => snapshots.get(target.documentId) ?? snapshot(),
    async call<K extends keyof AgentCommands>(
      target: FrameTarget,
      method: K,
      ...args: Parameters<AgentCommands[K]>
    ): Promise<ReturnType<AgentCommands[K]>> {
      fake.requests.push({ documentId: target.documentId, method, args });
      const value = method === 'readCapture' ? await fake.read() : undefined;
      return value as ReturnType<AgentCommands[K]>;
    },
    subscribe(status, navigate) {
      onStatus = status;
      onNavigate = navigate;
      return () => {
        fake.unsubscribed = true;
      };
    }
  } satisfies AgentClient;
  return Object.assign(fake, { client });
}

function snapshot(): AgentSnapshot {
  return {
    version: AGENT_VERSION,
    documentTitle: 'Model',
    documentUrl: 'https://example.test/model',
    canvases: [
      {
        id: 1,
        label: 'canvas',
        width: 100,
        height: 100,
        clientWidth: 100,
        clientHeight: 100,
        visible: true,
        context: 'WebGL 2'
      }
    ],
    status: { type: 'idle' },
    statusRevision: 0,
    captureRevision: 0
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const captureJson = JSON.stringify({
  canvas: {},
  context: {},
  commands: [],
  initState: {},
  endState: {},
  startTime: 0
});
