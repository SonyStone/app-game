import { createMemo, For, Show } from 'solid-js';

import { createContextMenuItems } from '../../editor/context-menu';
import type { EditorKernel } from '../../editor/kernel';
import { MenuButton } from '../ui/MenuItem';

export function EditorContextMenu<TPanelContext>(props: { readonly kernel: EditorKernel<TPanelContext> }) {
  const menu = () => props.kernel.ui.contextMenu?.active();
  const items = createMemo(() => {
    const activeMenu = menu();
    return activeMenu === undefined ? [] : createContextMenuItems(props.kernel, activeMenu.target);
  });

  return (
    <Show when={menu()}>
      {(activeMenu) => (
        <div
          class="popover context-menu absolute z-50 grid min-w-47.5 gap-0.5 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_96%,#000)] p-1.25 shadow-[0_12px_28px_#0008]"
          style={{ left: `${activeMenu().x}px`, top: `${activeMenu().y}px` }}
          data-testid="context-menu"
        >
          <For each={items()}>
            {(item) => (
              <MenuButton
                {...(item.icon === undefined ? {} : { icon: item.icon })}
                type="button"
                data-testid={`context-menu-${item.id}`}
                disabled={!item.enabled}
                onClick={() => {
                  if (item.run()) {
                    props.kernel.ui.contextMenu?.close();
                  }
                }}
              >
                {item.label}
              </MenuButton>
            )}
          </For>
        </div>
      )}
    </Show>
  );
}
