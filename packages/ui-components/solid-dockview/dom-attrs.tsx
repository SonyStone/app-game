import type { JSX } from '@solidjs/web';
import { assign as assignDomAttrs$1 } from '@solidjs/web';
import { createTrackedEffect, omit } from 'solid-js';

export type HTMLDomAttrs = JSX.HTMLAttributes<HTMLElement>;
export function useSyncDOMAttrs(el: HTMLElement, props: any, excludeKeys: readonly string[]) {
  const doms = omit(props, ...excludeKeys);
  const assignDomAttrs = assignDomAttrs$1 as (
    element: HTMLElement,
    props: Record<string, any>,
    isSVG?: boolean,
    skipChildren?: boolean,
    prevProps?: Record<string, any>
  ) => void;

  const prevProps = {} as any;
  createTrackedEffect(() => assignDomAttrs(el, doms, false, true, prevProps));
}
