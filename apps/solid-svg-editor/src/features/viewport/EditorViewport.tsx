import { For, Show } from 'solid-js';
import type { Setter } from 'solid-js';

import type {
  AppSettings,
  DragSelectionMode,
  HandleDescriptor,
  TransformBoxHandleDescriptor,
  ViewRect
} from '../../editor/types';
import type { Rect } from '../../editor/geometry';
import type { SvgElementNode } from '../../svg-model';
import { GridLayer, HandlesLayer, SvgNodeView, TransformBoxLayer, ViewportToolbar } from './ViewportParts';
import type { SvgSize } from './viewport-math';

export function EditorViewport(props: {
  readonly settings: AppSettings;
  readonly setSettings: Setter<AppSettings>;
  readonly zoom: number;
  readonly zoomBy: (factor: number, origin?: { readonly x: number; readonly y: number }) => void;
  readonly centerFrame: () => void;
  readonly isFullscreen: boolean;
  readonly toggleFullscreen: () => void;
  readonly openReferenceDialog: () => void;
  readonly referenceImage: string | undefined;
  readonly showReference: boolean;
  readonly setShowReference: (show: boolean) => void;
  readonly overlayReference: boolean;
  readonly setOverlayReference: (overlay: boolean) => void;
  readonly clearReference: () => void;
  readonly setDragSelectionMode: (mode: DragSelectionMode) => void;
  readonly setCanvasSvg: (element: SVGSVGElement) => void;
  readonly viewRect: ViewRect;
  readonly viewportTransform: string;
  readonly gridViewRect: ViewRect;
  readonly rootSize: SvgSize;
  readonly root: SvgElementNode;
  readonly selectedIds: readonly string[];
  readonly viewportIsMoving: boolean;
  readonly useRasterPreview: boolean;
  readonly rasterPreviewUrl: string | undefined;
  readonly rasterPreviewRect: ViewRect;
  readonly handles: readonly HandleDescriptor[];
  readonly selectionBox: Rect | undefined;
  readonly marqueeRect: Rect | undefined;
  readonly onCanvasWheel: (event: WheelEvent) => void;
  readonly onCanvasPointerDown: (event: PointerEvent) => void;
  readonly onNodePointerDown: (id: string, event: PointerEvent) => void;
  readonly openContextMenu: (event: MouseEvent, nodeId: string) => void;
  readonly startHandleDrag: (event: PointerEvent, handle: HandleDescriptor) => void;
  readonly startTransformBoxDrag: (event: PointerEvent, handle: TransformBoxHandleDescriptor) => void;
}) {
  return (
    <main
      class="viewport-column grid min-h-0 min-w-0 grid-rows-[35px_minmax(0,1fr)] py-1.5 pr-1.5 pl-0"
      data-testid="viewport-column"
    >
      <ViewportToolbar
        settings={props.settings}
        setSettings={props.setSettings}
        zoom={props.zoom}
        zoomBy={props.zoomBy}
        centerFrame={props.centerFrame}
        isFullscreen={props.isFullscreen}
        toggleFullscreen={props.toggleFullscreen}
        openReferenceDialog={props.openReferenceDialog}
        hasReference={Boolean(props.referenceImage)}
        showReference={props.showReference}
        setShowReference={props.setShowReference}
        overlayReference={props.overlayReference}
        setOverlayReference={props.setOverlayReference}
        dragSelectionMode={props.settings.dragSelectionMode}
        setDragSelectionMode={props.setDragSelectionMode}
        clearReference={props.clearReference}
      />
      <div
        class="viewport-shell relative min-h-0 min-w-0 overflow-hidden rounded-md border-2 border-[#2b324c] bg-[var(--canvas)]"
        data-testid="viewport-shell"
      >
        <svg
          ref={props.setCanvasSvg}
          class="viewport-svg block h-full w-full touch-none select-none"
          viewBox={`${props.viewRect.x} ${props.viewRect.y} ${props.viewRect.width} ${props.viewRect.height}`}
          data-testid="viewport-svg"
          onWheel={props.onCanvasWheel}
          onPointerDown={props.onCanvasPointerDown}
          onContextMenu={(event) => event.preventDefault()}
        >
          <defs>
            <pattern id="checkerboard" patternUnits="userSpaceOnUse" width="96" height="96">
              <rect width="96" height="96" fill="#5c6070" opacity="0.38" />
              <rect width="48" height="48" fill="#d4d7df" opacity="0.23" />
              <rect x="48" y="48" width="48" height="48" fill="#d4d7df" opacity="0.23" />
            </pattern>
          </defs>
          <rect
            x={props.viewRect.x}
            y={props.viewRect.y}
            width={props.viewRect.width}
            height={props.viewRect.height}
            fill="var(--canvas)"
            data-testid="viewport-background"
          />
          <g transform={props.viewportTransform} data-testid="viewport-content">
            <Show when={props.settings.showGrid}>
              <GridLayer
                viewRect={props.gridViewRect}
                zoom={props.zoom}
                color={props.settings.gridColor}
                moving={props.viewportIsMoving}
              />
            </Show>
            <rect
              x={props.rootSize.viewBox[0]}
              y={props.rootSize.viewBox[1]}
              width={props.rootSize.viewBox[2]}
              height={props.rootSize.viewBox[3]}
              fill="url(#checkerboard)"
              stroke="#7d8596"
              stroke-width={1 / Math.max(props.zoom, 0.001)}
              data-testid="viewport-page"
            />
            <Show when={props.referenceImage && props.showReference && !props.overlayReference}>
              <image
                href={props.referenceImage}
                x={props.rootSize.viewBox[0]}
                y={props.rootSize.viewBox[1]}
                width={props.rootSize.viewBox[2]}
                height={props.rootSize.viewBox[3]}
                opacity="0.62"
                preserveAspectRatio="xMidYMid meet"
                data-testid="reference-image-underlay"
              />
            </Show>
            <Show
              when={props.useRasterPreview ? props.rasterPreviewUrl : undefined}
              fallback={
                <g classList={{ rasterized: props.settings.viewRasterized }} data-testid="viewport-vector-layer">
                  <For each={props.root.children}>
                    {(node) => (
                      <SvgNodeView
                        node={node}
                        selectedIds={props.selectedIds}
                        onNodePointerDown={props.onNodePointerDown}
                        openContextMenu={props.openContextMenu}
                      />
                    )}
                  </For>
                </g>
              }
            >
              {(href) => (
                <image
                  class="viewport-raster-preview pointer-events-none [image-rendering:auto]"
                  href={href()}
                  x={props.rasterPreviewRect.x}
                  y={props.rasterPreviewRect.y}
                  width={props.rasterPreviewRect.width}
                  height={props.rasterPreviewRect.height}
                  preserveAspectRatio="xMidYMid meet"
                  data-testid="viewport-raster-preview"
                />
              )}
            </Show>
            <Show when={props.referenceImage && props.showReference && props.overlayReference}>
              <image
                href={props.referenceImage}
                x={props.rootSize.viewBox[0]}
                y={props.rootSize.viewBox[1]}
                width={props.rootSize.viewBox[2]}
                height={props.rootSize.viewBox[3]}
                opacity="0.46"
                preserveAspectRatio="xMidYMid meet"
                data-testid="reference-image-overlay"
              />
            </Show>
            <Show when={props.settings.showHandles}>
              <HandlesLayer handles={props.handles} zoom={props.zoom} onHandlePointerDown={props.startHandleDrag} />
              <TransformBoxLayer
                box={props.selectionBox}
                zoom={props.zoom}
                onHandlePointerDown={props.startTransformBoxDrag}
              />
            </Show>
          </g>
        </svg>
        <Show when={props.marqueeRect}>
          {(rect) => (
            <div
              class="selection-marquee pointer-events-none absolute z-4 border border-[color-mix(in_srgb,var(--accent)_82%,#ffffff)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] shadow-[0_0_0_1px_#0008]"
              style={{
                left: `${rect().x}px`,
                top: `${rect().y}px`,
                width: `${rect().width}px`,
                height: `${rect().height}px`
              }}
              data-testid="selection-marquee"
            />
          )}
        </Show>
      </div>
    </main>
  );
}
