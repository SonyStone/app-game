import type { JSX } from '@solidjs/web';
import { createContext, Show, useContext } from 'solid-js';
import type { GpuError } from '../errors';
import { createGpuRoot, type GpuRoot } from './createGpuRoot';

/** Mounts children only with a ready GPU. Changing requiredBufferBytes replaces the entire GPU subtree. */
export function TypeGPURootProvider(props: {
  requiredBufferBytes: number;
  children: JSX.Element;
  loading?: JSX.Element;
  error: (error: GpuError) => JSX.Element;
}) {
  const state = createGpuRoot(() => props.requiredBufferBytes);

  const ready = () => {
    const current = state();

    return current.status === 'ready' ? current.gpu : undefined;
  };

  const failure = () => {
    const current = state();

    return current.status === 'error' ? current.error : undefined;
  };

  return (
    <Show
      when={ready()}
      keyed
      fallback={
        <Show when={failure()} keyed fallback={props.loading}>
          {props.error}
        </Show>
      }
    >
      {(gpu) => <RootContext value={gpu}>{props.children}</RootContext>}
    </Show>
  );
}

/** Reads a ready root beneath TypeGPURootProvider. A missing provider is a programming error. */
export function useTypeGPURoot() {
  return useContext(RootContext);
}

const RootContext = createContext<GpuRoot>();
