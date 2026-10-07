import { createElementSize, createWindowSize } from '@solid-primitives/resize-observer';
import { Dynamic, type JSX } from '@solidjs/web';
import { createSignal, For } from 'solid-js';

import { decorativeIconProps } from '../../editor/svg-icon';
import type { ShortcutPanelSettings } from '../../editor/types';
import { useI18n } from '../../i18n/I18nProvider';
import ConfigIcon from '../../icons/Config.svg';
import type { ShortcutDescriptor } from '../shortcuts/shortcutRegistry';
import { actionIcon } from './action-icons';

/**
 * GodSVG's shortcut panel: a floating bar of action buttons for touch screens. It is dragged by its dotted handle and
 * keeps its place relative to the window as the window resizes; the gear opens its configuration. Buttons run their
 * action without taking focus, so Undo or Evaluate still act on the focused text field.
 */
export function ShortcutPanel(props: {
  readonly settings: ShortcutPanelSettings;
  readonly descriptors: readonly ShortcutDescriptor[];
  readonly openConfig: () => void;
}) {
  const { t } = useI18n();
  const [panel, setPanel] = createSignal<HTMLElement>();
  const size = createElementSize(panel);
  const window = createWindowSize();
  // Position as a fraction of the free space, like GodSVG: centered near the bottom, or bottom-right when vertical.
  const [relative, setRelative] = createSignal(
    props.settings.layout === 'vertical-strip' ? { x: 0.95, y: 0.9 } : { x: 0.5, y: 0.9 }
  );
  const free = () => ({ width: Math.max(0, window.width - (size.width ?? 0)), height: Math.max(0, window.height - (size.height ?? 0)) });
  const buttons = () =>
    props.settings.slots.flatMap((id) => {
      const descriptor = id ? props.descriptors.find((item) => item.id === id) : undefined;
      return descriptor ? [descriptor] : [];
    });
  const vertical = () => props.settings.layout === 'vertical-strip';
  let dragOffset = { x: 0, y: 0 };

  function startDrag(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    const box = panel()?.getBoundingClientRect();
    dragOffset = { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent): void {
    if (!(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) {
      return;
    }

    const area = free();
    setRelative({
      x: area.width > 0 ? clamp01((event.clientX - dragOffset.x) / area.width) : 0,
      y: area.height > 0 ? clamp01((event.clientY - dragOffset.y) / area.height) : 0
    });
  }

  return (
    <div
      ref={setPanel}
      class={[
        'fixed z-40 flex items-center gap-1.5 rounded-md border border-[var(--soft-border)] bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] shadow-[0_8px_24px_#0007]',
        { 'flex-col': vertical() }
      ]}
      style={{ left: `${relative().x * free().width}px`, top: `${relative().y * free().height}px` }}
      data-testid="shortcut-panel"
    >
      <div
        class={[
          'flex cursor-grab touch-none items-center justify-center self-stretch text-[var(--muted)] active:cursor-grabbing',
          vertical() ? 'h-7.5 w-full' : 'w-7.5'
        ]}
        data-testid="shortcut-panel-handle"
        onPointerDown={startDrag}
        onPointerMove={drag}
      >
        <div
          class={[
            '[background:radial-gradient(circle,currentColor_1.5px,transparent_2px)_0_0/8px_8px] opacity-70',
            vertical() ? 'h-4 w-6' : props.settings.layout === 'horizontal-two-rows' ? 'h-14 w-4' : 'h-6 w-4'
          ]}
        />
      </div>
      <PanelButton label={t('Configure Shortcut Panel')} testId="shortcut-panel-config" onRun={props.openConfig}>
        <ConfigIcon {...decorativeIconProps} />
      </PanelButton>
      <div
        class={[
          'm-1 gap-1',
          vertical() ? 'flex flex-col' : props.settings.layout === 'horizontal-two-rows' ? 'grid grid-cols-3' : 'flex'
        ]}
      >
        <For each={buttons()}>
          {(descriptor) => (
            <PanelButton label={t(descriptor.action)} testId={`shortcut-panel-button-${descriptor.id}`} onRun={() => descriptor.run(undefined)}>
              <Dynamic component={actionIcon(descriptor.id)} {...decorativeIconProps} />
            </PanelButton>
          )}
        </For>
      </div>
    </div>
  );
}

/** A panel button; pressing it never moves focus away from the field being edited. */
function PanelButton(props: { readonly label: string; readonly testId: string; readonly onRun: () => void; readonly children: JSX.Element }) {
  return (
    <button
      type="button"
      class="grid h-7.5 w-7.5 cursor-pointer place-items-center rounded-[5px] border border-transparent bg-transparent text-[var(--text)] hover:border-[var(--soft-border)] hover:bg-[var(--panel-2)]"
      title={props.label}
      aria-label={props.label}
      data-testid={props.testId}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => props.onRun()}
    >
      {props.children}
    </button>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
