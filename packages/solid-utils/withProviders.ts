import { Component } from 'solid-js';
import { JSX } from 'solid-js/jsx-runtime';
import { createComponent } from 'solid-js/web';


interface Provider {
  provider: Component;
  opts?: Record<string, any>;
}

interface MergeParams {
  component: (props?: any) => JSX.Element;
  props: Record<string, any>;
  providers: Provider[];
}

function mergeProviders({ component, props = {}, providers }: MergeParams) {
  return providers.reduceRight(function (application, { provider, opts = {} }) {
      return () => createComponent(provider, { ...opts, get children() { return application(); } })
    },
    () => createComponent(component, props),
  );
}

export function withProviders<T>(component: Component<T>, props = {} as T) {

  const providers: Provider[] = [];

  const route = {
    use(provider: Component, opts = {} as any) {
      providers.push({ provider, opts});
      return route;
    },

    build() {
      return mergeProviders({ component, props, providers })
    }
  }

  return route;
}