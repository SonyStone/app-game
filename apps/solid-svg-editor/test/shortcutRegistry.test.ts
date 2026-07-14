import { describe, expect, it } from 'vitest';

import { createEditorShortcuts, createShortcutDescriptors } from '../src/features/shortcuts/createEditorShortcuts';
import {
  coreShortcutContribution,
  createShortcutRegistry,
  shortcutItemsFromContributions,
  type ShortcutDescriptor
} from '../src/features/shortcuts/shortcutRegistry';

interface TestKeyboardEvent extends KeyboardEvent {
  readonly wasPrevented: () => boolean;
}

function createTestKeyboardEvent(options: {
  readonly key: string;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly editable?: boolean;
}): TestKeyboardEvent {
  let prevented = false;
  const target = options.editable
    ? {
        matches: () => true
      }
    : null;

  return {
    key: options.key,
    ctrlKey: options.ctrl ?? false,
    metaKey: options.meta ?? false,
    shiftKey: options.shift ?? false,
    altKey: options.alt ?? false,
    target,
    preventDefault: () => {
      prevented = true;
    },
    wasPrevented: () => prevented
  } as TestKeyboardEvent;
}

function shortcutDescriptor(
  overrides: Pick<ShortcutDescriptor, 'id' | 'bindings' | 'run'> & Partial<ShortcutDescriptor>
): ShortcutDescriptor {
  return {
    category: 'test',
    action: 'Run',
    keys: 'Ctrl+R',
    target: { kind: 'handler', id: overrides.id },
    ...overrides
  };
}

