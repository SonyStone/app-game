import { makeEventListener } from '@solid-primitives/event-listener';
import type { Result } from 'neverthrow';
import {
  createMemo,
  createRenderEffect,
  createSignal,
  Errored,
  flush,
  Loading,
  onCleanup,
  Show,
  untrack
} from 'solid-js';
import type { AnyWorkerReply, ReplyFailure, ReplyOutput, ReplyProgress } from './workerProtocol';

/**
 * Serves requests arriving on a worker endpoint one at a time, each in its own Solid scope.
 * A request that arrives while another is active gets a "busy" failure reply instead of being queued; callers are
 * single-flight. The result of execute, a thrown exception or a rejection becomes exactly one terminal reply.
 * Disposal (mountWorker's cooperative shutdown) aborts the active request and suppresses its late messages.
 */
export function WorkerTasks<Input, Reply extends AnyWorkerReply>(props: {
  /** Receives requests and replies. Default `self`, the dedicated worker global. */
  endpoint?: WorkerEndpoint;
  /**
   * Called once in the request's owner. Its cleanups run before the next request starts. Progress and replies are
   * dropped once the signal aborts, so work may stop by throwing, for example with `signal.throwIfAborted()`.
   */
  execute: (
    input: Input,
    context: { signal: AbortSignal; progress: (value: ReplyProgress<Reply>) => void }
  ) => TaskResult<Reply> | PromiseLike<TaskResult<Reply>>;
  /** Maps a thrown exception, rejection or busy refusal to a cloneable failure. Must not throw. */
  error: (cause: unknown) => ReplyFailure<Reply>;
  /** Buffers in a successful output to transfer rather than clone. Default none. */
  transfer?: (output: ReplyOutput<Reply>) => Transferable[];
}) {
  const endpoint = props.endpoint ?? (self as WorkerEndpoint);
  const [request, setRequest] = createSignal<ActiveRequest<Input>>();
  let active: ActiveRequest<Input> | undefined;

  // mountWorker registers its shutdown listener first; disposing from it removes this listener before it runs.
  makeEventListener<{ message: MessageEvent<Input> }>(endpoint, 'message', ({ data }) => {
    if (active) {
      send({ ok: false, error: props.error(new Error('The worker is busy with another request')) });
      return;
    }
    active = { data, abort: new AbortController() };
    setRequest(active);
  });
  onCleanup(() => {
    active?.abort.abort();
    active = undefined;
  });

  return (
    <Show when={request()} keyed>
      {(request) => (
        <Errored
          // Errored is the only boundary that observes both synchronous throws and async memo rejections.
          fallback={(error) => {
            finish(request, { ok: false, error: props.error(error()) });
            return null;
          }}
        >
          <Loading>
            <Task request={request} />
          </Loading>
        </Errored>
      )}
    </Show>
  );

  function Task(task: { request: ActiveRequest<Input> }) {
    const { data, abort } = task.request;
    const { signal } = abort;
    const result = createMemo(async () =>
      untrack(() =>
        props.execute(data, {
          signal,
          progress: (progress) => {
            if (!signal.aborted) {
              send({ progress });
            }
          }
        })
      )
    );
    createRenderEffect(result, (result) =>
      finish(
        task.request,
        result.match<TerminalReply<Reply>>(
          (value) => ({ ok: true, value }),
          (error) => ({ ok: false, error })
        )
      )
    );
    return null;
  }

  /** Sends the terminal reply once, then frees the slot. Aborting marks completion and stops leftover work. */
  function finish(request: ActiveRequest<Input>, reply: TerminalReply<Reply>) {
    if (request.abort.signal.aborted) {
      return;
    }
    request.abort.abort();
    send(reply, reply.ok ? (props.transfer?.(reply.value) ?? []) : []);
    // finish runs inside the request scope's own render effect or Errored fallback; replacing the keyed scope from
    // there would dispose it mid-mount, so defer to a microtask. Microtasks drain before the next message task, so a
    // caller replying to this message with a new request never sees "busy".
    queueMicrotask(() => {
      if (active !== request) {
        return;
      }
      setRequest(undefined);
      // Signal writes are batched; flush commits the old scope's disposal (and its cleanups) before the next
      // request can acquire resources such as a decoder heap.
      flush();
      active = undefined;
    });
  }

  function send(message: TerminalReply<Reply> | { progress: ReplyProgress<Reply> }, transfer: Transferable[] = []) {
    endpoint.postMessage(message, { transfer });
  }
}

/** The worker global, or a test double, that receives requests and replies. */
export type WorkerEndpoint = EventTarget & {
  postMessage(message: unknown, options: { transfer: Transferable[] }): void;
};

/** The outcome of one request; the failure must survive structured cloning. */
type TaskResult<Reply extends AnyWorkerReply> = Result<ReplyOutput<Reply>, ReplyFailure<Reply>>;

type TerminalReply<Reply extends AnyWorkerReply> =
  | { ok: true; value: ReplyOutput<Reply> }
  | { ok: false; error: ReplyFailure<Reply> };

type ActiveRequest<Input> = { data: Input; abort: AbortController };
