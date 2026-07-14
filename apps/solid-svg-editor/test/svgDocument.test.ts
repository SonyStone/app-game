import { describe, expect, it } from 'vitest';

import { createSvgCapabilityRegistry } from '../src/editor/capabilities';
import type { SvgCapabilityContribution } from '../src/editor/kernel';
import { createSvgDocument, indexSvgResources, parseSvgDocument } from '../src/editor/svg-document';
import { coreSvgCapabilityContribution } from '../src/editor/svg-capabilities/coreSvgContribution';
import { createElementNode } from '../src/svg-model';

describe('SvgDocument resource index', () => {
  it('indexes reusable resources and references by target id', () => {
    const parsed = parseSvgDocument(`
      <svg viewBox="0 0 10 10">
        <defs>
          <linearGradient id="paint">
            <stop offset="0" stop-color="red" />
          </linearGradient>
          <symbol id="shape">
            <circle cx="5" cy="5" r="4" />
          </symbol>
        </defs>
        <rect id="target" fill="url(#paint)" clip-path="url('#shape')" />
        <use href="#shape" />
      </svg>
    `);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      return;
    }

    expect(parsed.document.resources.byId.get('paint')).toMatchObject({
      id: 'paint',
      elementName: 'linearGradient',
      kind: 'paint-server'
    });
    expect(parsed.document.resources.byId.get('shape')).toMatchObject({
      id: 'shape',
      elementName: 'symbol',
      kind: 'symbol'
    });
    expect(parsed.document.resources.references.map((reference) => reference.targetId)).toEqual([
      'paint',
      'shape',
      'shape'
    ]);
  });

  it('indexes custom resource metadata from SVG capability contributions', () => {
    const customContribution = {
      id: 'test.resources',
      elements: [
        {
          name: 'swatch',
          defaults: {},
          attributes: ['id'],
          resourceKind: 'test-swatch'
        },
        {
          name: 'painted',
          defaults: {},
          attributes: ['data-ref']
        }
      ],
      attributes: [
        {
          name: 'data-ref',
          defaultValue: '',
          resourceReferenceKind: 'test-swatch'
        }
      ]
    } satisfies Parameters<typeof createSvgCapabilityRegistry>[0][number];
    const capabilities = createSvgCapabilityRegistry([coreSvgCapabilityContribution, customContribution]);
    const swatch = createElementNode('swatch', [{ name: 'id', value: 'brand-pattern' }]);
    const painted = createElementNode('painted', [{ name: 'data-ref', value: 'url(#brand-pattern)' }]);
    const root = createElementNode('svg', [], [swatch, painted]);
    const resources = indexSvgResources(root, capabilities);

    expect(resources.byId.get('brand-pattern')).toMatchObject({
      id: 'brand-pattern',
      elementName: 'swatch',
      kind: 'test-swatch'
    });
    expect(resources.references).toEqual([
      {
        nodeId: painted.id,
        attributeName: 'data-ref',
        targetId: 'brand-pattern',
        kind: 'test-swatch'
      }
    ]);
  });

  it('queries resource references and inherited presentation attributes through the resource graph', () => {
    const paint = createElementNode('linearGradient', [{ name: 'id', value: 'paint' }]);
    const rect = createElementNode('rect', [
      { name: 'id', value: 'target' },
      { name: 'fill', value: 'url(#paint)' }
    ]);
    const group = createElementNode(
      'g',
      [
        { name: 'stroke', value: 'red' },
        { name: 'stroke-width', value: '3' }
      ],
      [rect]
    );
    const root = createElementNode('svg', [{ name: 'color', value: '#333333' }], [paint, group]);
    const document = createSvgDocument(root);
    const rectReferences = document.resourceGraph.referencesFromNode(rect.id);

    expect(rectReferences).toEqual([
      expect.objectContaining({
        nodeId: rect.id,
        attributeName: 'fill',
        targetId: 'paint',
        kind: 'paint-server'
      })
    ]);
    expect(document.resourceGraph.referencesToResource('paint')).toEqual(rectReferences);
    expect(document.resourceGraph.resolveReference(rectReferences[0]).resource).toMatchObject({
      id: 'paint',
      nodeId: paint.id,
      kind: 'paint-server'
    });
    expect(document.resourceGraph.resolveResourceNode('paint')?.id).toBe(paint.id);
    expect(document.resourceGraph.inheritedAttribute(rect.id, 'fill')).toEqual({
      name: 'fill',
      value: 'url(#paint)',
      sourceNodeId: rect.id,
      inherited: false
    });
    expect(document.resourceGraph.inheritedAttribute(rect.id, 'stroke')).toEqual({
      name: 'stroke',
      value: 'red',
      sourceNodeId: group.id,
      inherited: true
    });
    expect(document.resourceGraph.inheritedAttributes(rect.id, ['stroke-width', 'color'])).toEqual([
      {
        name: 'stroke-width',
        value: '3',
        sourceNodeId: group.id,
        inherited: true
      },
      {
        name: 'color',
        value: '#333333',
        sourceNodeId: root.id,
        inherited: true
      }
    ]);
    expect(document.resourceGraph.inheritedAttribute(rect.id, 'transform')).toBeUndefined();
  });

  it('queries custom inherited attributes from SVG capability contributions', () => {
    const customContribution = {
      id: 'test.resources.inheritance',
      elements: [
        {
          name: 'badge',
          defaults: {},
          attributes: ['data-tone']
        }
      ],
      attributes: [
        {
          name: 'data-tone',
          defaultValue: 'neutral',
          inherits: true
        }
      ]
    } satisfies SvgCapabilityContribution;
    const capabilities = createSvgCapabilityRegistry([coreSvgCapabilityContribution, customContribution]);
    const badge = createElementNode('badge');
    const group = createElementNode('g', [{ name: 'data-tone', value: 'loud' }], [badge]);
    const root = createElementNode('svg', [], [group]);
    const document = createSvgDocument(root, capabilities);

    expect(document.resourceGraph.inheritedAttribute(badge.id, 'data-tone')).toEqual({
      name: 'data-tone',
      value: 'loud',
      sourceNodeId: group.id,
      inherited: true
    });
  });

  it('reports structural and resource diagnostics for imported SVG documents', () => {
    const parsed = parseSvgDocument(`
      <svg viewBox="0 0 10 10">
        <rect id="dup" bogus="1" fill="url(#missing)">
          <circle id="dup" />
        </rect>
        <unknown-shape id="custom" />
      </svg>
    `);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      return;
    }

    expect(parsed.document.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'unknown-attribute',
          severity: 'warning',
          elementName: 'rect',
          attributeName: 'bogus'
        }),
        expect.objectContaining({
          kind: 'invalid-child',
          severity: 'error',
          parentName: 'rect',
          childName: 'circle'
        }),
        expect.objectContaining({
          kind: 'duplicate-id',
          severity: 'error',
          duplicateId: 'dup'
        }),
        expect.objectContaining({
          kind: 'broken-resource-reference',
          severity: 'error',
          attributeName: 'fill',
          targetId: 'missing',
          referenceKind: 'paint-server'
        }),
        expect.objectContaining({
          kind: 'unsupported-element',
          severity: 'warning',
          elementName: 'unknown-shape'
        })
      ])
    );
    expect(parsed.document.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'unknown-attribute',
          attributeName: 'id'
        })
      ])
    );
  });

  it('accepts imported text elements through the core text capability group', () => {
    const parsed = parseSvgDocument(`
      <svg viewBox="0 0 200 80">
        <text x="10" y="40" font-size="24" font-weight="bold" text-anchor="middle">
          Hello
          <tspan dx="4" font-style="italic">SVG</tspan>
        </text>
      </svg>
    `);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      return;
    }

    expect(parsed.document.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'unsupported-element',
          elementName: expect.stringMatching(/^(text|tspan)$/)
        }),
        expect.objectContaining({
          kind: 'unknown-attribute',
          attributeName: expect.stringMatching(/^(font-size|font-weight|text-anchor|dx|font-style)$/)
        })
      ])
    );
    expect(parsed.document.diagnostics).toEqual([]);
  });

  it('runs validators supplied by SVG capability contributions', () => {
    const customContribution = {
      id: 'test.validators',
      elements: [
        {
          name: 'badge',
          defaults: {},
          attributes: ['data-tone'],
          validate: (node) => [
            {
              kind: 'contribution.test.badge-tone',
              severity: 'warning',
              nodeId: node.id,
              message: 'Badge needs a tone before export.'
            }
          ]
        }
      ],
      attributes: [
        {
          name: 'data-tone',
          defaultValue: ''
        }
      ]
    } satisfies SvgCapabilityContribution;
    const capabilities = createSvgCapabilityRegistry([coreSvgCapabilityContribution, customContribution]);
    const badge = createElementNode('badge');
    const root = createElementNode('svg', [], [badge]);
    const document = createSvgDocument(root, capabilities);

    expect(document.diagnostics).toEqual([
      {
        kind: 'contribution.test.badge-tone',
        severity: 'warning',
        nodeId: badge.id,
        message: 'Badge needs a tone before export.'
      }
    ]);
  });
});
