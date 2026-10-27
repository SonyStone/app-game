import { openPsdEditor } from '@app-game/psd/editor';
import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import {
  hostRefusal,
  preferredContract,
  type EditingRequest,
  type EditingResponse,
  type EditingResult
} from '../src/features/editing/contracts';
import { makeEditingSession } from '../src/features/editing/makeEditingSession';
import { streamSave, type SaveDestination } from '../src/features/editing/save';
import { createEditingSource as source } from './editingSource';

function value<T>(result: EditingResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

it('stages real edits, undo/redo and divergent history while preserving original and monotonic revisions', async () => {
  const original = await source();
  const unchanged = original.slice();
  const displayed: Uint8Array[] = [];
  const host = value(
    await makeEditingSession(original, async (bytes) => {
      displayed.push(bytes);
      return { ok: true, value: undefined };
    })
  );
  const call = async (request: EditingRequest) => value(await host.receive(request));
  try {
    expect(await call({ kind: 'open' })).toMatchObject({ kind: 'state', state: { revision: 0, position: 0 } });
    expect(
      await call({
        kind: 'edit',
        revision: 0,
        command: { kind: 'metadata', edit: { kind: 'resolutionNoResample', ppi: 144 } }
      })
    ).toMatchObject({ kind: 'state', state: { revision: 1, position: 1 } });
    const frozen = await call({ kind: 'freeze', revision: 1 });
    expect(frozen.kind).toBe('frozen');
    expect(await call({ kind: 'undo', revision: 1 })).toMatchObject({
      kind: 'state',
      state: { revision: 2, position: 0 }
    });
    expect(displayed[1]).toEqual(original);
    expect(await call({ kind: 'redo', revision: 2 })).toMatchObject({
      kind: 'state',
      state: { revision: 3, position: 1 }
    });
    expect(displayed[2]).toEqual(displayed[0]);
    if (frozen.kind === 'frozen') {
      expect(await call({ kind: 'chunk', save: frozen.save, maxBytes: 1024 * 1024 })).toEqual({
        kind: 'chunk',
        bytes: displayed[0]
      });
      await call({ kind: 'release', save: frozen.save });
    }
    await call({ kind: 'undo', revision: 3 });
    expect(
      await call({
        kind: 'edit',
        revision: 4,
        command: { kind: 'metadata', edit: { kind: 'resolutionNoResample', ppi: 96 } }
      })
    ).toMatchObject({ kind: 'state', state: { revision: 5, historyLength: 1, cost: { replayed: 1 } } });
    expect(await host.receive({ kind: 'redo', revision: 5 })).toMatchObject({ ok: false, error: { code: 'Invalid' } });
    expect(await host.receive({ kind: 'undo', revision: 0 })).toMatchObject({
      ok: false,
      error: { code: 'StaleRevision' }
    });
    expect(original).toEqual(unchanged);
  } finally {
    host.dispose();
  }
});

it('keeps refusal and failed strict publication atomic, preserving frozen bytes and public revision', async () => {
  const original = await source();
  const publish = vi.fn(async () => ({
    ok: false as const,
    error: { code: 'RenderRequired' as const, message: 'strict reparse failed' }
  }));
  const host = value(await makeEditingSession(original, publish));
  try {
    const before = value(await host.receive({ kind: 'open' }));
    expect(
      await host.receive({
        kind: 'edit',
        revision: 0,
        command: { kind: 'tree', edit: { kind: 'rename', layerId: 2, name: 'new' } }
      })
    ).toMatchObject({ ok: false, error: { code: 'HostAttributionRequired', propertyPath: 'save.softwareAgent' } });
    expect(
      await host.receive({
        kind: 'edit',
        revision: 0,
        command: { kind: 'metadata', edit: { kind: 'fileInfoTitle', title: 'title' } }
      })
    ).toMatchObject({ ok: false, error: { code: 'Dependency', propertyPath: 'metadata.fileInfo.title' } });
    expect(
      await host.receive({
        kind: 'edit',
        revision: 0,
        command: { kind: 'metadata', edit: { kind: 'resolutionNoResample', ppi: 96 } }
      })
    ).toMatchObject({ ok: false, error: { code: 'RenderRequired' } });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(value(await host.receive({ kind: 'open' }))).toEqual(before);
    const saved: Uint8Array[] = [];
    await streamSave(
      host.receive,
      0,
      async () => ({
        async write(bytes) {
          saved.push(bytes);
        },
        async close() {},
        async abort() {}
      }),
      new AbortController().signal
    );
    expect(new Uint8Array(Buffer.concat(saved))).toEqual(original);
  } finally {
    host.dispose();
  }
});

it('disposes invalid-chunk saves and every outstanding save on repeated session disposal', async () => {
  const host = value(await makeEditingSession(await source(), async () => ({ ok: true, value: undefined })));
  const save = value(await host.receive({ kind: 'freeze', revision: 0 }));
  if (save.kind !== 'frozen') {
    throw new Error('Expected save');
  }
  expect(await host.receive({ kind: 'chunk', save: save.save, maxBytes: 16 * 1024 * 1024 + 1 })).toMatchObject({
    ok: false,
    error: { code: 'Invalid' }
  });
  expect(await host.receive({ kind: 'chunk', save: save.save, maxBytes: 1024 * 1024 })).toMatchObject({
    ok: false,
    error: { code: 'Disposed' }
  });
  host.dispose();
  host.dispose();
  expect(await host.receive({ kind: 'open' })).toMatchObject({ ok: false, error: { code: 'Disposed' } });
});

it.each(['success', 'picker-cancel', 'write-failure', 'close-failure', 'abort', 'chunk-failure'] as const)(
  'releases frozen bytes on %s and closes only at complete EOF',
  async (outcome) => {
    const calls: EditingRequest[] = [];
    let read = 0;
    const controller = new AbortController();
    const rpc = async (request: EditingRequest): Promise<EditingResult<EditingResponse>> => {
      calls.push(request);
      if (request.kind === 'freeze') {
        return { ok: true, value: { kind: 'frozen', save: 'save-7', revision: 3 } };
      }
      if (request.kind === 'chunk') {
        if (outcome === 'chunk-failure') {
          return { ok: false, error: { code: 'Invalid', message: 'read failed' } };
        }
        return { ok: true, value: { kind: 'chunk', bytes: read++ === 0 ? Uint8Array.of(1, 2) : undefined } };
      }
      return { ok: true, value: { kind: 'released' } };
    };
    const target: SaveDestination = {
      write: vi.fn(async () => {
        if (outcome === 'abort') {
          controller.abort();
        }
        if (outcome === 'write-failure') {
          throw new Error('disk failed');
        }
      }),
      close: vi.fn(async () => {
        if (outcome === 'close-failure') {
          throw new Error('commit failed');
        }
      }),
      abort: vi.fn(async () => undefined)
    };
    const operation = streamSave(
      rpc,
      3,
      async () => {
        if (outcome === 'picker-cancel') {
          throw new DOMException('canceled', 'AbortError');
        }
        return target;
      },
      controller.signal
    );
    if (outcome === 'success') {
      expect(await operation).toBe(2);
    } else {
      await expect(operation).rejects.toThrow();
    }
    expect(calls.at(-1)).toEqual({ kind: 'release', save: 'save-7' });
    expect(target.abort).toHaveBeenCalledTimes(outcome === 'success' || outcome === 'picker-cancel' ? 0 : 1);
    expect(target.close).toHaveBeenCalledTimes(outcome === 'success' || outcome === 'close-failure' ? 1 : 0);
    expect(calls.filter((call) => call.kind === 'chunk').every((call) => call.maxBytes === 1024 * 1024)).toBe(true);
  }
);

it('records the honest-host contract boundary against real WASM, with no byte or revision change', async () => {
  const bytes = await readFile(new URL('../../../packages/psd/test/editor/flat-rgb8.psd', import.meta.url));
  const session = value(await openPsdEditor(bytes));
  const before = value(session.sourceSnapshot());
  try {
    const refused = session.editRasterTreeExact([{ kind: 'rename', layerId: 4, name: 'honest' }], {
      contract: 'photoshop26.reopen-equivalent/v1',
      save: {
        basename: 'flat-rgb8',
        saveTime: new Date().toISOString().slice(0, 19) + '+00:00',
        exifTime: '2026:10:27 12:00:00',
        instanceId: `xmp.iid:${crypto.randomUUID()}`,
        documentId: `adobe:docid:photoshop:${crypto.randomUUID()}`,
        softwareAgent: 'PSD Viewer',
        linearBlending: false
      },
      layerTimes: [{ layerId: 4, time: Date.now() / 1000 }]
    });
    expect(refused).toMatchObject({
      ok: false,
      error: { code: 'Invalid', message: expect.stringContaining('explicit Photoshop-format save context required') }
    });
    expect(value(session.sourceSnapshot())).toEqual(before);
    expect(preferredContract).toContain('/v3-');
    expect(
      hostRefusal({ kind: 'metadata', edit: { kind: 'fileInfoCopyright', status: 'publicDomain' } })
    ).toMatchObject({ code: 'HostAttributionRequired' });
  } finally {
    session.dispose();
  }
});

it('releases a canceled frozen save before a pending picker settles and aborts its late destination', async () => {
  const calls: EditingRequest[] = [];
  const controller = new AbortController();
  let choose!: (target: SaveDestination) => void;
  const target = { write: vi.fn(), close: vi.fn(), abort: vi.fn(async () => undefined) };
  const operation = streamSave(
    async (request) => {
      calls.push(request);
      return request.kind === 'freeze'
        ? { ok: true, value: { kind: 'frozen', save: 'save-8', revision: 0 } }
        : { ok: true, value: { kind: 'released' } };
    },
    0,
    () =>
      new Promise((resolve) => {
        choose = resolve;
      }),
    controller.signal
  );
  await vi.waitFor(() => expect(choose).toBeTypeOf('function'));
  controller.abort();
  await expect(operation).rejects.toThrow();
  expect(calls.at(-1)).toEqual({ kind: 'release', save: 'save-8' });
  choose(target);
  await vi.waitFor(() => expect(target.abort).toHaveBeenCalledOnce());
  expect(target.write).not.toHaveBeenCalled();
  expect(target.close).not.toHaveBeenCalled();
});

it('bounds replay history and refuses the 65th edit without discarding undo', async () => {
  const host = value(await makeEditingSession(await source(), async () => ({ ok: true, value: undefined })));
  try {
    for (let revision = 0; revision < 64; revision++) {
      expect(
        await host.receive({
          kind: 'edit',
          revision,
          command: { kind: 'metadata', edit: { kind: 'resolutionNoResample', ppi: 73 + revision } }
        })
      ).toMatchObject({ ok: true });
    }
    expect(
      await host.receive({
        kind: 'edit',
        revision: 64,
        command: { kind: 'metadata', edit: { kind: 'resolutionNoResample', ppi: 200 } }
      })
    ).toMatchObject({ ok: false, error: { code: 'HistoryLimit' } });
    expect(value(await host.receive({ kind: 'open' }))).toMatchObject({
      kind: 'state',
      state: { revision: 64, position: 64, historyLength: 64 }
    });
    expect(value(await host.receive({ kind: 'undo', revision: 64 }))).toMatchObject({
      kind: 'state',
      state: { revision: 65, position: 63 }
    });
  } finally {
    host.dispose();
  }
});

it('uses distinct frozen-save identities across replaced sessions, so late releases cannot affect a new save', async () => {
  const bytes = await source();
  const publish = async () => ({ ok: true as const, value: undefined });
  const first = value(await makeEditingSession(bytes, publish));
  const second = value(await makeEditingSession(bytes, publish));
  try {
    const oldSave = value(await first.receive({ kind: 'freeze', revision: 0 }));
    const newSave = value(await second.receive({ kind: 'freeze', revision: 0 }));
    if (oldSave.kind !== 'frozen' || newSave.kind !== 'frozen') {
      throw new Error('Expected frozen saves');
    }
    expect(oldSave.save).not.toBe(newSave.save);
    await second.receive({ kind: 'release', save: oldSave.save });
    expect(await second.receive({ kind: 'chunk', save: newSave.save, maxBytes: 1024 * 1024 })).toMatchObject({
      ok: true,
      value: { kind: 'chunk', bytes }
    });
  } finally {
    first.dispose();
    second.dispose();
  }
});

it('refuses unavailable secure save identities before allocating a frozen save and permits a later retry', async () => {
  const host = value(await makeEditingSession(await source(), async () => ({ ok: true, value: undefined })));
  const random = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    throw new Error('insecure context');
  });
  try {
    expect(await host.receive({ kind: 'freeze', revision: 0 })).toMatchObject({
      ok: false,
      error: { code: 'HostOperandRequired', propertyPath: 'save.identity' }
    });
    random.mockRestore();
    expect(await host.receive({ kind: 'freeze', revision: 0 })).toMatchObject({
      ok: true,
      value: { kind: 'frozen', revision: 0 }
    });
  } finally {
    random.mockRestore();
    host.dispose();
  }
});
