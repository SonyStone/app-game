import { render } from 'solid-js/web';
import { describe, expect, it } from 'vitest';

import { createSvgCapabilityRegistry } from '../src/editor/capabilities';
import type { EditorCommand } from '../src/editor/commands';
import type { SvgAttributeControlContext, SvgCapabilityContribution } from '../src/editor/kernel';
import { isOperationBackedEditorCommand } from '../src/editor/operations';
import { nodeSelectionTarget, pathCommandSelectionTarget, type SelectionTarget } from '../src/editor/selection-targets';
import { coreSvgCapabilityContribution } from '../src/editor/svg-capabilities/coreSvgContribution';
import { AttributeGrid } from '../src/features/inspector/InspectorInputs';
import { createElementNode } from '../src/svg-model';

describe('InspectorInputs', () => {
  it('dispatches path-anchor commands from structured path parameter edits', () => {
    const path = createElementNode('path', [{ name: 'd', value: 'M 0 0 L 10 20' }]);
    const commands: EditorCommand[] = [];
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () =>
        AttributeGrid({
          node: path,
          updateElementAttribute: () => {
            throw new Error('Expected structured path edits to dispatch a command');
          },
          dispatchCommand: (command) => commands.push(command),
          selectedTargets: [],
          selectTarget: () => undefined
        }),
      container
    );

    changeInput(container, `path-command-param-${path.id}-1-x`, '15');

    const command = commands[0];

    expect(command?.id).toBe('svg.update-path-anchor');
    expect(command && isOperationBackedEditorCommand(command)).toBe(true);
    expect(command && isOperationBackedEditorCommand(command) ? command.resolveOperations(createElementNode('svg', [], [path])) : []).toEqual([
      { kind: 'svg.set-attribute', nodeId: path.id, name: 'd', value: 'M 0 0 L 15 20' }
    ]);

    dispose();
    container.remove();
  });

  it('dispatches path command structure commands from path controls', () => {
    const path = createElementNode('path', [{ name: 'd', value: 'M 0 0 L 10 20' }]);
    const commands: EditorCommand[] = [];
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () =>
        AttributeGrid({
          node: path,
          updateElementAttribute: () => {
            throw new Error('Expected structured path command edits to dispatch a command');
          },
          dispatchCommand: (command) => commands.push(command),
          selectedTargets: [],
          selectTarget: () => undefined
        }),
      container
    );

    clickButton(container, `path-command-toggle-${path.id}-1`);
    clickButton(container, `path-command-add-${path.id}`);

    expect(commands.map((command) => command.id)).toEqual([
      'svg.toggle-path-command-relative',
      'svg.insert-path-command'
    ]);

    const root = createElementNode('svg', [], [path]);

    expect(
      commands[0] && isOperationBackedEditorCommand(commands[0]) ? commands[0].resolveOperations(root) : []
    ).toEqual([{ kind: 'svg.set-attribute', nodeId: path.id, name: 'd', value: 'M 0 0 l 10 20' }]);
    expect(
      commands[1] && isOperationBackedEditorCommand(commands[1]) ? commands[1].resolveOperations(root) : []
    ).toEqual([{ kind: 'svg.set-attribute', nodeId: path.id, name: 'd', value: 'M 0 0 L 10 20 M 0 0' }]);

    dispose();
    container.remove();
  });

  it('selects path command targets after path command insert and delete controls', () => {
    const path = createElementNode('path', [{ name: 'd', value: 'M 0 0 L 10 20 C 1 2 3 4 5 6' }]);
    const commands: EditorCommand[] = [];
    const targets: SelectionTarget[] = [];
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () =>
        AttributeGrid({
          node: path,
          updateElementAttribute: () => {
            throw new Error('Expected structured path command edits to dispatch a command');
          },
          dispatchCommand: (command) => commands.push(command),
          selectedTargets: [],
          selectTarget: (target) => targets.push(target)
        }),
      container
    );

    clickButton(container, `path-command-add-${path.id}`);
    clickButton(container, `path-command-actions-${path.id}-1`);
    clickButton(container, `path-command-insert-after-${path.id}-1`);
    clickButton(container, `path-command-actions-${path.id}-1`);
    clickButton(container, `path-command-delete-${path.id}-1`);

    expect(commands.map((command) => command.id)).toEqual([
      'svg.insert-path-command',
      'svg.insert-path-command',
      'svg.delete-path-command'
    ]);
    expect(targets).toEqual([
      pathCommandSelectionTarget(path.id, 3),
      pathCommandSelectionTarget(path.id, 2),
      pathCommandSelectionTarget(path.id, 1)
    ]);

    dispose();
    container.remove();
  });

  it('dispatches point commands from structured point row edits', () => {
    const polyline = createElementNode('polyline', [{ name: 'points', value: '0 0 10 10 20 20' }]);
    const commands: EditorCommand[] = [];
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () =>
        AttributeGrid({
          node: polyline,
          updateElementAttribute: () => {
            throw new Error('Expected structured point edits to dispatch a command');
          },
          dispatchCommand: (command) => commands.push(command),
          selectedTargets: [],
          selectTarget: () => undefined
        }),
      container
    );

    changeInput(container, `point-y-${polyline.id}-1`, '24');

    const command = commands[0];

    expect(command?.id).toBe('svg.update-point');
    expect(command && isOperationBackedEditorCommand(command)).toBe(true);
    expect(command && isOperationBackedEditorCommand(command) ? command.resolveOperations(createElementNode('svg', [], [polyline])) : []).toEqual([
      { kind: 'svg.set-attribute', nodeId: polyline.id, name: 'points', value: '0 0 10 24 20 20' }
    ]);

    dispose();
    container.remove();
  });

  it('dispatches point structure commands from point controls', () => {
    const polyline = createElementNode('polyline', [{ name: 'points', value: '0 0 10 10 20 20' }]);
    const commands: EditorCommand[] = [];
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () =>
        AttributeGrid({
          node: polyline,
          updateElementAttribute: () => {
            throw new Error('Expected structured point controls to dispatch a command');
          },
          dispatchCommand: (command) => commands.push(command),
          selectedTargets: [],
          selectTarget: () => undefined
        }),
      container
    );

    clickButton(container, `point-delete-${polyline.id}-1`);
    clickButton(container, `point-add-${polyline.id}`);

    expect(commands.map((command) => command.id)).toEqual(['svg.delete-point', 'svg.add-point']);

    const root = createElementNode('svg', [], [polyline]);

    expect(
      commands[0] && isOperationBackedEditorCommand(commands[0]) ? commands[0].resolveOperations(root) : []
    ).toEqual([{ kind: 'svg.set-attribute', nodeId: polyline.id, name: 'points', value: '0 0 20 20' }]);
    expect(
      commands[1] && isOperationBackedEditorCommand(commands[1]) ? commands[1].resolveOperations(root) : []
    ).toEqual([
      { kind: 'svg.set-attribute', nodeId: polyline.id, name: 'points', value: '0 0 10 10 20 20 60 60' }
    ]);

    dispose();
    container.remove();
  });

  it('uses injected SVG capabilities for custom attribute controls', () => {
    const badge = createElementNode('badge', [{ name: 'tone', value: '-5' }]);
    const extension = {
      id: 'test.svg',
      elements: [
        {
          name: 'badge',
          defaults: { tone: '1' },
          attributes: ['tone']
        }
      ],
      attributes: [
        {
          name: 'tone',
          type: 'numeric',
          defaultValue: '1',
          numberRange: 'positive'
        }
      ]
    } satisfies SvgCapabilityContribution;
    const updates: string[] = [];
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () =>
        AttributeGrid({
          node: badge,
          capabilities: createSvgCapabilityRegistry([coreSvgCapabilityContribution, extension]),
          updateElementAttribute: (_nodeId, _name, value) => {
            updates.push(value);
          },
          dispatchCommand: () => undefined,
          selectedTargets: [],
          selectTarget: () => undefined
        }),
      container
    );

    expect(container.querySelector(`[data-testid="unknown-attributes-${badge.id}"]`)).toBeNull();

    changeInput(container, `attribute-input-${badge.id}-tone`, '-12');

    expect(updates).toEqual(['0']);

    dispose();
    container.remove();
  });

  it('passes editor services into custom SVG attribute controls', () => {
    const badge = createElementNode('badge', [{ name: 'tone', value: 'warm' }]);
    const root = createElementNode('svg', [], [badge]);
    const commands: EditorCommand[] = [];
    const targets: SelectionTarget[] = [];
    const updates: string[] = [];
    let capturedContext: SvgAttributeControlContext | undefined;
    const extension = {
      id: 'test.svg.control-context',
      elements: [
        {
          name: 'badge',
          defaults: { tone: 'neutral' },
          attributes: ['tone']
        }
      ],
      attributes: [
        {
          name: 'tone',
          control: (context) => {
            capturedContext = context;
            return `custom ${context.value}`;
          }
        }
      ]
    } satisfies SvgCapabilityContribution;
    const capabilities = createSvgCapabilityRegistry([coreSvgCapabilityContribution, extension]);
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () =>
        AttributeGrid({
          root,
          node: badge,
          capabilities,
          updateElementAttribute: (_nodeId, _name, value) => {
            updates.push(value);
          },
          dispatchCommand: (command) => commands.push(command),
          selectedTargets: [],
          selectTarget: (target) => targets.push(target)
        }),
      container
    );

    expect(container.textContent).toContain('custom warm');
    expect(capturedContext?.root).toBe(root);
    expect(capturedContext?.node).toBe(badge);
    expect(capturedContext?.capabilities).toBe(capabilities);

    capturedContext?.update('cool');
    capturedContext?.dispatchCommand({ id: 'test.attribute-command', label: 'Attribute command', apply: (currentRoot) => currentRoot });
    capturedContext?.selectTarget(nodeSelectionTarget(badge.id));

    expect(updates).toEqual(['cool']);
    expect(commands.map((command) => command.id)).toEqual(['test.attribute-command']);
    expect(targets).toEqual([nodeSelectionTarget(badge.id)]);

    dispose();
    container.remove();
  });
});

function changeInput(container: HTMLElement, testId: string, value: string): void {
  const input = container.querySelector(`[data-testid="${testId}"]`);

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected input ${testId}`);
  }

  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function clickButton(container: HTMLElement, testId: string): void {
  const button = container.querySelector(`[data-testid="${testId}"]`);

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button ${testId}`);
  }

  button.click();
}
