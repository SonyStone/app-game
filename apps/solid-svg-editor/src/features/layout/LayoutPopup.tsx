import { Dynamic } from '@solidjs/web';
import { createSignal, For, Show } from 'solid-js';

import { decorativeIconProps } from '../../editor/svg-icon';
import { useI18n } from '../../i18n/I18nProvider';
import ViewportIcon from '../../icons/Viewport.svg';
import { getEditorPanel } from '../panels/panelRegistry';
import { createDismissible } from '../ui/createDismissible';
import { movePart, type LayoutDrop, type LayoutPart, type PanelLayout } from './panel-layout';

/**
 * GodSVG's layout popup: a miniature of the editor where panels are dragged between the left column's top and bottom
 * sections and the excluded strip. Dropping on the top or bottom edge of the column splits it; the canvas keeps its
 * place on the right. Pointer-based, so it works with touch too.
 */
export function LayoutPopup(props: {
  readonly layout: PanelLayout;
  readonly setLayout: (layout: PanelLayout) => void;
  readonly anchor: { readonly left: number; readonly top: number };
  readonly close: () => void;
}) {
  const { t } = useI18n();
  let popup: HTMLDivElement | undefined;
  createDismissible({ open: () => true, container: () => popup, close: () => props.close() });
  const [dragged, setDragged] = createSignal<LayoutPart>();
  const [drop, setDrop] = createSignal<LayoutDrop>();
  const hasBottom = () => props.layout.bottom.length > 0;

  function startDrag(part: LayoutPart, event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDragged(part);
  }

  function moveDrag(event: PointerEvent): void {
    const part = dragged();

    if (part) {
      const candidate = dropAt(event.clientX, event.clientY);
      setDrop(candidate && movePart(props.layout, part, candidate) ? candidate : undefined);
    }
  }

  function endDrag(): void {
    const part = dragged();
    const target = drop();
    setDragged(undefined);
    setDrop(undefined);

    if (part && target) {
      const next = movePart(props.layout, part, target);

      if (next) {
        props.setLayout(next);
      }
    }
  }

  /** The drop under a point: a section edge (split) or an insertion index between the section's parts. */
  function dropAt(x: number, y: number): LayoutDrop | undefined {
    const zone = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-layout-section]');
    const section = zone?.dataset.layoutSection as 'top' | 'bottom' | 'excluded' | undefined;

    if (!zone || !section) {
      return undefined;
    }

    const box = zone.getBoundingClientRect();
    const relativeY = (y - box.top) / box.height;

    if (section === 'top' && relativeY < 0.25) {
      return { kind: 'above' };
    }

    if ((section === 'bottom' || (section === 'top' && !hasBottom())) && relativeY > 0.75) {
      return { kind: 'below' };
    }

    const squares = Array.from(zone.querySelectorAll<HTMLElement>('[data-layout-part]'));
    const index = squares.filter((square) => {
      const rect = square.getBoundingClientRect();
      return rect.left + rect.width / 2 < x;
    }).length;
    return { kind: 'inside', section, index };
  }

  const sectionDrop = (section: 'top' | 'bottom' | 'excluded') => {
    const target = drop();
    return target?.kind === 'inside' && target.section === section ? target.index : undefined;
  };

  function Section(sectionProps: { readonly section: 'top' | 'bottom' | 'excluded'; readonly class: string }) {
    return (
      <div
        class={[
          'relative flex items-center gap-1 rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] p-1',
          sectionProps.class,
          {
            'border-t-2 border-t-[var(--ok)]': drop()?.kind === 'above' && sectionProps.section === 'top',
            'border-b-2 border-b-[var(--ok)]':
              drop()?.kind === 'below' && (sectionProps.section === 'bottom' || (sectionProps.section === 'top' && !hasBottom())),
            'border-[var(--ok)]': sectionDrop(sectionProps.section) !== undefined
          }
        ]}
        data-layout-section={sectionProps.section}
        data-testid={`layout-section-${sectionProps.section}`}
      >
        <For each={props.layout[sectionProps.section]}>
          {(part, index) => (
            <>
              <Show when={sectionDrop(sectionProps.section) === index()}>
                <span class="h-6 w-0.5 rounded bg-[var(--ok)]" />
              </Show>
              <button
                type="button"
                class={[
                  'grid h-7.5 w-7.5 cursor-grab touch-none place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel)] hover:border-[var(--accent)]',
                  { 'opacity-40': dragged() === part }
                ]}
                title={`${t(getEditorPanel(part).label)}\n${t('Drag and drop to change the layout')}`}
                aria-label={t(getEditorPanel(part).label)}
                data-layout-part={part}
                data-testid={`layout-part-${part}`}
                onPointerDown={(event) => startDrag(part, event)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={() => {
                  setDragged(undefined);
                  setDrop(undefined);
                }}
              >
                <Dynamic component={getEditorPanel(part).icon} {...decorativeIconProps} />
              </button>
            </>
          )}
        </For>
        <Show when={sectionDrop(sectionProps.section) === props.layout[sectionProps.section].length}>
          <span class="h-6 w-0.5 rounded bg-[var(--ok)]" />
        </Show>
      </div>
    );
  }

  return (
    <div
      ref={(element) => (popup = element)}
      class="popover fixed z-50 grid w-56 gap-1.5 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_96%,#000)] p-2 shadow-[0_12px_28px_#0008]"
      style={{ left: `${props.anchor.left}px`, top: `${props.anchor.top}px` }}
      data-testid="layout-popup"
    >
      <div class="text-center text-[12px] text-[var(--muted)]">{t('Layout')}:</div>
      <div class="grid h-34 grid-cols-2 gap-1">
        <div class={['grid gap-1', hasBottom() ? 'grid-rows-2' : 'grid-rows-1']}>
          <Section section="top" class="justify-center" />
          <Show when={hasBottom()}>
            <Section section="bottom" class="justify-center" />
          </Show>
        </div>
        <div
          class="grid place-items-center rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] text-[var(--muted)] opacity-70"
          title={t('Canvas')}
        >
          <ViewportIcon {...decorativeIconProps} />
        </div>
      </div>
      <div class="text-[11px] text-[var(--muted)]">{t('Excluded')}</div>
      <Section section="excluded" class="min-h-9.5" />
    </div>
  );
}
