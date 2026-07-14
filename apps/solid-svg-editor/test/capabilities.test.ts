import { describe, expect, it } from 'vitest';

import { createSvgCapabilityRegistry, svgCapabilities, type SvgCapabilityRegistry } from '../src/editor/capabilities';
import { createSetAttributesCommand } from '../src/editor/commands/attributeCommands';
import { isOperationBackedEditorCommand } from '../src/editor/operations';
import type { HandleDescriptor } from '../src/editor/types';
import type { SvgAttributeControlContext, SvgCapabilityContribution } from '../src/editor/kernel';
import {
  coreSvgCapabilityContribution,
  coreSvgCapabilityContributions,
  coreSvgShapeContribution
} from '../src/editor/svg-capabilities/coreSvgContribution';
import { createCoreInspectorControlContribution } from '../src/features/inspector/inspectorControlContribution';
import {
  appendChild,
  createDefaultElement,
  createDefaultRoot,
  createElementNode,
  findNode,
  getAttribute,
  setAttribute,
  type SvgElementNode
} from '../src/svg-model';

describe('SvgCapabilityRegistry', () => {
  it('publishes modular core SVG capability groups with a combined compatibility export', () => {
    expect(coreSvgCapabilityContributions.map((contribution) => contribution.id)).toEqual([
      'core.svg.structure',
      'core.svg.shapes',
      'core.svg.gradients',
      'core.svg.text',
      'core.svg.images',
      'core.svg.symbols',
      'core.svg.filters',
      'core.svg.masks',
      'core.svg.markers',
      'core.svg.patterns',
      'core.svg.presentation'
    ]);
    expect(coreSvgCapabilityContribution.elements ?? []).toEqual(
      coreSvgCapabilityContributions.flatMap((contribution) => contribution.elements ?? [])
    );
    expect(coreSvgCapabilityContribution.attributes ?? []).toEqual(
      coreSvgCapabilityContributions.flatMap((contribution) => contribution.attributes ?? [])
    );

    const groupedRegistry = createSvgCapabilityRegistry(coreSvgCapabilityContributions);

    expect(groupedRegistry.addableElements.map((element) => element.name)).toEqual(
      svgCapabilities.addableElements.map((element) => element.name)
    );
    expect(groupedRegistry.getElement('symbol')?.resourceKind).toBe('symbol');
    expect(groupedRegistry.getAttribute('marker-end').resourceReferenceKind).toBe('marker');
  });

  it('adapts the core SVG contribution into the compatibility registry', () => {
    const rect = svgCapabilities.getElement('rect');

    expect(rect).toMatchObject({
      name: 'rect',
      defaults: { width: '300', height: '220' }
    });
    expect(rect?.attributes).toContain('rx');
    expect(svgCapabilities.isValidChild('linearGradient', 'stop')).toBe(true);
    expect(svgCapabilities.isValidChild('linearGradient', 'rect')).toBe(false);
  });

  it('exposes attribute metadata for inspector controls', () => {
    expect(svgCapabilities.getAttribute('fill')).toMatchObject({
      name: 'fill',
      type: 'color',
      defaultValue: 'black',
      color: {
        allowNone: true,
        allowUrl: true,
        allowCurrentColor: true
      }
    });
    expect(svgCapabilities.getAttribute('stroke-linecap').enumValues).toEqual(['butt', 'round', 'square']);
  });

  it('keeps ad hoc capability registries isolated from core SVG metadata fallbacks', () => {
    const registry = createSvgCapabilityRegistry([]);

    expect(registry.elements).toEqual([]);
    expect(registry.getElement('rect')).toBeUndefined();
    expect(registry.getAttribute('fill')).toMatchObject({
      name: 'fill',
      type: 'unknown',
      defaultValue: '',
      enumValues: [],
      color: {
        allowNone: false,
        allowUrl: false,
        allowCurrentColor: false
      }
    });
    expect(registry.isAttributeRecognized('rect', 'x')).toBe(false);
    expect(registry.isCompactAttribute('rect', 'x')).toBe(false);
  });

  it('identifies compact attributes and specialist editor attributes', () => {
    expect(svgCapabilities.isCompactAttribute('path', 'stroke')).toBe(true);
    expect(svgCapabilities.isCompactAttribute('path', 'd')).toBe(false);
    expect(svgCapabilities.isCompactAttribute('polygon', 'points')).toBe(false);
    expect(svgCapabilities.isCompactAttribute('path', 'not-real')).toBe(false);
  });

  it('uses element handle providers from SVG contributions', () => {
    const baseRoot = createDefaultRoot();
    const root = appendChild(baseRoot, baseRoot.id, createDefaultElement('circle'));
    const circle = root.children[0];

    if (!circle || circle.kind !== 'element') {
      throw new Error('Expected circle element');
    }

    const handles = svgCapabilities.getHandles(root, [circle.id]);

    expect(handles.map((handle) => handle.id)).toEqual(['center', 'radius']);
  });

  it('publishes core shape handles as per-element SVG capability providers', () => {
    const providersByElement = new Map(
      (coreSvgShapeContribution.elements ?? []).map((element) => [element.name, element.createHandles])
    );

    expect([...providersByElement.entries()].map(([name, provider]) => [name, typeof provider])).toEqual([
      ['circle', 'function'],
      ['ellipse', 'function'],
      ['rect', 'function'],
      ['path', 'function'],
      ['line', 'function'],
      ['polyline', 'function'],
      ['polygon', 'function']
    ]);
  });

  it('exposes operation-backed commands from transformed core element handles', () => {
    const circle = createElementNode('circle', [
      { name: 'cx', value: '5' },
      { name: 'cy', value: '6' },
      { name: 'r', value: '2' }
    ]);
    const group = createElementNode('g', [{ name: 'transform', value: 'translate(10 20)' }], [circle]);
    const root = createElementNode('svg', [], [group]);
    const center = requireHandle(svgCapabilities.getHandles(root, [circle.id]), 'center');
    const command = center.createCommand?.(25, 46);

    expect(center.commandMode).toBe('command');
    expect('update' in center).toBe(false);
    expect({ x: center.x, y: center.y }).toEqual({ x: 15, y: 26 });
    expect(command && isOperationBackedEditorCommand(command)).toBe(true);
    expect(command && isOperationBackedEditorCommand(command) ? command.resolveOperations(root) : []).toEqual([
      { kind: 'svg.set-attribute', nodeId: circle.id, name: 'cx', value: '15' },
      { kind: 'svg.set-attribute', nodeId: circle.id, name: 'cy', value: '26' }
    ]);

    const changedCircle = requireElement(command?.apply(root), circle.id);

    expect(getAttribute(changedCircle, 'cx', true)).toBe('15');
    expect(getAttribute(changedCircle, 'cy', true)).toBe('26');
  });

  it('accepts custom SVG capability contributions without changing the registry API', () => {
    const customContribution = {
      id: 'test.svg',
      elements: [
        {
          name: 'badge',
          defaults: { width: '24', height: '12' },
          allowedChildren: [],
          attributes: ['data-tone'],
          createHandles: ({ node }) => [
            {
              id: 'badge-origin',
              nodeId: node.id,
              x: 1,
              y: 2,
              label: 'badge origin',
              small: false,
              update: (root: SvgElementNode, x: number, y: number) => setAttribute(root, 'data-moved', `${x},${y}`)
            }
          ]
        }
      ],
      attributes: [
        {
          name: 'data-tone',
          type: 'enum',
          defaultValue: 'neutral',
          enumValues: ['neutral', 'loud']
        }
      ]
    } satisfies SvgCapabilityContribution;

    const registry = createSvgCapabilityRegistry([coreSvgCapabilityContribution, customContribution]);
    const badge = createElementNode('badge');
    const baseRoot = createDefaultRoot();
    const root = appendChild(baseRoot, baseRoot.id, badge);

    expect(registry.getElement('badge')).toMatchObject({
      name: 'badge',
      defaults: { width: '24', height: '12' },
      attributes: ['data-tone'],
      addable: false
    });
    expect(registry.getAttribute('data-tone')).toMatchObject({
      name: 'data-tone',
      type: 'enum',
      defaultValue: 'neutral',
      enumValues: ['neutral', 'loud']
    });
    expect(registry.isAttributeRecognized('badge', 'data-tone')).toBe(true);
    expect(registry.isCompactAttribute('badge', 'data-tone')).toBe(true);
    expect(registry.isValidChild('svg', 'badge')).toBe(true);
    expect(registry.isValidChild('rect', 'badge')).toBe(false);
    expect(registry.isValidChild('badge', 'circle')).toBe(false);
    expect(registry.getHandles(root, [badge.id]).map((handle) => handle.id)).toEqual(['badge-origin']);
  });

  it('uses the last element contribution as the active extension override', () => {
    const customContribution = {
      id: 'test.svg.override',
      elements: [
        {
          name: 'rect',
          defaults: { width: '10', height: '20' },
          attributes: ['width', 'height'],
          addable: true,
          addableOrder: -1
        }
      ]
    } satisfies SvgCapabilityContribution;

    const registry = createSvgCapabilityRegistry([coreSvgCapabilityContribution, customContribution]);

    expect(registry.elements.filter((element) => element.name === 'rect')).toHaveLength(1);
    expect(registry.getElement('rect')).toMatchObject({
      name: 'rect',
      defaults: { width: '10', height: '20' },
      attributes: ['width', 'height'],
      addable: true,
      addableOrder: -1
    });
    expect(registry.createElement('rect').attrs).toEqual([
      { name: 'width', value: '10' },
      { name: 'height', value: '20' }
    ]);
    expect(registry.addableElements[0]?.name).toBe('rect');

    const overriddenRect = registry.createElement('rect');
    const root = createElementNode('svg', [], [overriddenRect]);

    expect(registry.getHandles(root, [overriddenRect.id])).toEqual([]);
  });

  it('accepts command-backed handles from custom SVG capability contributions', () => {
    const customContribution = {
      id: 'test.svg.command-handle',
      elements: [
        {
          name: 'badge',
          defaults: {},
          attributes: ['data-x', 'data-y'],
          createHandles: ({ node }) => [
            {
              id: 'badge-origin',
              nodeId: node.id,
              x: 1,
              y: 2,
              label: 'badge origin',
              small: false,
              commandMode: 'command',
              createCommand: (x, y) =>
                createSetAttributesCommand(
                  node.id,
                  [
                    { name: 'data-x', value: String(x) },
                    { name: 'data-y', value: String(y) }
                  ],
                  'Move badge'
                )
            }
          ]
        }
      ]
    } satisfies SvgCapabilityContribution;

    const registry = createSvgCapabilityRegistry([coreSvgCapabilityContribution, customContribution]);
    const badge = createElementNode('badge');
    const root = createElementNode('svg', [], [badge]);
    const handle = requireHandle(registry.getHandles(root, [badge.id]), 'badge-origin');

    expect(handle.commandMode).toBe('command');

    if (handle.commandMode !== 'command') {
      throw new Error('Expected command-backed handle');
    }

    const command = handle.createCommand(12, 24);
    const changedBadge = requireElement(command.apply(root), badge.id);

    expect(isOperationBackedEditorCommand(command)).toBe(true);
    expect(command.resolveOperations(root)).toEqual([
      { kind: 'svg.set-attribute', nodeId: badge.id, name: 'data-x', value: '12' },
      { kind: 'svg.set-attribute', nodeId: badge.id, name: 'data-y', value: '24' }
    ]);
    expect(getAttribute(changedBadge, 'data-x', true)).toBe('12');
    expect(getAttribute(changedBadge, 'data-y', true)).toBe('24');
  });

  it('creates elements and add menus from capability contributions', () => {
    const customContribution = {
      id: 'test.svg.addable',
      elements: [
        {
          name: 'stamp',
          defaults: { width: '32', height: '16' },
          attributes: ['width', 'height'],
          addable: true
        }
      ]
    } satisfies SvgCapabilityContribution;

    const registry = createSvgCapabilityRegistry([coreSvgCapabilityContribution, customContribution]);
    const stamp = registry.createElement('stamp');

    expect(stamp.name).toBe('stamp');
    expect(stamp.attrs).toEqual([
      { name: 'width', value: '32' },
      { name: 'height', value: '16' }
    ]);
    expect(registry.addableElements.map((element) => element.name)).toContain('stamp');
    expect(svgCapabilities.addableElements.map((element) => element.name)).toEqual([
      'path',
      'circle',
      'ellipse',
      'rect',
      'line',
      'polygon',
      'polyline',
      'g',
      'text',
      'linearGradient',
      'radialGradient',
      'stop'
    ]);
  });

  it('creates default text elements from a capability-owned node factory', () => {
    const text = svgCapabilities.createElement('text');
    const textChild = text.children[0];

    expect(svgCapabilities.getElement('text')).toMatchObject({
      name: 'text',
      addable: true,
      defaults: {
        x: '120',
        y: '160',
        fill: 'black',
        'font-size': '48'
      }
    });
    expect(text.attrs).toEqual([
      { name: 'x', value: '120' },
      { name: 'y', value: '160' },
      { name: 'fill', value: 'black' },
      { name: 'font-size', value: '48' }
    ]);
    expect(textChild).toMatchObject({
      kind: 'text',
      text: 'Text'
    });
    expect(svgCapabilities.isValidChild('svg', 'text')).toBe(true);
    expect(svgCapabilities.isValidChild('g', 'text')).toBe(true);
    expect(svgCapabilities.isValidChild('text', 'tspan')).toBe(true);
    expect(svgCapabilities.isValidChild('rect', 'text')).toBe(false);
  });

  it('exposes typography metadata from the text SVG capability group', () => {
    expect(svgCapabilities.getAttribute('font-size')).toMatchObject({
      name: 'font-size',
      type: 'numeric',
      defaultValue: '48',
      numberRange: 'positive',
      inherits: true
    });
    expect(svgCapabilities.getAttribute('font-weight').enumValues).toEqual(['normal', 'bold', 'lighter', 'bolder']);
    expect(svgCapabilities.getAttribute('text-anchor').enumValues).toEqual(['start', 'middle', 'end']);
    expect(svgCapabilities.inheritedAttributeNames).toEqual(expect.arrayContaining(['font-family', 'font-size']));
  });

  it('exposes resource metadata from capability contributions', () => {
    expect(svgCapabilities.getElement('linearGradient')?.resourceKind).toBe('paint-server');
    expect(svgCapabilities.getElement('symbol')?.resourceKind).toBe('symbol');
    expect(svgCapabilities.getAttribute('fill').resourceReferenceKind).toBe('paint-server');
    expect(svgCapabilities.getAttribute('marker-end').resourceReferenceKind).toBe('marker');
  });

  it('exposes inherited attribute metadata from capability contributions', () => {
    const customContribution = {
      id: 'test.svg.inheritance',
      attributes: [
        {
          name: 'data-tone',
          inherits: true
        }
      ]
    } satisfies SvgCapabilityContribution;
    const registry = createSvgCapabilityRegistry([coreSvgCapabilityContribution, customContribution]);

    expect(svgCapabilities.isAttributeInherited('fill')).toBe(true);
    expect(svgCapabilities.isAttributeInherited('transform')).toBe(false);
    expect(svgCapabilities.inheritedAttributeNames).toContain('stroke');
    expect(registry.isAttributeInherited('data-tone')).toBe(true);
    expect(registry.inheritedAttributeNames).toContain('data-tone');
  });

  it('merges partial attribute control contributions without dropping core metadata', () => {
    const customContribution = {
      id: 'test.svg.controls',
      attributes: [
        {
          name: 'fill',
          control: ({ value }) => `custom fill ${value}`
        }
      ]
    } satisfies SvgCapabilityContribution;
    const registry = createSvgCapabilityRegistry([coreSvgCapabilityContribution, customContribution]);
    const rect = createElementNode('rect');

    expect(registry.getAttribute('fill')).toMatchObject({
      name: 'fill',
      type: 'color',
      defaultValue: 'black',
      color: {
        allowNone: true,
        allowUrl: true,
        allowCurrentColor: true
      }
    });
    expect(
      registry.renderAttributeControl(createAttributeControlContext({
        capabilities: registry,
        node: rect,
        name: 'fill',
        value: 'red',
        update: () => undefined
      }))
    ).toBe('custom fill red');
  });

  it('creates the core inspector control contribution from SVG attribute metadata', () => {
    const rect = createElementNode('rect');
    const contribution = createCoreInspectorControlContribution(({ value }) => `inspector ${value}`);
    const registry = createSvgCapabilityRegistry([coreSvgCapabilityContribution, contribution]);

    expect(registry.getAttribute('fill')).toMatchObject({
      type: 'color',
      defaultValue: 'black'
    });
    expect(
      registry.renderAttributeControl(createAttributeControlContext({
        capabilities: registry,
        node: rect,
        name: 'fill',
        value: '#ff0000',
        update: () => undefined
      }))
    ).toBe('inspector #ff0000');
  });
});

function createAttributeControlContext(options: {
  readonly capabilities: SvgCapabilityRegistry;
  readonly node: SvgElementNode;
  readonly name: string;
  readonly value: string;
  readonly update: (value: string) => void;
}): SvgAttributeControlContext {
  return {
    root: options.node,
    node: options.node,
    name: options.name,
    value: options.value,
    capabilities: options.capabilities,
    dispatchCommand: () => undefined,
    selectTarget: () => undefined,
    update: options.update
  };
}

function requireHandle(handles: readonly HandleDescriptor[], id: string): HandleDescriptor {
  const handle = handles.find((item) => item.id === id);

  if (!handle) {
    throw new Error(`Expected handle ${id}`);
  }

  return handle;
}

function requireElement(root: SvgElementNode | undefined, id: string): SvgElementNode {
  if (!root) {
    throw new Error('Expected root');
  }

  const node = findNode(root, id);

  if (!node || node.kind !== 'element') {
    throw new Error(`Expected element ${id}`);
  }

  return node;
}
