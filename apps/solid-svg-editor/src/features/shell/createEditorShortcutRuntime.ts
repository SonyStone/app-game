import { createActiveElement } from '@solid-primitives/active-element';
import { createEventListener } from '@solid-primitives/event-listener';

import { createRegisteredActionHandlers } from '../../editor/action-registry';
import { createRegisteredCommandHandlers } from '../../editor/command-registry';
import type { EditorContributionContext } from '../../editor/kernel';
import { createEditorShortcuts, type ShortcutHandlerRegistry } from '../shortcuts/createEditorShortcuts';

export interface CreateEditorShortcutRuntimeOptions {
  readonly kernel: EditorContributionContext;
  readonly handlers?: ShortcutHandlerRegistry['handlers'];
}

export interface EditorShortcutRuntime {
  readonly onKeyDown: (event: KeyboardEvent) => void;
}

export function createEditorShortcutRuntime(options: CreateEditorShortcutRuntimeOptions): EditorShortcutRuntime {
  const activeElement = createActiveElement();
  const shortcutHandlers = {
    actions: createRegisteredActionHandlers(options.kernel),
    commands: createRegisteredCommandHandlers(options.kernel),
    ...(options.handlers === undefined ? {} : { handlers: options.handlers })
  } satisfies ShortcutHandlerRegistry;
  const { onKeyDown } = createEditorShortcuts({
    activeElement,
    shortcuts: options.kernel.registries.shortcuts,
    shortcutHandlers
  });
  createEventListener(window, 'keydown', onKeyDown);

  return { onKeyDown } satisfies EditorShortcutRuntime;
}
