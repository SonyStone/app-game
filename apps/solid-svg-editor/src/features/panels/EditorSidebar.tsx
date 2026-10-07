import { createMemo, For, Show } from 'solid-js';

import type { PanelSection } from '../layout/createPanelSections';
import { PanelTabs } from '../chrome/TopBar';
import { getEditorPanel, type EditorPanelContext } from './panelRegistry';

/**
 * The left column: GodSVG's top section and, when the layout has one, a bottom section below a draggable splitter.
 * Each section shows its panels as tabs. `split` is the top section's share of the height.
 */
export function EditorSidebar(
  props: {
    readonly width: number;
    readonly sections: readonly PanelSection[];
    readonly split: number;
    readonly setSplit: (split: number) => void;
  } & EditorPanelContext
) {
  let column: HTMLElement | undefined;
  const rows = () => (props.sections.length > 1 ? `minmax(0,${props.split}fr) 10px minmax(0,${1 - props.split}fr)` : 'minmax(0,1fr)');

  function resize(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement;

    if (!handle.hasPointerCapture(event.pointerId) || !column) {
      return;
    }

    const box = column.getBoundingClientRect();
    props.setSplit(Math.min(0.85, Math.max(0.15, (event.clientY - box.top) / box.height)));
  }

  return (
    <aside
      ref={(element) => (column = element)}
      class="left-workbench grid min-h-0 max-w-180 min-w-80 py-1.5 pr-0 pl-1.5 [@media(max-width:820px)]:!w-full"
      style={{ width: `${props.width}px`, 'grid-template-rows': rows() }}
      data-testid="left-workbench"
    >
      <For each={props.sections} keyed={(section) => section.id}>
        {(section, index) => {
          // Re-render the content only when the shown panel changes, not on every layout update.
          const active = createMemo(() => section().active);

          return (
          <>
            <Show when={index() > 0}>
              <div
                class="cursor-row-resize touch-none rounded hover:bg-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
                role="separator"
                aria-orientation="horizontal"
                data-testid="sidebar-section-splitter"
                onPointerDown={(event) => {
                  if (event.button === 0) {
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }
                }}
                onPointerMove={resize}
              />
            </Show>
            <section class="grid min-h-0 grid-rows-[31px_minmax(0,1fr)]" data-testid={`sidebar-section-${section().id}`}>
              <PanelTabs panels={section().panels} activePanel={section().active} setActivePanel={(panel) => section().setActive(panel)} />
              {renderPanel(active(), props)}
            </section>
          </>
          );
        }}
      </For>
    </aside>
  );
}

function renderPanel(panel: PanelSection['active'], context: EditorPanelContext) {
  return panel ? getEditorPanel(panel).render(context) : undefined;
}
