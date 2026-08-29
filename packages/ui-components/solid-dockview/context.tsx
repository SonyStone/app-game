import { DockviewComponent, DockviewComponentOptions, DockviewPanel } from 'dockview-core';
import { Accessor, type Element as JSXElement, createContext, createSignal, onCleanup } from 'solid-js';

import { dockViewPropKeys } from './DockView';
import { useSyncDOMAttrs } from './dom-attrs';
import { dockviewEventNames } from './events';
import { panelStateLUT } from './global-api';
import {
  createComponent,
  createGroupHeaderComponent,
  createTabComponent,
  createWatermarkComponent
} from './glue-component';
import type { DockPanelProps, DockViewProps } from './index';
import { keyedDebounce, watch } from './utils';

export const DockViewContext = createContext<ReturnType<typeof createDockViewContext>>();

export function createDockViewContext(props: DockViewProps) {
  const element = document.createElement('div');
  useSyncDOMAttrs(element, props, dockViewPropKeys);

  const [extraRenders, updateExtraRenders] = createSignal<Accessor<JSXElement>[]>([], { ownedWrite: true });
  const addExtraRender = (render: Accessor<JSXElement>) => {
    updateExtraRenders((x) => x.concat(render));
    return () => {
      updateExtraRenders((arr) => arr.filter((x) => x !== render));
    };
  };

  const options: DockviewComponentOptions = {
    createComponent: createComponent(props, addExtraRender),
    createTabComponent: createTabComponent(props, addExtraRender),
    hideBorders: false,
    singleTabMode: props.singleTabMode,
    createWatermarkComponent: createWatermarkComponent(props, addExtraRender),
    createPrefixHeaderActionComponent: createGroupHeaderComponent(
      props,
      'prefixHeaderActionsComponent',
      addExtraRender
    ),
    createLeftHeaderActionComponent: createGroupHeaderComponent(props, 'leftHeaderActionsComponent', addExtraRender),
    createRightHeaderActionComponent: createGroupHeaderComponent(props, 'rightHeaderActionsComponent', addExtraRender)
  };

  props.onBeforeCreate?.(options, props);
  const dockview = new DockviewComponent(element, options);

  // add event listeners
  dockviewEventNames.forEach((eventName) => {
    let disposable: { dispose(): void } | undefined;

    watch(
      () => props[eventName],
      (listener: any) => {
        disposable?.dispose();
        disposable = undefined;

        if (typeof listener !== 'function') return;

        disposable = dockview[eventName](listener);
      }
    );

    onCleanup(() => disposable?.dispose());
  });

  const setPanelOpenStatus = keyedDebounce(
    (panel: DockviewPanel, isOpen: boolean) => (panelStateLUT.get(panel)!.isOpen = isOpen)
  );
  const addPanelDisposable = dockview.onDidAddPanel((panel) => setPanelOpenStatus(panel as DockviewPanel, true));
  const removePanelDisposable = dockview.onDidRemovePanel((panel) => setPanelOpenStatus(panel as DockviewPanel, false));
  onCleanup(() => {
    addPanelDisposable.dispose();
    removePanelDisposable.dispose();
  });

  return {
    element,
    dockview,
    extraRenders,
    props
  };
}

export interface PanelContentRendererParams {
  contentElement: HTMLElement;
  tabElement: HTMLElement;
  props: DockPanelProps;
}
