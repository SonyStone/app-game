import { describe, expect, it } from 'vitest';

import { restoreSettings } from '../src/editor/defaults';
import type { AppSettings } from '../src/editor/types';
import { createEditorShortcuts } from '../src/features/shortcuts/createEditorShortcuts';
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
    const noop = () => undefined;
    const shortcuts = createEditorShortcuts({
      activeElement: () => null,
      enabled: () => true,
      overrides: () => overrides,
      undo: () => (undos += 1),
      redo: noop,
      downloadSvg: noop,
      copySvgText: noop,
      openImportDialog: noop,
      openExport: noop,
      openSettings: noop,
      createNewTab: noop,
      optimizeActive: noop,
      zoomIn: noop,
      zoomOut: noop,
      centerFrame: noop,
      toggleGrid: noop,
      toggleHandles: noop,
      selectAll: noop,
      clearSelection: noop,
      duplicateSelected: noop,
      deleteSelected: noop,
      moveSelected: noop,
      insertPathCommandFromKey: noop
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
