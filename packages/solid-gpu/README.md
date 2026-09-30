# @app-game/solid-gpu

WebGPU/TypeGPU lifetimes owned by Solid components, plus a typed worker transport. Extracted from
`apps/gpu-text-rendering`; [`DESIGN.md`](./DESIGN.md) and [`examples/`](./examples/) describe the larger
proposed API (render graph, scene components, `WorkerCanvas`), which is not implemented yet.

Sources are consumed directly (no build step); the consuming app compiles them with `vite-plugin-solid`.
`solid-js`, `@solidjs/web` and `typegpu` are peer dependencies.

## Entry points

| Import                       | Runs on                | Depends on                                                                                                                                    |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `@app-game/solid-gpu/errors` | anywhere               | `neverthrow`                                                                                                                                  |
| `@app-game/solid-gpu/gpu`    | main thread (DOM)      | `solid-js`, `@solidjs/web`, `typegpu`, primitives                                                                                             |
| `@app-game/solid-gpu/worker` | main thread and worker | `solid-js`, `neverthrow`, `@solid-primitives/event-listener`; `WorkerTasks` JSX compiles to `@solidjs/web`'s `createComponent`. No DOM access |

Every module is also exported individually (for example `@app-game/solid-gpu/gpu/GpuCanvasProvider` or
`@app-game/solid-gpu/worker/openWorker`). Prefer the barrels in application code; the per-module paths let a bundle
import only one side of the worker transport and let tests `vi.mock` a single module (such as `useGpuCanvas`) so
package-internal callers see the mock too.

## `/gpu`: device, canvas and resource lifetimes

```tsx
<TypeGPURootProvider requiredBufferBytes={bytes()} loading={<Spinner />} error={(e) => <p>{e.message}</p>}>
  <GpuCanvasProvider canvas={canvas()} error={(e) => <p>{e.message}</p>}>
    <Scene />
  </GpuCanvasProvider>
</TypeGPURootProvider>
```

- `TypeGPURootProvider` requests an adapter, device and TypeGPU root and mounts children only while it is ready.
  Changing `requiredBufferBytes` or recovering from device loss (up to `maxDeviceRecoveries`) replaces the subtree.
  `useTypeGPURoot()` returns the borrowed `GpuRoot`; `useGpuDevice()` adds the preferred canvas `format` (`GpuDevice`)
  for resources shared by every canvas.
- `GpuCanvasProvider` configures one canvas on that device. Replacing the canvas remounts children; `undefined`
  unmounts them. `useGpuCanvas()` returns the borrowed `GpuContext` (root, device, context, format, signal,
  checkActive). `GpuCanvas` combines both providers for single-canvas apps.
- `createGpuRoot(bytes)` and `createGpuCanvas(root, canvas)` are the provider-free factories, for harnesses and
  non-JSX owners.
- `createGpuResource(create)` creates a buffer/texture under `GpuCanvasProvider` and destroys it once, on owner cleanup
  or canvas detach. `onGpuRelease(signal, release)` is the same guarantee for arbitrary GPU-bound work.
- `makeGpuResources()` tracks allocations of one preparation (`keep`, typed as `KeepGpuResource`) and destroys them
  together, including resources kept after destruction.
- `serializeGpuPreparation(device, prepare)` runs preparations holding a device-wide error scope one at a time;
  `pendingGpuPreparation(device)` lets frame submission wait for them.

Borrowers never destroy the device or root. Every lifetime aborts its `signal` synchronously before the underlying
resource is released, and `checkActive()` returns a typed `GpuError` afterwards.

## `/worker`: request/reply transport

Main thread:

- `runWorkerRequest(create, input, { signal, transfer?, onProgress? })` runs one request in a fresh worker and
  resolves a `WorkerResult` (never rejects). Cancellation, completion and failure all shut the worker down.
- `openWorker(create, { message, error })` is the long-lived variant: `post(input, transfer)` and `close()`.
  `close()` sends `workerShutdown` and terminates after `workerShutdownGraceMs`.

Worker:

```tsx
mountWorker(
  () => <WorkerTasks<Input, Reply> execute={async (input, { signal, progress }) => ok(output)} error={toFailure} />,
  self
);
```

- `mountWorker(assembly, scope?)` mounts a component-only tree under a Solid root; the `workerShutdown` message
  disposes it (running cleanups) and closes the worker.
- `WorkerTasks` serves one request at a time in its own Solid scope, forwards progress, transfers outputs and refuses
  concurrent requests with a "busy" failure.

`workerProtocol` defines the shared wire types: `WorkerReply<Output, Failure, Progress>`, `ReplyOutput`,
`ReplyFailure`, `ReplyProgress`, `WorkerFailure` (native transport failures) and `WorkerResult`.

## `/errors`

`GpuError` (`kind: 'gpu'` with a stable `code`) and `gpuError()`, `AbortedError` and `abortedError()`,
`checkAborted(signal)`, `errorMessage(cause)` and `ResultValue<R>`. Applications add their own error kinds and union
them with these, for example `type ViewerError = DocumentError | GpuError | AbortedError`.

## Scripts

`pnpm --filter @app-game/solid-gpu typecheck` and `pnpm --filter @app-game/solid-gpu test` (Vitest in happy-dom with
WebGPU/TypeGPU test doubles).
