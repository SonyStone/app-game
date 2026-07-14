import { describe, expect, it } from 'vitest';

import type { Rect } from '../src/editor/geometry';
import type { RendererContribution } from '../src/editor/kernel';
import { nodeSelectionTarget } from '../src/editor/selection-targets';
import { createDomRendererAdapter, createViewportRendererFromContributions } from '../src/features/viewport/rendererAdapter';

describe('createDomRendererAdapter', () => {
  it('hit-tests marquee targets through the configured query root', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const contained = appendSvgElement(svg, 'rect', 'inside', clientRect({ left: 10, top: 10, right: 30, bottom: 30 }));
    const intersecting = appendSvgElement(svg, 'circle', 'edge', clientRect({ left: 35, top: 35, right: 60, bottom: 60 }));
    appendSvgElement(svg, 'g', 'group', clientRect({ left: 10, top: 10, right: 20, bottom: 20 }));
    appendSvgElement(svg, 'rect', 'zero', clientRect({ left: 4, top: 4, right: 4, bottom: 12 }));

    expect(contained.tagName.toLowerCase()).toBe('rect');
    expect(intersecting.tagName.toLowerCase()).toBe('circle');

    const adapter = createDomRendererAdapter({ queryRoot: svg });

    expect(adapter.hitTestMarqueeTargets({ x: 0, y: 0, width: 40, height: 40 }, 'contain')).toEqual([
      nodeSelectionTarget('inside')
    ]);
    expect(adapter.hitTestMarqueeTargets({ x: 0, y: 0, width: 40, height: 40 }, 'intersect')).toEqual([
      nodeSelectionTarget('inside'),
      nodeSelectionTarget('edge')
    ]);
  });

  it('measures selected rendered node rects as a world-space union', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    appendSvgElement(svg, 'rect', 'x2', clientRect({ left: 10, top: 20, right: 30, bottom: 50 }));
    appendSvgElement(svg, 'circle', 'x3', clientRect({ left: 40, top: 4, right: 60, bottom: 24 }));
    appendSvgElement(svg, 'path', 'unselected', clientRect({ left: 0, top: 0, right: 200, bottom: 200 }));

    const adapter = createDomRendererAdapter({ queryRoot: svg });
    const measured = adapter.measureSelectionBox({
      rootId: 'root',
      selectedIds: ['root', 'x2', 'x3'],
      selectedTargets: [],
      useRasterPreview: false,
      clientToSvgPoint: (clientX, clientY) => ({ x: clientX / 2, y: clientY / 2 })
    });

    expect(measured).toEqual({ x: 5, y: 2, width: 25, height: 23 });
  });

  it('measures selected rendered node rects from typed selection targets', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    appendSvgElement(svg, 'rect', 'x2', clientRect({ left: 10, top: 20, right: 30, bottom: 50 }));
    appendSvgElement(svg, 'circle', 'x3', clientRect({ left: 40, top: 4, right: 60, bottom: 24 }));

    const adapter = createDomRendererAdapter({ queryRoot: svg });
    const measured = adapter.measureSelectionBox({
      rootId: 'root',
      selectedIds: [],
      selectedTargets: [nodeSelectionTarget('x3')],
      useRasterPreview: false,
      clientToSvgPoint: (clientX, clientY) => ({ x: clientX, y: clientY })
    });

    expect(measured).toEqual({ x: 40, y: 4, width: 20, height: 20 });
  });

  it('skips selection-box measurement while raster preview is active', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    appendSvgElement(svg, 'rect', 'x2', clientRect({ left: 10, top: 20, right: 30, bottom: 50 }));

    const adapter = createDomRendererAdapter({ queryRoot: svg });

    expect(
      adapter.measureSelectionBox({
        rootId: 'root',
        selectedIds: ['x2'],
        selectedTargets: [],
        useRasterPreview: true,
        clientToSvgPoint: (clientX, clientY) => ({ x: clientX, y: clientY })
      })
    ).toBeUndefined();
  });

  it('resolves rendered node ids from nested event targets', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const group = appendSvgElement(svg, 'g', 'group', clientRect({ left: 0, top: 0, right: 10, bottom: 10 }));
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    group.append(path);

    const adapter = createDomRendererAdapter({ queryRoot: svg });

    expect(adapter.selectionTargetFromEventTarget(path)).toEqual(nodeSelectionTarget('group'));
    expect(adapter.selectionTargetFromEventTarget(document.createTextNode('text'))).toBeUndefined();
  });

  it('converts client rects into viewport overlay coordinates', () => {
    const viewport = document.createElement('div');
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      configurable: true,
      value: () => clientRect({ left: 100, top: 40, right: 700, bottom: 540 })
    });

    const adapter = createDomRendererAdapter({ viewportElement: viewport });

    expect(adapter.clientRectToViewportOverlay({ x: 125, y: 75, width: 20, height: 30 })).toEqual({
      x: 25,
      y: 35,
      width: 20,
      height: 30
    });
    expect(adapter.viewportClientRect()).toMatchObject({ left: 100, top: 40, width: 600, height: 500 });
  });

  it('layers viewport renderer contributions over the DOM baseline', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const target = appendSvgElement(svg, 'rect', 'dom-target', clientRect({ left: 10, top: 10, right: 20, bottom: 20 }));
    const base = createDomRendererAdapter({ queryRoot: svg });
    const first = {
      id: 'test.first-viewport-renderer',
      label: 'First viewport renderer',
      createViewportRenderer: (current) => ({
        ...current,
        hitTestMarqueeTargets: (rect, mode) => [...current.hitTestMarqueeTargets(rect, mode), nodeSelectionTarget('first')]
      })
    } satisfies RendererContribution;
    const second = {
      id: 'test.second-viewport-renderer',
      label: 'Second viewport renderer',
      createViewportRenderer: (current) => ({
        ...current,
        hitTestMarqueeTargets: (rect, mode) => [...current.hitTestMarqueeTargets(rect, mode), nodeSelectionTarget('second')]
      })
    } satisfies RendererContribution;
    const adapter = createViewportRendererFromContributions([first, second], base);

    expect(adapter.hitTestMarqueeTargets({ x: 0, y: 0, width: 30, height: 30 }, 'contain')).toEqual([
      nodeSelectionTarget('dom-target'),
      nodeSelectionTarget('first'),
      nodeSelectionTarget('second')
    ]);
    expect(adapter.selectionTargetFromEventTarget(target)).toEqual(nodeSelectionTarget('dom-target'));
  });

  it('layers typed event-target renderer overrides', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const target = document.createElement('button');
    const base = createDomRendererAdapter({ queryRoot: svg });
    const contribution = {
      id: 'test.typed-event-target-renderer',
      label: 'Typed event target renderer',
      createViewportRenderer: (current) => ({
        ...current,
        selectionTargetFromEventTarget: (eventTarget) =>
          eventTarget === target ? nodeSelectionTarget('extension-target') : current.selectionTargetFromEventTarget(eventTarget)
      })
    } satisfies RendererContribution;
    const adapter = createViewportRendererFromContributions([contribution], base);

    expect(adapter.selectionTargetFromEventTarget(target)).toEqual(nodeSelectionTarget('extension-target'));
  });
});

function appendSvgElement(
  root: SVGElement,
  tagName: string,
  nodeId: string,
  rect: DOMRectReadOnly
): SVGGraphicsElement {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tagName) as SVGGraphicsElement;
  element.setAttribute('data-node-id', nodeId);
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect
  });
  root.append(element);
  return element;
}

function clientRect(values: {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}): DOMRectReadOnly {
  const rect = {
    x: values.left,
    y: values.top,
    width: values.right - values.left,
    height: values.bottom - values.top,
    top: values.top,
    right: values.right,
    bottom: values.bottom,
    left: values.left,
    toJSON: () => values
  } satisfies DOMRectReadOnly;

  return rect;
}
