import type { Accessor } from 'solid-js';

import type { ShortcutContribution } from '../../editor/kernel';
import { createShortcutRegistry, type ShortcutDescriptor } from './shortcutRegistry';

export type ShortcutHandler = (event: KeyboardEvent) => void;

export interface ShortcutHandlerRegistry {
  readonly actions?: Readonly<Record<string, ShortcutHandler>>;
  readonly commands?: Readonly<Record<string, ShortcutHandler>>;
  readonly handlers?: Readonly<Record<string, ShortcutHandler>>;
}

export function createEditorShortcuts(options: {
  readonly activeElement: Accessor<Element | null>;
  readonly shortcuts: readonly ShortcutContribution[];
  readonly shortcutHandlers: ShortcutHandlerRegistry;
}) {
  const shortcuts = createShortcutDescriptors(options.shortcuts, options.shortcutHandlers);

  return createShortcutRegistry(shortcuts, { activeElement: options.activeElement });
}

export function createShortcutDescriptors(
  contributions: readonly ShortcutContribution[],
  handlers: ShortcutHandlerRegistry
): readonly ShortcutDescriptor[] {
  return contributions.flatMap((contribution) => {
    const run = resolveShortcutHandler(contribution, handlers);
    return run ? [{ ...contribution, run }] : [];
  });
}

function resolveShortcutHandler(
  contribution: ShortcutContribution,
  handlers: ShortcutHandlerRegistry
): ShortcutHandler | undefined {
  switch (contribution.target.kind) {
    case 'action':
      return handlers.actions?.[contribution.target.id];
    case 'command':
      return handlers.commands?.[contribution.target.id];
    case 'handler':
      return handlers.handlers?.[contribution.target.id];
  }
}
