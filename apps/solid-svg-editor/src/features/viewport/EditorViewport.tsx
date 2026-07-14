import type {
  EditorKernel,
  ViewportHostService,
  ViewportLayerContribution,
  ViewportLayerService,
  ViewportOverlayContribution,
  ViewportOverlayService,
  ViewportToolbarContribution
} from '../../editor/kernel';
import type { EditorPanelContext } from '../panels/panelRegistry';
import { ViewportLayerStack, ViewportOverlayLayer, ViewportToolbar } from './ViewportParts';

type EditorViewportProps<TContext = EditorPanelContext> =
  | {
      readonly kernel: EditorKernel<EditorPanelContext>;
    }
  | {
      readonly context: EditorPanelContext;
    }
  | {
      readonly context: TContext;
      readonly host: ViewportHostService;
      readonly layers: ViewportLayerService;
      readonly overlays: ViewportOverlayService;
      readonly toolbarItems?: readonly ViewportToolbarContribution<TContext>[] | undefined;
      readonly layerItems?: readonly ViewportLayerContribution<TContext>[] | undefined;
      readonly overlayItems?: readonly ViewportOverlayContribution<TContext>[] | undefined;
    };

type ViewportProjection<TContext> =
  | {
      readonly kind: 'kernel';
      readonly context: EditorPanelContext;
      readonly host: ViewportHostService;
      readonly toolbarItems: readonly ViewportToolbarContribution<EditorPanelContext>[];
      readonly layerItems: readonly ViewportLayerContribution<EditorPanelContext>[];
      readonly overlayItems: readonly ViewportOverlayContribution<EditorPanelContext>[];
      readonly layers: ViewportLayerService;
      readonly overlays: ViewportOverlayService;
    }
  | {
      readonly kind: 'explicit';
      readonly context: TContext;
      readonly host: ViewportHostService;
      readonly toolbarItems: readonly ViewportToolbarContribution<TContext>[];
      readonly layerItems: readonly ViewportLayerContribution<TContext>[];
      readonly overlayItems: readonly ViewportOverlayContribution<TContext>[];
      readonly layers: ViewportLayerService;
      readonly overlays: ViewportOverlayService;
    };

export function EditorViewport<TContext = EditorPanelContext>(props: EditorViewportProps<TContext>) {
  const projection = () => viewportProjection(props);
  const host = () => projection().host;

  return (
    <main
      class="viewport-column grid min-h-0 min-w-0 grid-rows-[35px_minmax(0,1fr)] py-1.5 pr-1.5 pl-0"
      data-testid="viewport-column"
    >
      <ViewportToolbarProjection projection={projection()} />
      <div
        ref={(element) => host().setViewportShell(element)}
        class="viewport-shell relative min-h-0 min-w-0 overflow-hidden rounded-md border-2 border-[#2b324c] bg-[var(--canvas)]"
        data-testid="viewport-shell"
      >
        <svg
          ref={(element) => host().setCanvasSvg(element)}
          class="viewport-svg block h-full w-full touch-none select-none"
          viewBox={`${projection().layers.viewRect().x} ${projection().layers.viewRect().y} ${projection().layers.viewRect().width} ${projection().layers.viewRect().height}`}
          data-testid="viewport-svg"
          onWheel={host().onCanvasWheel}
          onPointerDown={host().onCanvasPointerDown}
          onContextMenu={(event) => event.preventDefault()}
        >
          <defs>
            <pattern id="checkerboard" patternUnits="userSpaceOnUse" width="96" height="96">
              <rect width="96" height="96" fill="#5c6070" opacity="0.38" />
              <rect width="48" height="48" fill="#d4d7df" opacity="0.23" />
              <rect x="48" y="48" width="48" height="48" fill="#d4d7df" opacity="0.23" />
            </pattern>
          </defs>
          <ViewportLayerProjection projection={projection()} placement="svg-viewport" />
          <g transform={host().viewportTransform()} data-testid="viewport-content">
            <ViewportLayerProjection projection={projection()} placement="svg-world" />
            <ViewportOverlayProjection projection={projection()} placement="svg-world" />
          </g>
        </svg>
        <ViewportOverlayProjection projection={projection()} placement="html" />
      </div>
    </main>
  );
}

function viewportProjection<TContext>(props: EditorViewportProps<TContext>): ViewportProjection<TContext> {
  if ('layers' in props) {
    return {
      kind: 'explicit',
      context: props.context,
      host: props.host,
      toolbarItems: props.toolbarItems ?? [],
      layerItems: props.layerItems ?? [],
      overlayItems: props.overlayItems ?? [],
      layers: props.layers,
      overlays: props.overlays
    };
  }

  const context = 'kernel' in props ? ({ kernel: props.kernel } satisfies EditorPanelContext) : props.context;

  return {
    kind: 'kernel',
    context,
    host: requiredViewportHost(context),
    toolbarItems: context.kernel.registries.viewportToolbars,
    layerItems: context.kernel.registries.viewportLayers,
    overlayItems: context.kernel.registries.viewportOverlays,
    layers: requiredViewportLayers(context),
    overlays: requiredViewportOverlays(context)
  };
}

function ViewportToolbarProjection<TContext>(props: { readonly projection: ViewportProjection<TContext> }) {
  if (props.projection.kind === 'kernel') {
    return <ViewportToolbar items={props.projection.toolbarItems} context={props.projection.context} />;
  }

  return <ViewportToolbar items={props.projection.toolbarItems} context={props.projection.context} />;
}

function ViewportLayerProjection<TContext>(props: {
  readonly projection: ViewportProjection<TContext>;
  readonly placement: 'svg-viewport' | 'svg-world';
}) {
  if (props.projection.kind === 'kernel') {
    return (
      <ViewportLayerStack
        items={props.projection.layerItems}
        context={props.projection.context}
        layers={props.projection.layers}
        placement={props.placement}
      />
    );
  }

  return (
    <ViewportLayerStack
      items={props.projection.layerItems}
      context={props.projection.context}
      layers={props.projection.layers}
      placement={props.placement}
    />
  );
}

function ViewportOverlayProjection<TContext>(props: {
  readonly projection: ViewportProjection<TContext>;
  readonly placement: 'svg-world' | 'html';
}) {
  if (props.projection.kind === 'kernel') {
    return (
      <ViewportOverlayLayer
        items={props.projection.overlayItems}
        context={props.projection.context}
        overlays={props.projection.overlays}
        placement={props.placement}
      />
    );
  }

  return (
    <ViewportOverlayLayer
      items={props.projection.overlayItems}
      context={props.projection.context}
      overlays={props.projection.overlays}
      placement={props.placement}
    />
  );
}

function requiredViewportLayers(context: EditorPanelContext): ViewportLayerService {
  if (!context.kernel.viewport.layers) {
    throw new Error('EditorViewport requires kernel.viewport.layers');
  }

  return context.kernel.viewport.layers;
}

function requiredViewportHost(context: EditorPanelContext): ViewportHostService {
  if (!context.kernel.viewport.host) {
    throw new Error('EditorViewport requires kernel.viewport.host');
  }

  return context.kernel.viewport.host;
}

function requiredViewportOverlays(context: EditorPanelContext): ViewportOverlayService {
  if (!context.kernel.viewport.overlays) {
    throw new Error('EditorViewport requires kernel.viewport.overlays');
  }

  return context.kernel.viewport.overlays;
}
