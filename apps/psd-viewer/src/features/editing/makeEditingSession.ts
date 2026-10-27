import { openPsdEditor, type PsdEditorSession, type PsdPreparedSave } from '@app-game/psd/editor';
import {
  historyLimit,
  sourceSaveOperands,
  wireResult,
  type EditingCommand,
  type EditingRequest,
  type EditingResponse,
  type EditingResult,
  type EditingState
} from './contracts';

/**
 * Owns independently saved source-relative revisions beside the renderer, strictly reopened before publication.
 * Replay keeps exact operands, admits no weaker contract and bounds history to 64 operations. Prepared saves
 * own independent bytes until release/disposal. The caller serializes requests and disposes on document close.
 */
export async function makeEditingSession(
  source: Uint8Array,
  publish: (bytes: Uint8Array, visual: boolean) => Promise<EditingResult<void>>,
  open: typeof openPsdEditor = openPsdEditor,
  basename = 'document'
): Promise<
  EditingResult<{
    receive(request: EditingRequest): Promise<EditingResult<EditingResponse>>;
    dispose(): void;
  }>
> {
  const opened = wireResult(await open(source));
  if (!opened.ok) {
    return opened;
  }

  let session = opened.value;
  // Store commands and runtime operands, not a copy of every potentially 64 MiB revision.
  // Reactive undo helpers cannot provide private WASM replay and fallible strict publication.
  type SavedAction = { command: EditingCommand; operands: ReturnType<typeof sourceSaveOperands>; payloadBytes: number };
  let history: SavedAction[] = [];
  let position = 0;
  let revision = 0;
  let disposed = false;
  let cost = { milliseconds: 0, replayed: 0, sourceBytes: source.byteLength };
  const saves = new Map<string, PsdPreparedSave>();

  const state = (): EditingState => ({
    revision,
    position,
    historyLength: history.length,
    tree: wireResult(session.inspect()),
    source: wireResult(session.inspectSource()),
    process: wireResult(session.inspectProcess()),
    cost
  });
  const current = (): EditingResult<EditingResponse> => ({ ok: true, value: { kind: 'state', state: state() } });

  /** Stages replay privately so writer, strict-open and allocation failures cannot half-commit. */
  async function commit(commands: SavedAction[], nextPosition: number) {
    const started = performance.now();
    const candidate = wireResult(await open(source));
    if (!candidate.ok) {
      return candidate;
    }

    let accepted = false;
    let staged = candidate.value;
    let bytes = source;
    const visual = [...history.slice(0, position), ...commands.slice(0, nextPosition)].some(
      (action) => action.command.kind === 'tree'
    );
    try {
      for (const action of commands.slice(0, nextPosition)) {
        const applied = apply(staged, action.command, action.operands, bytes);
        if (!applied.ok) {
          return applied;
        }

        const frozen = wireResult(staged.prepareSave());
        if (!frozen.ok) {
          return frozen;
        }
        bytes = collectForDisplay(frozen.value);
        if (bytes.byteLength > 64 * 1024 ** 2) {
          return {
            ok: false as const,
            error: {
              code: 'ResourceBudget' as const,
              message: 'The saved revision exceeds the 64 MiB editing source limit.',
              resource: 'editor.sourceBytes',
              requested: BigInt(bytes.byteLength),
              limit: 64n * 1024n ** 2n
            }
          };
        }
        // A completed transaction becomes the pristine source for the next independent action.
        const reopened = wireResult(await open(bytes));
        if (!reopened.ok) {
          return reopened;
        }
        staged.dispose();
        staged = reopened.value;
      }

      const displayed = await publish(bytes, visual);
      if (!displayed.ok) {
        return displayed;
      }

      session.dispose();
      session = staged;
      history = commands;
      position = nextPosition;
      revision++;
      cost = { milliseconds: performance.now() - started, replayed: nextPosition, sourceBytes: source.byteLength };
      accepted = true;
      return current();
    } finally {
      if (!accepted) {
        staged.dispose();
      }
    }
  }

  return {
    ok: true,
    value: {
      async receive(request) {
        if (disposed) {
          return { ok: false, error: { code: 'Disposed', message: 'The editor is closed.' } };
        }

        if ('revision' in request && request.revision !== revision) {
          return {
            ok: false,
            error: {
              code: 'StaleRevision',
              propertyPath: 'editor.revision',
              message: 'This request belongs to an older editor revision.'
            }
          };
        }

        switch (request.kind) {
          case 'open':
            return current();
          case 'edit': {
            if (position >= historyLimit) {
              return {
                ok: false,
                error: {
                  code: 'HistoryLimit',
                  propertyPath: 'editor.history',
                  message: `This session is bounded to ${historyLimit} committed edits. Save and reopen to continue.`
                }
              };
            }

            const payloadBytes = commandPayloadBytes(request.command);
            const retained = history
              .slice(0, position)
              .reduce((bytes, action) => bytes + action.payloadBytes, payloadBytes);
            if (retained > 64 * 1024 ** 2) {
              return {
                ok: false,
                error: {
                  code: 'ResourceBudget',
                  message: 'Undo history is limited to 64 MiB of pixel inputs. Save and reopen to continue.',
                  resource: 'editor.historyBytes',
                  requested: BigInt(retained),
                  limit: 64n * 1024n ** 2n
                }
              };
            }

            const options = request.options ?? { mode: 'source', linearBlending: false };
            if (options.mode !== 'source' || typeof options.linearBlending !== 'boolean') {
              return {
                ok: false,
                error: { code: 'Invalid', message: 'Choose source settings and an RGB blending mode.' }
              };
            }
            let operands: ReturnType<typeof sourceSaveOperands>;
            try {
              operands = sourceSaveOperands(basename, options);
            } catch {
              return {
                ok: false,
                error: {
                  code: 'HostOperandRequired',
                  propertyPath: 'save.identity',
                  message: 'Saving edits requires a secure browser with crypto.randomUUID.'
                }
              };
            }
            return commit(
              [...history.slice(0, position), { command: structuredClone(request.command), operands, payloadBytes }],
              position + 1
            );
          }
          case 'undo':
          case 'redo': {
            const next = position + (request.kind === 'undo' ? -1 : 1);
            if (next < 0 || next > history.length) {
              return { ok: false, error: { code: 'Invalid', message: `Nothing to ${request.kind}.` } };
            }

            return commit(history, next);
          }
          case 'freeze': {
            // A single bounded frozen save avoids accumulating unbounded WASM byte buffers.
            if (saves.size) {
              return {
                ok: false,
                error: { code: 'Budget', message: 'Finish or cancel the current frozen save first.' }
              };
            }
            // Generate the handle before allocating frozen bytes. In insecure contexts randomUUID may be absent.
            let save: string;
            try {
              save = crypto.randomUUID();
            } catch {
              return {
                ok: false,
                error: {
                  code: 'HostOperandRequired',
                  propertyPath: 'save.identity',
                  message: 'A secure browser context with crypto.randomUUID is required for independent save handles.'
                }
              };
            }
            const frozen = wireResult(session.prepareSave());
            if (!frozen.ok) {
              return frozen;
            }

            // A late release from a replaced worker must never collide with a new session's save.
            saves.set(save, frozen.value);
            return { ok: true, value: { kind: 'frozen', save, revision } };
          }
          case 'chunk': {
            const save = saves.get(request.save);
            if (!save) {
              return { ok: false, error: { code: 'Disposed', message: 'The frozen save has been released.' } };
            }

            try {
              return { ok: true, value: { kind: 'chunk', bytes: save.nextChunk(request.maxBytes) } };
            } catch (error) {
              save.dispose();
              saves.delete(request.save);
              return { ok: false, error: { code: 'Invalid', message: String(error) } };
            }
          }
          case 'release':
            saves.get(request.save)?.dispose();
            saves.delete(request.save);
            return { ok: true, value: { kind: 'released' } };
        }
      },
      dispose() {
        if (disposed) {
          return;
        }

        disposed = true;
        for (const save of saves.values()) {
          save.dispose();
        }
        saves.clear();
        session.dispose();
      }
    }
  };
}

