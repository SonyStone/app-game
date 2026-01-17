import { createContextProvider } from '@utils/createContextProvider';
import { type ApplicationOptions, DOMAdapter, Application as PixiApplication, WebWorkerAdapter } from 'pixi.js';
import { type JSXElement, Show, createResource, onCleanup, splitProps } from 'solid-js';
import { CommonPropKeys, type CommonProps } from './interfaces';
import { effect } from './runtime';

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
  const [common, pixis] = splitProps(props, ApplicationPropKeys);

  if (props.offscreen) {
    DOMAdapter.set(WebWorkerAdapter);
  }

  const [app] = createResource(
    () => (common.as || new PixiApplication()) as PixiApplication,
    async (app) => {
      await app.init(pixis);
      return app;
    }
  );

  effect(() => {
    if (app()) common.ref?.(app()!);
  });

  onCleanup(() => {
    app()?.destroy(true, { children: true });
  });

  <Show when={app()} fallback={common.fallback}>
    {(app) => <ApplicationProvider value={app()}>{props.children}</ApplicationProvider>}
  </Show>;

  return props.canvas as HTMLCanvasElement;
};
