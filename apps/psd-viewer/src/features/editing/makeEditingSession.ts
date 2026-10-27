import { openPsdEditor, type PsdEditorSession, type PsdPreparedSave } from '@app-game/psd/editor';
import {
  historyLimit,
  hostRefusal,
  wireResult,
  type EditingCommand,
  type EditingRequest,
  type EditingResponse,
  type EditingResult,
  type EditingState
} from './contracts';

/**
 * Owns a source-preserving editor beside the renderer. Metadata commits reopen strictly before publication.
 * Replay keeps exact operands, admits no weaker contract and bounds history to 64 operations. Prepared saves
 * own independent bytes until release/disposal. The caller serializes requests and disposes on document close.
 */
export async function makeEditingSession(
  source: Uint8Array,
  publish: (bytes: Uint8Array) => Promise<EditingResult<void>>,
  open: typeof openPsdEditor = openPsdEditor
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
  let history: EditingCommand[] = [];
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
  async function commit(commands: EditingCommand[], nextPosition: number) {
    const started = performance.now();
    const candidate = wireResult(await open(source));
    if (!candidate.ok) {
      return candidate;
    }

    let accepted = false;
    try {
      for (const command of commands.slice(0, nextPosition)) {
        const applied = apply(candidate.value, command);
        if (!applied.ok) {
          return applied;
        }
      }

      const frozen = wireResult(candidate.value.prepareSave());
      if (!frozen.ok) {
        return frozen;
      }

      const bytes = collectForDisplay(frozen.value);
      const displayed = await publish(bytes);
      if (!displayed.ok) {
        return displayed;
      }

      session.dispose();
      session = candidate.value;
      history = commands;
      position = nextPosition;
      revision++;
      cost = { milliseconds: performance.now() - started, replayed: nextPosition, sourceBytes: source.byteLength };
      accepted = true;
      return current();
    } finally {
      if (!accepted) {
        candidate.value.dispose();
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
            const refused = hostRefusal(request.command);
            if (refused) {
              return { ok: false, error: refused };
            }

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

            return commit([...history.slice(0, position), structuredClone(request.command)], position + 1);
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
            const frozen = wireResult(session.prepareSave());
            if (!frozen.ok) {
              return frozen;
            }

            // A late release from a replaced worker must never collide with a new session's save.
            const save = crypto.randomUUID();
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

function apply(session: PsdEditorSession, command: EditingCommand) {
  const refused = hostRefusal(command);
  if (refused) {
    return { ok: false as const, error: refused };
  }

  if (command.kind === 'tree') {
    // Tree requests currently always hit the honest-host guard. Never use context-free mutation here.
    throw new Error('A truthful exact-tree contract must be implemented before enabling tree transactions.');
  }

  return wireResult(session.editStateMetadata([command.edit]));
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
