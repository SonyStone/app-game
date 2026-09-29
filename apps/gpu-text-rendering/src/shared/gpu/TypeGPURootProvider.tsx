import { MatchTag } from '@solid-primitives/match';
import type { JSX } from '@solidjs/web';
import { createContext, useContext } from 'solid-js';
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

  return (
    <MatchTag
      on={state()}
      tag="status"
      case={{
        loading: () => props.loading,
        error: (state) => props.error(state().error),
        ready: (state) => {
          const gpu = state().gpu;
          return <RootContext value={gpu}>{props.children}</RootContext>;
        }
      }}
    />
  );
}

/** Reads a ready root beneath TypeGPURootProvider. A missing provider is a programming error. */
export function useTypeGPURoot() {
  return useContext(RootContext);
}

const RootContext = createContext<GpuRoot>();
