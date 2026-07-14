import { render } from 'solid-js/web';
import { describe, expect, it } from 'vitest';

import { svgCapabilities } from '../src/editor/capabilities';
import { defaultSettings } from '../src/editor/defaults';
import type {
  ViewportHostService,
  ViewportLayerContribution,
  ViewportLayerService,
  ViewportOverlayService
} from '../src/editor/kernel';
import type { EditorAppContribution } from '../src/features/shell/editorAppContributions';
import { createEditorAppRegistries } from '../src/features/shell/editorAppContributions';
import { EditorViewport } from '../src/features/viewport/EditorViewport';
import { SvgNodeView } from '../src/features/viewport/ViewportParts';
import { createSvgNodeRendererFromContributions } from '../src/features/viewport/svg-renderer';
import { nodeSelectionTarget, type SelectionTarget } from '../src/editor/selection-targets';
import { createElementNode } from '../src/svg-model';

interface TestLayerContext {
  readonly label: string;
}

describe('SVG renderer contributions', () => {
  it('renders capability-created text elements with child text nodes', () => {
    const text = svgCapabilities.createElement('text');
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () => (
        <svg>
          <SvgNodeView
            node={text}
            selectedIds={[]}
            selectedTargets={[]}
            onNodePointerDown={() => undefined}
            onSelectionTargetPointerDown={() => undefined}
            openContextMenu={() => undefined}
            openSelectionTargetContextMenu={() => undefined}
          />
        </svg>
      ),
      container
    );
    const renderedText = container.querySelector('text');

    expect(renderedText).toBeInstanceOf(SVGElement);
    expect(renderedText?.textContent).toBe('Text');
    expect(renderedText?.getAttribute('font-size')).toBe('48');

    dispose();
    container.remove();
  });

  it('renders viewport SVG nodes through an app-installed renderer contribution', () => {
    const rect = createElementNode('rect');
    const root = createElementNode('svg', [], [rect]);
    const selectedTargets = [nodeSelectionTarget(rect.id)];
    const extension = {
      id: 'test.renderers',
      renderers: [
        {
          id: 'test.svg-node-renderer',
          label: 'Test SVG node renderer',
          createSvgNodeRenderer: () => ({
            renderNode: (props) => (
              <g
                data-node-id={props.node.id}
                data-selected-target-count={props.selectedTargets.length}
                data-testid={`custom-rendered-node-${props.node.id}`}
              />
            )
          })
        }
      ]
    } satisfies EditorAppContribution;
    const nodeRenderer = createSvgNodeRendererFromContributions(createEditorAppRegistries([extension]).renderers);
    const layerItems = [
      {
        id: 'test.document-layer',
        placement: 'svg-world',
        render: ({ layers }) => {
          const renderer = layers.nodeRenderer();

          return (
            <g data-testid="test-document-layer">
              {layers.root().children.map((node) => (
                <SvgNodeView
                  node={node}
                  selectedIds={layers.selectedIds()}
                  selectedTargets={layers.selectedTargets()}
                  onNodePointerDown={layers.onNodePointerDown}
                  onSelectionTargetPointerDown={layers.onSelectionTargetPointerDown}
                  openContextMenu={layers.openContextMenu}
                  openSelectionTargetContextMenu={layers.openSelectionTargetContextMenu}
                  {...(renderer ? { renderer } : {})}
                />
              ))}
            </g>
          );
        }
      }
    ] satisfies readonly ViewportLayerContribution<TestLayerContext>[];
    const layers = createTestLayerService(root, nodeRenderer, selectedTargets);
    const overlays = createTestOverlayService();
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () => (
        <EditorViewport
          context={{ label: 'test' }}
          layerItems={layerItems}
          host={createTestHostService()}
          layers={layers}
          overlays={overlays}
        />
      ),
      container
    );

    const renderedNode = container.querySelector(`[data-testid="custom-rendered-node-${rect.id}"]`);

    expect(renderedNode).toBeInstanceOf(SVGElement);
    expect(renderedNode?.getAttribute('data-selected-target-count')).toBe('1');

    dispose();
    container.remove();
  });

  it('routes default SVG node pointer down through typed selection targets', () => {
    const rect = createElementNode('rect');
    let selectedTarget: SelectionTarget | undefined;
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () => (
        <svg>
          <SvgNodeView
            node={rect}
            selectedIds={[]}
            selectedTargets={[]}
            onNodePointerDown={() => undefined}
            onSelectionTargetPointerDown={(target) => {
              selectedTarget = target;
            }}
            openContextMenu={() => undefined}
            openSelectionTargetContextMenu={() => undefined}
          />
        </svg>
      ),
      container
    );

    container
      .querySelector(`[data-testid="svg-node-${rect.id}"]`)
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));

    expect(selectedTarget).toEqual(nodeSelectionTarget(rect.id));

    dispose();
    container.remove();
  });

  it('routes default SVG node context menus through typed selection targets', () => {
    const rect = createElementNode('rect');
    let contextTarget: SelectionTarget | undefined;
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () => (
        <svg>
          <SvgNodeView
            node={rect}
            selectedIds={[]}
            selectedTargets={[]}
            onNodePointerDown={() => undefined}
            onSelectionTargetPointerDown={() => undefined}
            openContextMenu={() => undefined}
            openSelectionTargetContextMenu={(_event, target) => {
              contextTarget = target;
            }}
          />
        </svg>
      ),
      container
    );

    container
      .querySelector(`[data-testid="svg-node-${rect.id}"]`)
      ?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

    expect(contextTarget).toEqual(nodeSelectionTarget(rect.id));

    dispose();
    container.remove();
  });
});

function createTestLayerService(
  root: ReturnType<typeof createElementNode>,
  nodeRenderer: ViewportLayerService['nodeRenderer'] extends () => infer T ? T : never,
  selectedTargets: readonly SelectionTarget[] = []
): ViewportLayerService {
  return {
    settings: () => defaultSettings(),
    zoom: () => 1,
    viewRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    gridViewRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    rootSize: () => ({ width: 100, height: 100, viewBox: [0, 0, 100, 100] }),
    root: () => root,
    selectedIds: () => [],
    selectedTargets: () => selectedTargets,
    viewportIsMoving: () => false,
    referenceImage: () => undefined,
    showReference: () => false,
    overlayReference: () => false,
    useRasterPreview: () => false,
    rasterPreviewUrl: () => undefined,
    rasterPreviewRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    nodeRenderer: () => nodeRenderer,
    onNodePointerDown: () => undefined,
    onSelectionTargetPointerDown: () => undefined,
    openContextMenu: () => undefined,
    openSelectionTargetContextMenu: () => undefined
  };
}

function createTestHostService(): ViewportHostService {
  return {
    setViewportShell: () => undefined,
    setCanvasSvg: () => undefined,
    viewportTransform: () => 'translate(0 0) scale(1)',
    onCanvasWheel: () => undefined,
    onCanvasPointerDown: () => undefined
  };
}

function createTestOverlayService(): ViewportOverlayService {
  return {
    zoom: () => 1,
    handles: () => [],
    selectionBox: () => undefined,
    marqueeRect: () => undefined,
    startHandleDrag: () => undefined,
    startTransformBoxDrag: () => undefined
  };
}
