import { readPsd } from '@app-game/psd';
import { openPsdEditor } from '@app-game/psd/editor';
import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import {
  localIsoTime,
  preferredContract,
  readableRefusal,
  sourceSaveOperands,
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
    ).toMatchObject({ ok: false, error: { code: 'Dependency' } });
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

it('creates browser operands from genuine clocks and UUIDs, with honest identity and local EXIF time', () => {
  const now = new Date('2026-10-27T13:02:35Z');
  vi.useFakeTimers();
  vi.setSystemTime(now);
  try {
    const context = sourceSaveOperands('opened.PSB', { mode: 'source', linearBlending: true });
    expect(context).toMatchObject({
      contract: preferredContract,
      editTime: now.valueOf() / 1000,
      save: {
        basename: 'opened',
        softwareAgent: 'PSD Viewer',
        linearBlending: true,
        saveTime: '2026-10-27T13:02:35+00:00'
      }
    });
    expect(context.save.instanceId).toMatch(/^xmp.iid:[0-9a-f-]{36}$/);
    expect(context.save.documentId).toMatch(/^adobe:docid:photoshop:[0-9a-f-]{36}$/);
    expect(context.save.exifTime).toContain(String(now.getHours()).padStart(2, '0') + ':02:35');
    expect(Object.keys(context).sort()).toEqual(['contract', 'editTime', 'save']);
  } finally {
    vi.useRealTimers();
  }
});

it.each([
  ['Europe/Berlin', '2026-10-27T21:58:20+01:00'],
  ['America/New_York', '2026-10-27T16:58:20-04:00'],
  ['Asia/Kolkata', '2026-10-28T02:28:20+05:30'],
  ['UTC', '2026-10-27T20:58:20+00:00']
])('gives File Info the action instant as local time with its offset in %s', (zone, expected) => {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    const instant = new Date('2026-10-27T20:58:20Z');
    expect(localIsoTime(instant)).toBe(expected);
    expect(new Date(expected).valueOf()).toBe(instant.valueOf());
    // Replaying the retained instant reproduces the same operand.
    expect(localIsoTime(new Date(instant.valueOf()))).toBe(expected);
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  }
});

it('saves each v5 action against the preceding pristine product and replays exact bytes on undo/redo', async () => {
  const original = new Uint8Array(
    await readFile(new URL('../../../packages/psd/test/editor/source-host-rgb8.psd', import.meta.url))
  );
  const displayed: Uint8Array[] = [];
  const host = value(
    await makeEditingSession(
      original,
      async (bytes) => {
        displayed.push(bytes.slice());
        return { ok: true, value: undefined };
      },
      openPsdEditor,
      'source-host-rgb8.psd'
    )
  );
  const call = async (request: EditingRequest) => value(await host.receive(request));
  try {
    await call({
      kind: 'edit',
      revision: 0,
      command: { kind: 'tree', edit: { kind: 'rename', layerId: 3, name: 'Browser name' } }
    });
    await call({
      kind: 'edit',
      revision: 1,
      command: { kind: 'tree', edit: { kind: 'opacity', layerId: 3, opacity: 173 } }
    });
    expect(displayed[0]).not.toEqual(original);
    expect(displayed[1]).not.toEqual(displayed[0]);
    await call({ kind: 'undo', revision: 2 });
    expect(displayed[2]).toEqual(displayed[0]);
    await call({ kind: 'redo', revision: 3 });
    expect(displayed[3]).toEqual(displayed[1]);
    await call({ kind: 'undo', revision: 4 });
    await call({ kind: 'undo', revision: 5 });
    expect(displayed[5]).toEqual(original);
    const reopened = value(await openPsdEditor(displayed[1]!));
    try {
      expect((await readPsd(displayed[1]!)).layers.some((layer) => layer.name === 'Browser name')).toBe(true);
    } finally {
      reopened.dispose();
    }
  } finally {
    host.dispose();
  }
});

it.each([
  ['save.sourceHost.typeRendering', 'text layers whose fonts'],
  ['save.sourceHost.missingGrid', 'grid or guide'],
  ['save.sourceHost.icc', 'color profile'],
  ['save.sourceHost.proofLabel', 'localized labels']
])('explains %s while retaining its named dependency', (propertyPath, text) => {
  expect(
    readableRefusal({ code: 'Dependency', propertyPath, capability: 'witness', message: 'technical reason' })
  ).toContain(text);
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

it('bounds pixel history inputs before cloning or mutating a session and permits a corrected retry', async () => {
  const bytes = await source();
  const publish = vi.fn(async () => ({ ok: true as const, value: undefined }));
  const host = value(await makeEditingSession(bytes, publish));
  try {
    const before = value(await host.receive({ kind: 'open' }));
    expect(
      await host.receive({
        kind: 'edit',
        revision: 0,
        command: {
          kind: 'tree',
          edit: {
            kind: 'replacePixels',
            layerId: 2,
            pixels: { left: 0, top: 0, width: 1, height: 1, rgba: new Uint8Array(64 * 1024 ** 2 + 1) }
          }
        }
      })
    ).toMatchObject({ ok: false, error: { code: 'ResourceBudget', resource: 'editor.historyBytes' } });
    expect(publish).not.toHaveBeenCalled();
    expect(value(await host.receive({ kind: 'open' }))).toEqual(before);
    expect(
      await host.receive({
        kind: 'edit',
        revision: 0,
        command: { kind: 'metadata', edit: { kind: 'resolutionNoResample', ppi: 144 } }
      })
    ).toMatchObject({ ok: true });
  } finally {
    host.dispose();
  }
});

it('keeps metadata publication nonvisual after a committed v5 tree edit and when undoing that metadata', async () => {
  const source = new Uint8Array(
    await readFile(new URL('../../../packages/psd/test/editor/source-host-rgb8.psd', import.meta.url))
  );
  const publications: { bytes: Uint8Array; visual: boolean }[] = [];
  const host = value(
    await makeEditingSession(source, async (bytes, visual) => {
      publications.push({ bytes: bytes.slice(), visual });
      return { ok: true, value: undefined };
    })
  );
  try {
    value(
      await host.receive({
        kind: 'edit',
        revision: 0,
        command: { kind: 'tree', edit: { kind: 'rename', layerId: 3, name: 'changed' } }
      })
    );
    value(
      await host.receive({
        kind: 'edit',
        revision: 1,
        command: { kind: 'metadata', edit: { kind: 'printCaption', enabled: true } }
      })
    );
    expect(publications.map((entry) => entry.visual)).toEqual([true, false]);
    expect(publications[1]!.bytes).not.toEqual(publications[0]!.bytes);
    expect(await readPsd(publications[1]!.bytes)).toEqual(await readPsd(publications[0]!.bytes));
    value(await host.receive({ kind: 'undo', revision: 2 }));
    expect(publications[2]).toEqual({ bytes: publications[0]!.bytes, visual: false });
  } finally {
    host.dispose();
  }
});
