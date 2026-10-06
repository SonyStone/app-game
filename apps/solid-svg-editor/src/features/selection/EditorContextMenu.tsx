import { Dynamic } from '@solidjs/web';
import { createMemo, For, Show } from 'solid-js';

import DuplicateIcon from '../../App.icons/Duplicate.svg';
import MoveDownIcon from '../../App.icons/MoveDown.svg';
import MoveUpIcon from '../../App.icons/MoveUp.svg';
import { svgCapabilities } from '../../editor/capabilities';
import { convertElement, possibleConversions } from '../../editor/element-conversion';
import { decorativeIconProps } from '../../editor/svg-icon';
import type { ContextMenuState } from '../../editor/types';
import type { SvgNode } from '../../svg-model';
import DeleteIcon from '../ui/icons/Delete.svg';
import InsertAfterIcon from '../ui/icons/InsertAfter.svg';
import { createDismissible } from '../ui/createDismissible';
import { MenuButton } from '../ui/MenuItem';

export type EditorContextMenuAction = 'duplicate' | 'delete' | 'move-up' | 'move-down' | 'insert-after';

/**
 * Element actions menu at the pointer; a press outside it or Escape calls `close`.
 *
 * For shapes it lists "Convert to" targets like GodSVG; targets that would change the shape are disabled.
 */
export function EditorContextMenu(props: {
  readonly menu: ContextMenuState;
  /** The node the menu was opened on. */
  readonly node: SvgNode | undefined;
  readonly runAction: (action: EditorContextMenuAction) => void;
  readonly convert: (target: string) => void;
  readonly close: () => void;
}) {
  let menu: HTMLDivElement | undefined;
  createDismissible({ open: () => true, container: () => menu, close: () => props.close() });

  const conversions = createMemo(() => {
    const node = props.node;
    return node?.kind === 'element'
      ? possibleConversions(node).map((name) => ({ name, enabled: convertElement(node, name) !== undefined }))
      : [];
  });

  return (
    <div
      ref={(element) => (menu = element)}
      class="popover context-menu absolute z-50 grid min-w-47.5 gap-0.5 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_96%,#000)] p-1.25 shadow-[0_12px_28px_#0008]"
      style={{ left: `${props.menu.x}px`, top: `${props.menu.y}px` }}
      data-testid="context-menu"
    >
      <MenuButton
        type="button"
        icon={DuplicateIcon}
        data-testid="context-menu-duplicate"
        onClick={() => props.runAction('duplicate')}
      >
        Duplicate
      </MenuButton>
      <MenuButton
        type="button"
        icon={MoveUpIcon}
        data-testid="context-menu-move-up"
        onClick={() => props.runAction('move-up')}
      >
        Move up
      </MenuButton>
      <MenuButton
        type="button"
        icon={MoveDownIcon}
        data-testid="context-menu-move-down"
        onClick={() => props.runAction('move-down')}
      >
        Move down
      </MenuButton>
      <MenuButton
        type="button"
        icon={InsertAfterIcon}
        data-testid="context-menu-insert-after"
        onClick={() => props.runAction('insert-after')}
      >
        Insert group after
      </MenuButton>
      <MenuButton
        type="button"
        icon={DeleteIcon}
        data-testid="context-menu-delete"
        onClick={() => props.runAction('delete')}
      >
        Delete
      </MenuButton>
      <Show when={conversions().length > 0}>
        <div
          class="mt-0.5 border-t border-[var(--soft-border)] px-2 pt-1.25 pb-0.5 text-[11px] text-[var(--muted)]"
          data-testid="context-menu-convert-label"
        >
          Convert to
        </div>
        <For each={conversions()}>
          {(conversion) => (
            <MenuButton
              type="button"
              disabled={!conversion.enabled}
              title={conversion.enabled ? undefined : 'Converting would change the shape'}
              data-testid={`context-menu-convert-${conversion.name}`}
              onClick={() => props.convert(conversion.name)}
            >
              <Dynamic class="h-4 w-4" component={svgCapabilities.iconForElement(conversion.name)} {...decorativeIconProps} />
              {conversion.name}
            </MenuButton>
          )}
        </For>
      </Show>
    </div>
  );
}
