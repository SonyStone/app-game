import { describe, expect, it } from 'vitest';

import { createSvgCapabilityRegistry } from '../src/editor/capabilities';
import { coreSvgCapabilityContribution } from '../src/editor/svg-capabilities/coreSvgContribution';
import { createSvgDocument } from '../src/editor/svg-document';
import { createSvgSpatialIndex } from '../src/editor/svg-spatial-index';
import { createElementNode, getAttribute, parseLength } from '../src/svg-model';

describe('createSvgSpatialIndex', () => {
  it('indexes model-space bounds for core shape elements', () => {
    const rect = createElementNode('rect', [
      { name: 'x', value: '10' },
      { name: 'y', value: '20' },
      { name: 'width', value: '30' },
      { name: 'height', value: '40' }
    ]);
    const circle = createElementNode('circle', [
      { name: 'cx', value: '100' },
      { name: 'cy', value: '90' },
      { name: 'r', value: '10' }
    ]);
    const root = createElementNode('svg', [], [rect, circle]);
    const index = createSvgSpatialIndex(root);

    expect(index.entries.map((entry) => entry.nodeId)).toEqual([rect.id, circle.id]);
    expect(index.boundsForNode(rect.id)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(index.boundsForNode(circle.id)).toEqual({ x: 90, y: 80, width: 20, height: 20 });
  });

  it('applies inherited SVG transforms when computing bounds', () => {
    const rect = createElementNode(
      'rect',
      [
        { name: 'x', value: '1' },
        { name: 'y', value: '2' },
        { name: 'width', value: '3' },
        { name: 'height', value: '4' },
        { name: 'transform', value: 'scale(2)' }
      ]
    );
    const group = createElementNode('g', [{ name: 'transform', value: 'translate(10 20)' }], [rect]);
    const root = createElementNode('svg', [], [group]);
    const index = createSvgSpatialIndex(root);

    expect(index.boundsForNode(rect.id)).toEqual({ x: 12, y: 24, width: 6, height: 8 });
  });

  it('indexes path and points-based element bounds without including the origin as an implicit point', () => {
    const path = createElementNode('path', [
      { name: 'd', value: 'M 10 10 L 20 30 c 5 0 10 10 15 5' }
    ]);
    const polygon = createElementNode('polygon', [{ name: 'points', value: '50 50 70 80 30 70' }]);
    const root = createElementNode('svg', [], [path, polygon]);
    const index = createSvgSpatialIndex(root);

    expect(index.boundsForNode(path.id)).toEqual({ x: 10, y: 10, width: 25, height: 30 });
    expect(index.boundsForNode(polygon.id)).toEqual({ x: 30, y: 50, width: 40, height: 30 });
  });

  it('queries entries by rectangle and point with document-order hit precedence', () => {
    const bottom = createElementNode('rect', [
      { name: 'x', value: '0' },
      { name: 'y', value: '0' },
      { name: 'width', value: '100' },
      { name: 'height', value: '100' }
    ]);
    const top = createElementNode('rect', [
      { name: 'x', value: '50' },
      { name: 'y', value: '50' },
      { name: 'width', value: '20' },
      { name: 'height', value: '20' }
    ]);
    const root = createElementNode('svg', [], [bottom, top]);
    const index = createSvgSpatialIndex(root);

    expect(index.nodesInRect({ x: 45, y: 45, width: 10, height: 10 }).map((entry) => entry.nodeId)).toEqual([
      bottom.id,
      top.id
    ]);
    expect(index.nodesInRect({ x: 45, y: 45, width: 10, height: 10 }, 'contain').map((entry) => entry.nodeId)).toEqual([]);
    expect(index.hitTestPoint({ x: 55, y: 55 })?.nodeId).toBe(top.id);
  });

  it('attaches the spatial index to SVG documents', () => {
    const rect = createElementNode('rect', [
      { name: 'x', value: '4' },
      { name: 'y', value: '8' },
      { name: 'width', value: '16' },
      { name: 'height', value: '24' }
    ]);
    const document = createSvgDocument(createElementNode('svg', [], [rect]));

    expect(document.spatialIndex.boundsForNode(rect.id)).toEqual({ x: 4, y: 8, width: 16, height: 24 });
  });

  it('indexes bounds supplied by custom SVG capability contributions', () => {
    const badge = createElementNode('badge', [
      { name: 'data-x', value: '12' },
      { name: 'data-y', value: '20' },
      { name: 'data-width', value: '32' },
      { name: 'data-height', value: '16' }
    ]);
    const root = createElementNode('svg', [], [badge]);
    const capabilities = createSvgCapabilityRegistry([
      coreSvgCapabilityContribution,
      {
        id: 'test.svg.bounds',
        elements: [
          {
            name: 'badge',
            defaults: {},
            attributes: ['data-x', 'data-y', 'data-width', 'data-height'],
            getBounds: ({ node }) => ({
              x: parseLength(getAttribute(node, 'data-x', true)),
              y: parseLength(getAttribute(node, 'data-y', true)),
              width: parseLength(getAttribute(node, 'data-width', true)),
              height: parseLength(getAttribute(node, 'data-height', true))
            })
          }
        ]
      }
    ]);
    const index = createSvgSpatialIndex(root, capabilities);
    const document = createSvgDocument(root, capabilities);

    expect(index.boundsForNode(badge.id)).toEqual({ x: 12, y: 20, width: 32, height: 16 });
    expect(document.spatialIndex.boundsForNode(badge.id)).toEqual({ x: 12, y: 20, width: 32, height: 16 });
  });
});
