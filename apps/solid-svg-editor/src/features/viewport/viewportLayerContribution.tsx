import { For, Show } from 'solid-js';

import type { EditorContribution, ViewportLayerContribution, ViewportLayerService } from '../../editor/kernel';
import type { SvgNode } from '../../svg-model';
import type { EditorPanelContext } from '../panels/panelRegistry';
import { GridLayer, SvgNodeView } from './ViewportParts';

export type ViewportLayerRegistryContribution = EditorContribution<EditorPanelContext> & {
  readonly viewportLayers?: readonly ViewportLayerContribution<EditorPanelContext>[];
};

export const coreViewportLayerContribution = {
  id: 'core.viewport-layers',
  viewportLayers: [
    {
      id: 'viewport.background',
      placement: 'svg-viewport',
      order: 10,
      render: ({ layers }) => (
        <rect
          x={layers.viewRect().x}
          y={layers.viewRect().y}
          width={layers.viewRect().width}
          height={layers.viewRect().height}
          fill="var(--canvas)"
          data-testid="viewport-background"
        />
      )
    },
    {
      id: 'viewport.grid',
      placement: 'svg-world',
      order: 10,
      render: ({ layers }) => (
        <Show when={layers.settings().showGrid}>
          <GridLayer
            viewRect={layers.gridViewRect()}
            zoom={layers.zoom()}
            color={layers.settings().gridColor}
            moving={layers.viewportIsMoving()}
          />
        </Show>
      )
    },
    {
      id: 'viewport.page',
      placement: 'svg-world',
      order: 20,
      render: ({ layers }) => (
        <rect
          x={layers.rootSize().viewBox[0]}
          y={layers.rootSize().viewBox[1]}
          width={layers.rootSize().viewBox[2]}
          height={layers.rootSize().viewBox[3]}
          fill="url(#checkerboard)"
          stroke="#7d8596"
          stroke-width={1 / Math.max(layers.zoom(), 0.001)}
          data-testid="viewport-page"
        />
      )
    },
    {
      id: 'viewport.reference-underlay',
      placement: 'svg-world',
      order: 30,
      render: ({ layers }) => (
        <Show when={layers.referenceImage() && layers.showReference() && !layers.overlayReference()}>
          <image
            href={layers.referenceImage()}
            x={layers.rootSize().viewBox[0]}
            y={layers.rootSize().viewBox[1]}
            width={layers.rootSize().viewBox[2]}
            height={layers.rootSize().viewBox[3]}
            opacity="0.62"
            preserveAspectRatio="xMidYMid meet"
            data-testid="reference-image-underlay"
          />
        </Show>
      )
    },
    {
      id: 'viewport.document',
      placement: 'svg-world',
      order: 40,
      render: ({ layers }) => (
        <Show
          when={layers.useRasterPreview() ? layers.rasterPreviewUrl() : undefined}
          fallback={
            <g classList={{ rasterized: layers.settings().viewRasterized }} data-testid="viewport-vector-layer">
              <For each={layers.root().children}>
                {(node) => (
                  <ViewportDocumentNode node={node} layers={layers} />
                )}
              </For>
            </g>
          }
        >
          {(href) => (
            <image
              class="viewport-raster-preview pointer-events-none [image-rendering:auto]"
              href={href()}
              x={layers.rasterPreviewRect().x}
              y={layers.rasterPreviewRect().y}
              width={layers.rasterPreviewRect().width}
              height={layers.rasterPreviewRect().height}
              preserveAspectRatio="xMidYMid meet"
              data-testid="viewport-raster-preview"
            />
          )}
        </Show>
      )
    },
    {
      id: 'viewport.reference-overlay',
      placement: 'svg-world',
      order: 50,
      render: ({ layers }) => (
        <Show when={layers.referenceImage() && layers.showReference() && layers.overlayReference()}>
          <image
            href={layers.referenceImage()}
            x={layers.rootSize().viewBox[0]}
            y={layers.rootSize().viewBox[1]}
            width={layers.rootSize().viewBox[2]}
            height={layers.rootSize().viewBox[3]}
            opacity="0.46"
            preserveAspectRatio="xMidYMid meet"
            data-testid="reference-image-overlay"
          />
        </Show>
      )
    }
  ]
} as const satisfies ViewportLayerRegistryContribution;

function ViewportDocumentNode(props: {
  readonly node: SvgNode;
  readonly layers: ViewportLayerService;
}) {
  const renderer = props.layers.nodeRenderer();

  return (
    <SvgNodeView
      node={props.node}
      selectedIds={props.layers.selectedIds()}
      selectedTargets={props.layers.selectedTargets()}
      onNodePointerDown={props.layers.onNodePointerDown}
      onSelectionTargetPointerDown={props.layers.onSelectionTargetPointerDown}
      openContextMenu={props.layers.openContextMenu}
      openSelectionTargetContextMenu={props.layers.openSelectionTargetContextMenu}
      {...(renderer ? { renderer } : {})}
    />
  );
}
