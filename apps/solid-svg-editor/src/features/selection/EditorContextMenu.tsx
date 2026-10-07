import { Dynamic } from '@solidjs/web';
import { createMemo, For, Show } from 'solid-js';

import DuplicateIcon from '../../App.icons/Duplicate.svg';
import MoveDownIcon from '../../App.icons/MoveDown.svg';
import MoveUpIcon from '../../App.icons/MoveUp.svg';
import { svgCapabilities } from '../../editor/capabilities';
import { convertElement, possibleConversions } from '../../editor/element-conversion';
import { newShapeNames } from '../../editor/new-shape';
import { decorativeIconProps } from '../../editor/svg-icon';
import type { ContextMenuState } from '../../editor/types';
import type { SvgNode } from '../../svg-model';
import DeleteIcon from '../ui/icons/Delete.svg';
import InsertAfterIcon from '../ui/icons/InsertAfter.svg';
import { createDismissible } from '../ui/createDismissible';
import { MenuButton } from '../ui/MenuItem';
import { useI18n } from '../../i18n/I18nProvider';
import InspectorIcon from '../chrome/icons/Inspector.svg';
import PlusIcon from '../ui/icons/Plus.svg';
import { InsertPointsPopup } from './InsertPointsPopup';
import { PathInsertPopup } from './PathInsertPopup';

export type EditorContextMenuAction = 'duplicate' | 'delete' | 'move-up' | 'move-down' | 'insert-after';

/** What the "commands" menu offers for the selected path commands or polygon/polyline points. */
export type SelectionMenuActions = {
  readonly moveUp: boolean;
  readonly moveDown: boolean;
  readonly reverse: boolean;
  readonly setOrigin: boolean;
  /** "Set as initial" is shown but disabled when the first point is the one selected. */
  readonly setOriginEnabled: boolean;
  readonly insertAfter: boolean;
  readonly insertMultiple: boolean;
};

export type SelectionMenuAction =
  | 'move-up'
  | 'move-down'
  | 'reverse'
  | 'set-origin'
  | 'delete'
  | 'insert-after'
  | 'insert-multiple'
  | 'view-in-inspector';

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
  /** Adds a shape at the canvas point of a "New shape" menu. */
  readonly addShape: (name: (typeof newShapeNames)[number]) => void;
  /** Which operations apply to the selected path commands or polygon points, for the "commands" menu. */
  readonly commandActions: SelectionMenuActions | undefined;
  readonly runCommandAction: (action: SelectionMenuAction) => void;
  /** The path command picker of the "path-insert" menu. */
  readonly pathInsert: Omit<Parameters<typeof PathInsertPopup>[0], 'previous' | 'next'> & {
    readonly previous: string | undefined;
    readonly next: string | undefined;
  };
  /** Inserts points after the selected one, for the "insert-points" menu. */
  readonly insertPoints: (count: number) => void;
  readonly close: () => void;
}) {
  const { t } = useI18n();
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
      <Show when={props.menu.kind === 'canvas'}>
        <div class="px-2 pt-0.5 pb-1 text-[11px] text-[var(--muted)]" data-testid="context-menu-new-shape-label">
          {t('New shape')}
        </div>
        <For each={newShapeNames}>
          {(name) => (
            <MenuButton type="button" data-testid={`context-menu-new-${name}`} onClick={() => props.addShape(name)}>
              <Dynamic class="h-4 w-4" component={svgCapabilities.iconForElement(name)} {...decorativeIconProps} />
              {name}
            </MenuButton>
          )}
        </For>
      </Show>
      <Show when={props.menu.kind === 'path-insert'}>
        <PathInsertPopup {...props.pathInsert} />
      </Show>
      <Show when={props.menu.kind === 'insert-points'}>
        <InsertPointsPopup insert={props.insertPoints} cancel={props.close} />
      </Show>
      <Show when={props.menu.kind === 'commands'}>
        <MenuButton type="button" icon={InspectorIcon} data-testid="context-menu-view-in-inspector" onClick={() => props.runCommandAction('view-in-inspector')}>
          {t('View in Inspector')}
        </MenuButton>
        <Show when={props.commandActions?.insertAfter}>
          <MenuButton type="button" icon={PlusIcon} data-testid="context-menu-commands-insert-after" onClick={() => props.runCommandAction('insert-after')}>
            {t('Insert after')}
          </MenuButton>
        </Show>
        <Show when={props.commandActions?.insertMultiple}>
          <MenuButton type="button" icon={PlusIcon} data-testid="context-menu-commands-insert-multiple" onClick={() => props.runCommandAction('insert-multiple')}>
            {t('Insert multiple after')}
          </MenuButton>
        </Show>
        <Show when={props.commandActions?.moveUp}>
          <MenuButton type="button" icon={MoveUpIcon} data-testid="context-menu-commands-move-up" onClick={() => props.runCommandAction('move-up')}>
            Move subpaths up
          </MenuButton>
        </Show>
        <Show when={props.commandActions?.moveDown}>
          <MenuButton type="button" icon={MoveDownIcon} data-testid="context-menu-commands-move-down" onClick={() => props.runCommandAction('move-down')}>
            Move subpaths down
          </MenuButton>
        </Show>
        <Show when={props.commandActions?.reverse}>
          <MenuButton type="button" data-testid="context-menu-commands-reverse" onClick={() => props.runCommandAction('reverse')}>
            {t('Reverse order')}
          </MenuButton>
        </Show>
        <Show when={props.commandActions?.setOrigin}>
          <MenuButton
            type="button"
            disabled={!props.commandActions?.setOriginEnabled}
            data-testid="context-menu-commands-set-origin"
            onClick={() => props.runCommandAction('set-origin')}
          >
            {t('Set as initial')}
          </MenuButton>
        </Show>
        <MenuButton type="button" icon={DeleteIcon} data-testid="context-menu-commands-delete" onClick={() => props.runCommandAction('delete')}>
          {t('Delete')}
        </MenuButton>
      </Show>
      <Show when={props.menu.kind === 'node' && props.menu.fromCanvas}>
        <MenuButton type="button" icon={InspectorIcon} data-testid="context-menu-view-in-inspector" onClick={() => props.runCommandAction('view-in-inspector')}>
          {t('View in Inspector')}
        </MenuButton>
      </Show>
      <Show when={props.menu.kind === 'node'}>
      <MenuButton
        type="button"
        icon={DuplicateIcon}
        data-testid="context-menu-duplicate"
        onClick={() => props.runAction('duplicate')}
      >
        {t('Duplicate')}
      </MenuButton>
      <MenuButton
        type="button"
        icon={MoveUpIcon}
        data-testid="context-menu-move-up"
        onClick={() => props.runAction('move-up')}
      >
        {t('Move up')}
      </MenuButton>
      <MenuButton
        type="button"
        icon={MoveDownIcon}
        data-testid="context-menu-move-down"
        onClick={() => props.runAction('move-down')}
      >
        {t('Move down')}
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
        {t('Delete')}
      </MenuButton>
      <Show when={conversions().length > 0}>
        <div
          class="mt-0.5 border-t border-[var(--soft-border)] px-2 pt-1.25 pb-0.5 text-[11px] text-[var(--muted)]"
          data-testid="context-menu-convert-label"
        >
          {t('Convert to')}
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
      </Show>
    </div>
  );
}
