import { createMemo, createRenderEffect, Errored, Loading, Show, untrack, type Accessor } from 'solid-js';
import type { WorkerRequest } from './createWorkerRequests';
import type { WorkerReply } from './workerProtocol';

/** Runs each queued request in its own Solid scope. Handles async completion, typed failures and output transfers. */
export function WorkerTasks<Input, Output, Failure, Progress = never>(props: {
  /** The active request from createWorkerRequests; each value mounts a fresh task scope. */
  request: Accessor<WorkerRequest<Input, WorkerReply<Output, Failure, Progress>> | undefined>;
  /** Called once in the request's owner. Return undefined only after cancellation; progress stops with the request. */
  execute: (
    input: Input,
    context: { signal: AbortSignal; progress: (value: Progress) => void }
  ) => Outcome<Output, Failure> | undefined | PromiseLike<Outcome<Output, Failure> | undefined>;
  /** Maps a thrown exception or rejection to a cloneable failure reply. Must not throw. */
  error: (cause: unknown) => Failure;
  /** Buffers in a successful output to transfer rather than clone. Default none. */
  transfer?: (output: Output) => Transferable[];
}) {
  return (
    <Show when={props.request()} keyed>
      {(request) => (
        <Errored
          // Errored is the only boundary that observes both synchronous throws and async memo rejections.
          // Replying from its fallback is the terminal reply; createWorkerRequests defers the scope swap.
          fallback={(error) => {
            request.reply({ ok: false, error: props.error(error()) });
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

  function Task(task: { request: NonNullable<ReturnType<typeof props.request>> }) {
    const request = task.request;
    const result = createMemo(async () => {
      if (request.signal.aborted) {
        return;
      }
      return await untrack(() =>
        props.execute(request.data, {
          signal: request.signal,
          progress: (progress) => request.post({ progress })
        })
      );
    });
    createRenderEffect(result, (reply) => {
      if (reply && !request.signal.aborted) {
        request.reply(reply, reply.ok ? (props.transfer?.(reply.value) ?? []) : []);
      }
    });
    return null;
  }
}

type Outcome<Output, Failure> = Exclude<WorkerReply<Output, Failure>, { progress: never }>;