/** V5 gets only browser operands; bounded metadata keeps its separate source-preserving contract. */
function apply(
  session: PsdEditorSession,
  command: EditingCommand,
  operands: ReturnType<typeof sourceSaveOperands>,
  sourceBytes: Uint8Array
) {
  const context = { ...operands, sourceBytes };
  if (command.kind === 'tree') {
    let edit = command.edit;
    const process = session.inspectProcess();
    if (process.ok && (process.value.mode !== 3 || process.value.depth !== 8)) {
      if (edit.kind === 'rename') {
        edit = { ...edit, kind: 'renameProcessLayer' };
      } else if (edit.kind === 'opacity') {
        edit = { ...edit, kind: 'setProcessOpacity' };
      }
    }
    const result = wireResult(session.editRasterTreeExact([edit], context));
    if (
      !result.ok &&
      result.error.code === 'Dependency' &&
      result.error.propertyPath.includes('save.xmp.initial-event')
    ) {
      // Only the named missing-event route permits a genuine preparation event, never a host-fact retry.
      const initialEvent = operands.initialEvent ?? {
        instanceId: `xmp.iid:${crypto.randomUUID()}`,
        when: new Date().toISOString().slice(0, 19) + '+00:00'
      };
      Object.assign(operands, { initialEvent });
      return wireResult(session.editRasterTreeExact([edit], { ...context, initialEvent }));
    }
    return result;
  }

  const edit =
    command.edit.kind === 'fileInfoCopyright'
      ? {
          ...command.edit,
          saveContext: {
            modifiedAt: context.save.saveTime,
            instanceId: context.save.instanceId,
            documentId: context.save.documentId,
            softwareAgent: context.save.softwareAgent
          }
        }
      : command.edit;
  return wireResult(session.editStateMetadata([edit]));
}

/** Only renderer reopening needs contiguous input. Saving uses owned chunks directly. Always releases on error. */
function collectForDisplay(save: PsdPreparedSave) {
  try {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    for (let chunk; (chunk = save.nextChunk(1024 * 1024)); ) {
      chunks.push(new Uint8Array(chunk));
    }

    const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } finally {
    save.dispose();
  }
}

/** Counts retained typed-array inputs once per shared view, before cloning pixel payloads into undo history. */
function commandPayloadBytes(value: unknown, visited = new Set<object>()): number {
  if (typeof value !== 'object' || value === null || visited.has(value)) {
    return 0;
  }
  visited.add(value);
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  return Object.values(value).reduce<number>((bytes, item) => bytes + commandPayloadBytes(item, visited), 0);
}
