import { abortedError } from '@app-game/solid-gpu/errors';
import { err, ok, type Result } from 'neverthrow';
import { onCleanup } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { engineError, type PaintError } from '../../shared/errors';

/**
 * Correlates engine replies with the requests that caused them, by `requestId`. Must be created within a Solid owner;
 * disposal settles outstanding requests as aborted.
 *
 * Each caller waits at most `timeoutMs`. A timeout frees the caller and `busy`, which lets the user retry, but the
 * request stays outstanding: the engine processes commands in order, so its reply may still arrive. A late successful
 * reply still runs the request's `onReply`, and a retry with the same `key` joins the outstanding request instead of
 * posting a duplicate. `disconnect()` settles every outstanding request when the engine is replaced.
 */
export function createEngineRequests<Value>(options: {
  /** Longest time one caller waits for a reply. */
  timeoutMs: number;
  /** Converts an error message reported by the engine into a typed failure. */
  failure: (message: string) => PaintError;
}) {
  const [waiting, setWaiting, currentlyWaiting] = createImmediateSignal(0);
  const outstanding = new Map<string, Outstanding<Value>>();
  onCleanup(() => disconnect(abortedError()));

  return {
    /** Whether a caller is waiting for a reply. */
    busy: () => waiting() > 0,
    /** Like `busy`, including requests started earlier in the current event; for synchronous guards. */
    isBusy: () => currentlyWaiting() > 0,
    request,
    receive,
    disconnect
  };

  /**
   * Posts a request and resolves its reply, a timeout or a disconnection; never rejects. `post` receives the new
   * request id and reports transport failures. With a `key`, an outstanding request for the same key is joined rather
   * than posted again. `onReply` runs once for a successful reply, even one arriving after this caller timed out.
   */
  async function request(
    post: (requestId: string) => Result<void, PaintError>,
    key?: string,
    onReply?: (value: Value) => void
  ): Promise<Result<Value, PaintError>> {
    let entry = key === undefined ? undefined : [...outstanding.values()].find((item) => item.key === key);
    if (!entry) {
      const requestId = crypto.randomUUID();
      const created = outstandingRequest<Value>(key);
      outstanding.set(requestId, created);
      void created.reply.then((result) => result.isOk() && onReply?.(result.value));
      const sent = post(requestId);
      if (sent.isErr()) {
        outstanding.delete(requestId);
        return err(sent.error);
      }

      entry = created;
    }

    setWaiting(currentlyWaiting() + 1);
    try {
      return await withTimeout(entry.reply, options.timeoutMs);
    } finally {
      setWaiting(currentlyWaiting() - 1);
    }
  }

  /** Delivers a reply from the engine's wire format. Replies for unknown or settled requests are ignored. */
  function receive(requestId: string, result: WireResult<Value>) {
    const entry = outstanding.get(requestId);
    if (!entry) {
      return;
    }

    outstanding.delete(requestId);
    entry.settle(result.ok ? ok(result.value) : err(options.failure(result.error)));
  }

  /** Settles every outstanding request; used when the engine is replaced or closed. Replies after this are ignored. */
  function disconnect(
    reason: PaintError = engineError('disconnected', 'The drawing engine changed before the request completed.')
  ) {
    const entries = [...outstanding.values()];
    outstanding.clear();
    entries.forEach((entry) => entry.settle(err(reason)));
  }
}

/** A posted request whose reply has not arrived. */
type Outstanding<Value> = {
  /** Deduplication key, for example an immutable resource id. */
  key: string | undefined;
  reply: Promise<Result<Value, PaintError>>;
  settle: (result: Result<Value, PaintError>) => void;
};

/** Creates the pending reply of one posted request. */
function outstandingRequest<Value>(key: string | undefined): Outstanding<Value> {
  let settle!: Outstanding<Value>['settle'];
  const reply = new Promise<Result<Value, PaintError>>((resolve) => {
    settle = resolve;
  });
  return { key, reply, settle };
}

/** The plain result object carried by protocol replies; neverthrow results do not survive structured cloning. */
type WireResult<Value> = { ok: true; value: Value } | { ok: false; error: string };

/** Resolves the reply, or a timeout failure after `ms` without cancelling the reply. */
function withTimeout<Value>(reply: Promise<Result<Value, PaintError>>, ms: number) {
  return new Promise<Result<Value, PaintError>>((resolve) => {
    const timer = setTimeout(
      () => resolve(err(engineError('timeout', 'The drawing engine did not reply in time. Try again.'))),
      ms
    );
    void reply.then((result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}
