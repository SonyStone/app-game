import { createContextProvider } from '@app-game/solid-utils';
import { type ApplicationOptions, DOMAdapter, Application as PixiApplication, WebWorkerAdapter } from 'pixi.js';
import {
  createComponent,
  createEffect,
  createRoot,
  flatten,
  type Element as JSXElement,
  omit,
  onCleanup,
  snapshot,
  untrack
} from 'solid-js';
import { CommonPropKeys, type CommonProps } from './interfaces';

export const [ApplicationProvider, useApplication] = createContextProvider<PixiApplication>();

export type ApplicationProps = CommonProps<PixiApplication> & {
  fallback?: JSXElement;
} & Partial<ApplicationOptions>;

const ApplicationPropKeys = [...CommonPropKeys, 'fallback'] as const;

/**
 * The Application component creates a PIXI.js application instance and provides it via context.
 * This serves as the root component for PIXI applications.
 *
 * @param props.as - Optional existing PIXI.Application instance to use
 * @param props.ref - Callback to get access to the PIXI.Application instance
 * @param props.fallback - Content to show while application is initializing
 * @param props.children - Child components that will have access to the PIXI.Application context
 * @param props.ApplicationOptions - PIXI.Application options to initialize with
 */
export const Application = (props: ApplicationProps & { offscreen?: boolean }) => {
  const pixis = omit(props, ...ApplicationPropKeys);
  const canvas = untrack(() => props.canvas) as HTMLCanvasElement;
  const instance = untrack(() => props.as) ?? new PixiApplication();
  const applicationRef = untrack(() => props.ref);
  const options = untrack(() => snapshot(pixis)) as Partial<ApplicationOptions>;
  let disposeContent: (() => void) | undefined;
  let disposed = false;
  let initialized = false;

  if (untrack(() => props.offscreen)) {
    DOMAdapter.set(WebWorkerAdapter);
  }

  void instance.init(options).then(() => {
    initialized = true;
    if (disposed) {
      instance.destroy(true, { children: true });
      return;
    }

    applicationRef?.(instance);
    disposeContent = createRoot((dispose) => {
      const content = createComponent(ApplicationProvider, {
        value: instance,
        get children() {
          return props.children;
        }
      });

      createEffect(
        () => flatten(content),
        () => undefined
      );
      return dispose;
    });
  });

  onCleanup(() => {
    disposed = true;
    disposeContent?.();
    if (initialized) instance.destroy(true, { children: true });
  });

  return canvas;
};
