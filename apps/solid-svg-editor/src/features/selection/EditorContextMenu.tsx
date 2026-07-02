import DuplicateIcon from '../../App.icons/Duplicate.svg';
import MoveDownIcon from '../../App.icons/MoveDown.svg';
import MoveUpIcon from '../../App.icons/MoveUp.svg';
import type { ContextMenuState } from '../../editor/types';
import DeleteIcon from '../ui/icons/Delete.svg';
import InsertAfterIcon from '../ui/icons/InsertAfter.svg';
import { MenuButton } from '../ui/MenuItem';

export type EditorContextMenuAction = 'duplicate' | 'delete' | 'move-up' | 'move-down' | 'insert-after';

export function EditorContextMenu(props: {
  readonly menu: ContextMenuState;
  readonly runAction: (action: EditorContextMenuAction) => void;
}) {
  return (
    <div
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
    </div>
  );
}
