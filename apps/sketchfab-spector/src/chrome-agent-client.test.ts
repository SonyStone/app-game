import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChromeAgentClient } from './chrome-agent-client';
import { AGENT_KEY, AGENT_VERSION } from './protocol';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Chrome agent transport', () => {
  it('keeps two documents with identical URLs as distinct targets', async () => {
    const getAllFrames = vi.fn(async () => [
      { documentId: 'a', frameId: 0, url: 'https://example.test/', documentLifecycle: 'active' },
      { documentId: 'b', frameId: 2, url: 'https://example.test/', documentLifecycle: 'active' },
      { documentId: 'cached', frameId: 3, url: 'https://example.test/', documentLifecycle: 'cached' }
    ]);
    vi.stubGlobal('chrome', { webNavigation: { getAllFrames } });
    expect(await createChromeAgentClient(7).listFrames()).toEqual([
      { documentId: 'a', frameId: 0, url: 'https://example.test/', isTop: true },
      { documentId: 'b', frameId: 2, url: 'https://example.test/', isTop: false }
    ]);
  });

  it('addresses agent calls by documentId and awaits asynchronous responses', async () => {
    vi.stubGlobal(AGENT_KEY, { compile: async () => JSON.stringify({ ok: true }) });
    const executeScript = vi.fn(async (injection) => [
      {
        documentId: 'a',
        frameId: 0,
        result: await injection.func(...injection.args)
      }
    ]);
    vi.stubGlobal('chrome', { scripting: { executeScript } });
    await createChromeAgentClient(7).call(target, 'compile', 1, 9, 'vertex', 'fragment');
    expect(executeScript.mock.calls[0]?.[0]).toMatchObject({
      target: { tabId: 7, documentIds: ['a'] },
      world: 'MAIN',
      args: [AGENT_KEY, 'compile', [1, 9, 'vertex', 'fragment']]
    });
  });

  it('installs an agent in the same document when discovery finds no agent', async () => {
    const snapshot = {
      version: AGENT_VERSION,
      documentUrl: 'https://example.test/',
      documentTitle: 'Example',
      canvases: [],
      status: { type: 'idle' },
      statusRevision: 0,
      captureRevision: 0
    };
    const executeScript = vi
      .fn()
      .mockResolvedValueOnce([{ documentId: 'a', result: JSON.stringify({ ok: false, error: 'Not installed' }) }])
      .mockResolvedValueOnce([{ documentId: 'a' }])
      .mockResolvedValueOnce([{ documentId: 'a', result: JSON.stringify({ ok: true, value: snapshot }) }]);
    vi.stubGlobal('chrome', { scripting: { executeScript } });
    expect(await createChromeAgentClient(7).inspect(target)).toEqual(snapshot);
    expect(executeScript.mock.calls[1]?.[0]).toEqual({
      target: { tabId: 7, documentIds: ['a'] },
      world: 'MAIN',
      files: ['agent.js']
    });
  });

  it('rejects results from a different document instead of applying them', async () => {
    vi.stubGlobal('chrome', {
      scripting: {
        executeScript: async () => [{ documentId: 'replacement', result: JSON.stringify({ ok: true, value: true }) }]
      }
    });
    await expect(createChromeAgentClient(7).call(target, 'stop')).rejects.toThrow('no longer available');
  });

  it('reconnects after a worker disconnect and releases listeners on cleanup', async () => {
    vi.useFakeTimers();
    let disconnected = () => {};
    const port = {
      onMessage: { addListener: vi.fn() },
      onDisconnect: {
        addListener: (listener: () => void) => {
          disconnected = listener;
        }
      },
      postMessage: vi.fn(),
      disconnect: vi.fn(() => disconnected())
    };
    const connect = vi.fn(() => port);
    const onCommitted = { addListener: vi.fn(), removeListener: vi.fn() };
    vi.stubGlobal('chrome', { runtime: { connect }, webNavigation: { onCommitted } });
    const dispose = createChromeAgentClient(7).subscribe(
      () => {},
      () => {}
    );
    disconnected();
    await vi.advanceTimersByTimeAsync(1000);
    expect(connect).toHaveBeenCalledTimes(2);
    dispose();
    await vi.advanceTimersByTimeAsync(2000);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(onCommitted.removeListener).toHaveBeenCalledWith(onCommitted.addListener.mock.calls[0]?.[0]);
  });
});

const target = { documentId: 'a', frameId: 0, url: 'https://example.test/', isTop: true };
