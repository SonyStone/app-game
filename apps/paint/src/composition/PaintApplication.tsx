import {
  createComponent,
  createContext,
  createEffect,
  createRoot,
  flatten,
  omit,
  onCleanup,
  useContext,
  type Element
} from 'solid-js';
import { createPaintRuntime } from '../paintRuntime';
import type { PaintEvent, PaintRuntimeCommand } from '../protocol';
import type { PaintModules } from './contracts';

/** Installs document ownership for descendants. Each mounted runtime receives its own document. */
export const [Document, useDocumentFactory] = provider<Pick<PaintModules, 'document'>>('Document');
/** Installs persistence independently of renderer and execution transport. */
export const [Storage, useStorageFactory] = provider<Pick<PaintModules, 'storage'>>('Storage');
/** Shares one renderer across all targets in the descendant runtime. */
export const [Renderer, useRendererFactory] = provider<Pick<PaintModules, 'renderer'>>('Renderer');
/** Supplies selectable sample processors. Algorithm state is created for each stroke. */
export const [StrokeProcessor, useProcessors] =
  provider<Pick<PaintModules, 'processors' | 'selectProcessor'>>('StrokeProcessor');
/** Supplies tool/preset-specific engines. Engines own stroke output, independently of smoothing. */
export const [BrushEngines, useEngines] = provider<Pick<PaintModules, 'engines' | 'selectEngine'>>('BrushEngines');

/** Supplies the decoded texture cache. A fresh cache is created for each runtime. */
export const [BrushResources, useResourcesFactory] = provider<Pick<PaintModules, 'resources'>>('BrushResources');

/** Materializes the configured runtime under these providers, without requiring a DOM renderer. */
export function PaintRuntime(props: RuntimeBinding & { children?: Element }) {
  const runtime = createPaintRuntime(props.post, props.close, {
    ...useDocumentFactory(),
    ...useStorageFactory(),
    ...useRendererFactory(),
    ...useProcessors(),
    ...useEngines(),
    ...useResourcesFactory()
  });
  props.ready(runtime);
  onCleanup(() => runtime.terminate());
  return createComponent(RuntimeContext, {
    value: runtime,
    get children() {
      return props.children;
    }
  });
}

/** Mounts a JSX recipe on main thread or worker. Commands arriving during Solid setup retain their order.
 * Configuration stays in its execution realm; only serializable commands cross a worker boundary.
 */
export function createPaintApplication(
  recipe: (binding: RuntimeBinding) => Element,
  post: RuntimeBinding['post'],
  close: RuntimeBinding['close']
) {
  let runtime: ReturnType<typeof createPaintRuntime> | undefined;
  let stopped = false;
  const pending: PaintRuntimeCommand[] = [];
  const dispose = createRoot((dispose) => {
    const content = recipe({
      post,
      close() {
        stopped = true;
        dispose();
        close();
      },
      ready(value) {
        if (runtime) throw new Error('A paint application must contain exactly one PaintRuntime.');
        runtime = value;
        for (const command of pending.splice(0)) runtime.send(command);
      }
    });
    createEffect(
      () => flatten(content),
      () => undefined
    );
    return dispose;
  });
  return {
    send(command: PaintRuntimeCommand) {
      if (stopped) return;
      if (runtime) runtime.send(command);
      else pending.push(command);
    },
    terminate() {
      if (stopped) return;
      stopped = true;
      pending.length = 0;
      dispose();
    }
  };
}

/** Transport hooks supplied by createPaintApplication; recipes pass these to their single PaintRuntime. */
export type RuntimeBinding = {
  post: (event: PaintEvent) => void;
  close: () => void;
  ready: (runtime: ReturnType<typeof createPaintRuntime>) => void;
};

/** Accesses the mounted command runtime for target components and application-specific controls. */
export function usePaintRuntime() {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('Canvas targets must be inside PaintRuntime.');
  return runtime;
}
const RuntimeContext = createContext<ReturnType<typeof createPaintRuntime>>();

/** Independent contexts prevent sibling setup order from deciding which service a runtime receives. */
function provider<T extends object>(name: string) {
  const context = createContext<T>();
  return [
    (props: T & { children?: Element }) =>
      createComponent(context, {
        value: omit(props, 'children') as T,
        get children() {
          return props.children;
        }
      }),
    () => {
      const value = useContext(context);
      if (!value) throw new Error(`PaintRuntime requires a ${name} provider.`);
      return value;
    }
  ] as const;
}
