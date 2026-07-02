import { describe, expect, it } from 'vitest';

import {
  createShortcutRegistry,
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
    ...overrides
  };
}

describe('createShortcutRegistry', () => {
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
