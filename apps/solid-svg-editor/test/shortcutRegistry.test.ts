import { describe, expect, it } from 'vitest';

import { restoreSettings } from '../src/editor/defaults';
import type { AppSettings } from '../src/editor/types';
import { createEditorShortcuts, editorActions, type EditorActionId } from '../src/features/shortcuts/createEditorShortcuts';
import {
  bindingFromEvent,
  createShortcutRegistry,
  formatBinding,
  sameBinding,
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
  readonly code?: string;
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
    code: options.code ?? '',
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
    defaultBindings: overrides.bindings,
    editable: true,
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

  it('runs nothing while disabled', () => {
    let enabled = false;
    let runs = 0;
    const registry = createShortcutRegistry(
      [shortcutDescriptor({ id: 'test.delete', bindings: [{ key: 'Delete' }], run: () => (runs += 1) })],
      { enabled: () => enabled }
    );
    const blockedEvent = createTestKeyboardEvent({ key: 'Delete' });

    registry.onKeyDown(blockedEvent);
    enabled = true;
    registry.onKeyDown(createTestKeyboardEvent({ key: 'Delete' }));

    expect(blockedEvent.wasPrevented()).toBe(false);
    expect(runs).toBe(1);
  });

  it('falls back to the physical key, preferring the typed one', () => {
    const runs: string[] = [];
    const registry = createShortcutRegistry([
      shortcutDescriptor({ id: 'test.snap', bindings: [{ key: 's', alt: true }], run: () => void runs.push('snap') }),
      shortcutDescriptor({ id: 'test.undo', bindings: [{ key: 'z', ctrl: true }], run: () => void runs.push('undo') }),
      shortcutDescriptor({ id: 'test.quit', bindings: [{ key: 'q', ctrl: true }], run: () => void runs.push('quit') })
    ]);

    // macOS types "ß" for Alt+S; a Russian layout types "я" for Ctrl+Z.
    registry.onKeyDown(createTestKeyboardEvent({ key: 'ß', code: 'KeyS', alt: true }));
    registry.onKeyDown(createTestKeyboardEvent({ key: 'я', code: 'KeyZ', ctrl: true }));
    // AZERTY: the key labelled Q sits where QWERTY has A, and Ctrl+Q means Q.
    registry.onKeyDown(createTestKeyboardEvent({ key: 'q', code: 'KeyA', ctrl: true }));

    expect(runs).toEqual(['snap', 'undo', 'quit']);
    expect(bindingFromEvent(createTestKeyboardEvent({ key: 'ß', code: 'KeyS', alt: true }))).toEqual({ key: 's', alt: true });
  });

  it('leaves the key press to the browser when the action does not apply', () => {
    const registry = createShortcutRegistry([shortcutDescriptor({ id: 'test.find', bindings: [{ key: 'f', ctrl: true }], run: () => false })]);
    const event = createTestKeyboardEvent({ key: 'f', ctrl: true });

    registry.onKeyDown(event);

    expect(event.wasPrevented()).toBe(false);
  });

  it('ignores events another handler already handled', () => {
    let runs = 0;
    const registry = createShortcutRegistry([shortcutDescriptor({ id: 'test.escape', bindings: [{ key: 'Escape' }], run: () => (runs += 1) })]);
    const event = createTestKeyboardEvent({ key: 'Escape' });
    Object.defineProperty(event, 'defaultPrevented', { value: true });

    registry.onKeyDown(event);

    expect(runs).toBe(0);
  });
});

describe('shortcut bindings', () => {
  it('formats, reads, and compares bindings', () => {
    expect(formatBinding({ key: 'z', ctrl: true, shift: true })).toBe('Ctrl+Shift+Z');
    expect(formatBinding({ key: 'ArrowUp', alt: true })).toBe('Alt+ArrowUp');
    expect(bindingFromEvent(createTestKeyboardEvent({ key: 'K', meta: true, shift: true }))).toEqual({ key: 'k', ctrl: true, shift: true });
    expect(bindingFromEvent(createTestKeyboardEvent({ key: 'Shift', shift: true }))).toBeUndefined();
    expect(sameBinding({ key: 'K', ctrl: true }, { key: 'k', ctrl: true, shift: false })).toBe(true);
    expect(sameBinding({ key: 'k', ctrl: true }, { key: 'k' })).toBe(false);
  });

  it('runs editor actions from the user bindings, read on each key press', () => {
    let overrides: AppSettings['shortcutOverrides'] = {};
    let undos = 0;
    const handlers = Object.fromEntries(editorActions.map((action) => [action.id, () => undefined])) as Record<
      EditorActionId,
      () => boolean | void
    >;
    const shortcuts = createEditorShortcuts({
      activeElement: () => null,
      enabled: () => true,
      overrides: () => overrides,
      handlers: { ...handlers, 'edit.undo': () => void (undos += 1) }
    });
    const undo = shortcuts.descriptors.find((item) => item.id === 'edit.undo');

    shortcuts.onKeyDown(createTestKeyboardEvent({ key: 'z', ctrl: true }));
    overrides = { 'edit.undo': [{ key: 'u' }] };
    shortcuts.onKeyDown(createTestKeyboardEvent({ key: 'z', ctrl: true }));
    shortcuts.onKeyDown(createTestKeyboardEvent({ key: 'u' }));

    expect(undos).toBe(2);
    expect(undo?.keys).toBe('U');
    expect(undo?.defaultBindings).toEqual([{ key: 'z', ctrl: true }]);
    expect(shortcuts.descriptors.find((item) => item.id === 'tool.insert-path-command')?.editable).toBe(false);
  });

  it('restores valid stored overrides and drops malformed ones', () => {
    const valid = { 'edit.undo': [{ key: 'u', ctrl: true }] };

    expect(restoreSettings(JSON.stringify({ shortcutOverrides: valid })).shortcutOverrides).toEqual(valid);
    expect(restoreSettings(JSON.stringify({ shortcutOverrides: { 'edit.undo': 'u' } })).shortcutOverrides).toEqual({});
    expect(restoreSettings(JSON.stringify({ shortcutOverrides: [] })).shortcutOverrides).toEqual({});
  });
});