describe('createShortcutRegistry', () => {
  it('exposes default shortcuts through the core shortcut contribution', () => {
    expect(coreShortcutContribution.id).toBe('core.shortcuts');
    expect(coreShortcutContribution.shortcuts.map((shortcut) => shortcut.id)).toContain('file.optimize');
    expect(coreShortcutContribution.shortcuts.find((shortcut) => shortcut.id === 'file.optimize')?.target).toEqual({
      kind: 'command',
      id: 'svg.optimize'
    });
    expect(coreShortcutContribution.shortcuts.find((shortcut) => shortcut.id === 'file.import')?.target).toEqual({
      kind: 'action',
      id: 'file.import'
    });
    expect(coreShortcutContribution.shortcuts.find((shortcut) => shortcut.id === 'edit.duplicate')?.target).toEqual({
      kind: 'command',
      id: 'svg.duplicate-selection'
    });
    expect(coreShortcutContribution.shortcuts.find((shortcut) => shortcut.id === 'edit.delete')?.target).toEqual({
      kind: 'command',
      id: 'svg.delete-selection'
    });
    expect(coreShortcutContribution.shortcuts.find((shortcut) => shortcut.id === 'command.palette')?.target).toEqual({
      kind: 'action',
      id: 'command.palette'
    });
    expect(shortcutItemsFromContributions()).toContainEqual({
      category: 'file',
      action: 'Optimize',
      keys: 'Ctrl+Shift+O'
    });
  });

  it('appends shortcut items from custom contributions', () => {
    const items = shortcutItemsFromContributions([
      coreShortcutContribution,
      {
        id: 'test.shortcuts',
        shortcuts: [
          {
            id: 'test.run',
            target: { kind: 'handler', id: 'test.run' },
            category: 'test',
            action: 'Run custom shortcut',
            keys: 'Ctrl+R',
            bindings: [{ key: 'r', ctrl: true }]
          }
        ]
      }
    ]);

    expect(items.at(-1)).toEqual({
      category: 'test',
      action: 'Run custom shortcut',
      keys: 'Ctrl+R'
    });
  });

  it('binds shortcut contributions to runtime handlers by id', () => {
    const descriptors = createShortcutDescriptors(
      [
        {
          id: 'test.run',
          target: { kind: 'handler', id: 'test.run' },
          category: 'test',
          action: 'Run',
          keys: 'Ctrl+R',
          bindings: [{ key: 'r', ctrl: true }]
        },
        {
          id: 'test.unhandled',
          target: { kind: 'handler', id: 'test.unhandled' },
          category: 'test',
          action: 'Unhandled',
          keys: 'Ctrl+U',
          bindings: [{ key: 'u', ctrl: true }]
        }
      ],
      {
        handlers: {
          'test.run': () => undefined
        }
      }
    );

    expect(descriptors.map((descriptor) => descriptor.id)).toEqual(['test.run']);
  });

  it('resolves shortcut handlers by explicit target kind', () => {
    const runs: string[] = [];
    const descriptors = createShortcutDescriptors(
      [
        {
          id: 'test.shortcut',
          target: { kind: 'command', id: 'test.command' },
          category: 'test',
          action: 'Run',
          keys: 'Ctrl+R',
          bindings: [{ key: 'r', ctrl: true }]
        }
      ],
      {
        handlers: {
          'test.command': () => {
            runs.push('handler');
          }
        },
        commands: {
          'test.command': () => {
            runs.push('command');
          }
        }
      }
    );

    descriptors[0]?.run(createTestKeyboardEvent({ key: 'r', ctrl: true }));

    expect(runs).toEqual(['command']);
  });

  it('binds command shortcut contributions from the injected command handler registry', () => {
    let duplicates = 0;
    const registry = createEditorShortcuts({
      activeElement: () => null,
      shortcuts: coreShortcutContribution.shortcuts,
      shortcutHandlers: {
        commands: {
          'svg.duplicate-selection': () => {
            duplicates += 1;
          }
        }
      }
    });
    const event = createTestKeyboardEvent({ key: 'd', ctrl: true });

    registry.onKeyDown(event);

    expect(duplicates).toBe(1);
    expect(event.wasPrevented()).toBe(true);
  });

  it('binds the command palette shortcut to an editable-safe handler', () => {
    let opens = 0;
    const registry = createEditorShortcuts({
      activeElement: () => null,
      shortcuts: coreShortcutContribution.shortcuts,
      shortcutHandlers: {
        actions: {
          'command.palette': () => {
            opens += 1;
          }
        }
      }
    });
    const event = createTestKeyboardEvent({ key: 'k', ctrl: true, editable: true });

    registry.onKeyDown(event);

    expect(opens).toBe(1);
    expect(event.wasPrevented()).toBe(true);
  });

  it('binds host handler shortcuts from the injected handler registry', () => {
    const runs: string[] = [];
    const registry = createEditorShortcuts({
      activeElement: () => null,
      shortcuts: coreShortcutContribution.shortcuts,
      shortcutHandlers: {
        handlers: {
          'tool.insert-path-command': (event) => {
            runs.push(`${event.key}:${event.shiftKey ? 'absolute' : 'relative'}`);
          }
        }
      }
    });
    const event = createTestKeyboardEvent({ key: 'M', shift: true });

    registry.onKeyDown(event);

    expect(runs).toEqual(['M:absolute']);
    expect(event.wasPrevented()).toBe(true);
  });

  it('matches descriptor bindings and treats meta as the platform control key', () => {
    let runs = 0;
    const registry = createShortcutRegistry([
      shortcutDescriptor({
        id: 'test.run',
        bindings: [{ key: 'r', ctrl: true }],
        run: () => {
          runs += 1;
        }
      })
    ]);
    const event = createTestKeyboardEvent({ key: 'R', meta: true });

    registry.onKeyDown(event);

    expect(runs).toBe(1);
    expect(event.wasPrevented()).toBe(true);
  });

  it('ignores editable targets unless a descriptor explicitly opts in', () => {
    let blockedRuns = 0;
    let allowedRuns = 0;
    const registry = createShortcutRegistry([
      shortcutDescriptor({
        id: 'test.blocked',
        bindings: [{ key: 'b', ctrl: true }],
        run: () => {
          blockedRuns += 1;
        }
      }),
      shortcutDescriptor({
        id: 'test.allowed',
        bindings: [{ key: 'a', ctrl: true }],
        allowInEditable: true,
        run: () => {
          allowedRuns += 1;
        }
      })
    ]);
    const blockedEvent = createTestKeyboardEvent({ key: 'b', ctrl: true, editable: true });
    const allowedEvent = createTestKeyboardEvent({ key: 'a', ctrl: true, editable: true });

    registry.onKeyDown(blockedEvent);
    registry.onKeyDown(allowedEvent);

    expect(blockedRuns).toBe(0);
    expect(blockedEvent.wasPrevented()).toBe(false);
    expect(allowedRuns).toBe(1);
    expect(allowedEvent.wasPrevented()).toBe(true);
  });
});
