import type { JSX } from '@solidjs/web';
import { createSignal, Show, untrack } from 'solid-js';

/** A settings section with independent disclosure and optional feature enablement. */
export type CollapsibleSectionProps = {
  id: string;
  title: string;
  children: JSX.Element;
  enabled?: boolean;
  onToggleEnabled?: (enabled: boolean) => void;
  /** Sections start expanded unless explicitly disabled. */
  defaultOpen?: boolean;
};

/** Keeps settings mounted while collapsed, preserving their local state. */
export function CollapsibleSection(props: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = createSignal(untrack(() => props.defaultOpen ?? true));

  return (
    <section id={`section-${props.id}`} class="bg-ps-bg-dark border-ps-border overflow-hidden rounded-lg border">
      <div class="text-ps-text-bright flex items-center gap-3 px-4">
        <Show when={props.onToggleEnabled}>
          <input
            type="checkbox"
            aria-label={`Enable ${props.title}`}
            checked={props.enabled}
            onChange={(event) => props.onToggleEnabled?.(event.currentTarget.checked)}
            class="border-ps-border bg-ps-bg-dark checked:bg-ps-accent h-4 w-4 rounded"
          />
        </Show>
        <button
          type="button"
          aria-expanded={isOpen() ? 'true' : 'false'}
          aria-controls={`content-${props.id}`}
          onClick={() => setIsOpen(!isOpen())}
          class="flex flex-1 items-center justify-between py-3 text-left text-sm font-medium"
        >
          <span class={props.onToggleEnabled && !props.enabled ? 'opacity-50' : ''}>{props.title}</span>
          <svg
            class={`h-4 w-4 transition-transform ${isOpen() ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      <div id={`content-${props.id}`} hidden={!isOpen()} class="border-ps-border border-t px-4 py-3">
        <div class={props.onToggleEnabled && !props.enabled ? 'pointer-events-none opacity-50' : ''}>
          {props.children}
        </div>
      </div>
    </section>
  );
}
