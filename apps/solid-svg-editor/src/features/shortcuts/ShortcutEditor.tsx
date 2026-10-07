import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, For, Show } from 'solid-js';

import type { ShortcutBinding } from '../../editor/types';
import { bindingFromEvent, formatBinding, sameBinding, type ShortcutDescriptor } from './shortcutRegistry';

/** Most bindings one action can have, as in GodSVG's shortcut settings. */
export const maxBindingsPerAction = 3;

/**
 * GodSVG's shortcut settings: actions grouped by category, each with up to `maxBindingsPerAction` bindings. Clicking
 * a binding (or the empty slot) waits for the next key press and assigns it; Escape or leaving the button cancels.
 * Bindings shared with another action are marked. `setBindings(id, undefined)` restores an action's defaults, and
 * edits that end equal to the defaults are passed as `undefined` too.
 */
export function ShortcutEditor(props: {
  readonly descriptors: readonly ShortcutDescriptor[];
  readonly setBindings: (id: string, bindings: readonly ShortcutBinding[] | undefined) => void;
}) {
  const categories = () => [...new Set(props.descriptors.map((item) => item.category))].sort((a, b) => categoryRank(a) - categoryRank(b));
  const [category, setCategory] = createSignal(categories()[0] ?? '');
  const [listening, setListening] = createSignal<{ readonly id: string; readonly index: number }>();

  // Capture phase on window runs before the dialog's Escape handler and the editor's own shortcuts.
  createEventListener(
    window,
    'keydown',
    (event) => {
      const slot = listening();

      if (!slot) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setListening(undefined);
        return;
      }

      const binding = bindingFromEvent(event);
      const descriptor = props.descriptors.find((item) => item.id === slot.id);

      if (!binding || !descriptor) {
        return;
      }

      setListening(undefined);
      assign(descriptor, slot.index, binding);
    },
    { capture: true }
  );

  function assign(descriptor: ShortcutDescriptor, index: number, binding: ShortcutBinding): void {
    const current = descriptor.bindings;

    if (current.some((item, itemIndex) => itemIndex !== index && sameBinding(item, binding))) {
      return;
    }

    const next = index < current.length ? current.map((item, itemIndex) => (itemIndex === index ? binding : item)) : [...current, binding];
    update(descriptor, next);
  }

  function update(descriptor: ShortcutDescriptor, bindings: readonly ShortcutBinding[]): void {
    props.setBindings(descriptor.id, sameBindings(bindings, descriptor.defaultBindings) ? undefined : bindings);
  }

  /** Other actions that one of this action's bindings also triggers. */
  function conflicts(descriptor: ShortcutDescriptor, binding: ShortcutBinding): readonly string[] {
    return props.descriptors
      .filter((item) => item.id !== descriptor.id && item.bindings.some((other) => sameBinding(other, binding)))
      .map((item) => item.action);
  }

  return (
    <div class="grid gap-2" data-testid="shortcut-editor">
      <div class="flex flex-wrap gap-1" role="tablist">
        <For each={categories()}>
          {(item) => (
            <button
              type="button"
              role="tab"
              aria-selected={category() === item ? 'true' : 'false'}
              class="cursor-pointer rounded border border-[var(--soft-border)] px-2 py-0.5 capitalize aria-selected:border-[var(--accent)] aria-selected:text-[var(--accent)]"
              data-testid={`shortcut-category-${item}`}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          )}
        </For>
      </div>
      <table class="shortcut-table w-full border-collapse" data-testid="shortcut-table">
        <tbody>
          <For each={props.descriptors.filter((item) => item.category === category())}>
            {(descriptor) => (
              <tr data-testid={`shortcut-row-${descriptor.id}`}>
                <td class="border-b border-b-[var(--soft-border)] px-2 py-1.5">{descriptor.action}</td>
                <td class="border-b border-b-[var(--soft-border)] px-2 py-1.5">
                  <Show when={descriptor.editable} fallback={<span class={keycap}>{descriptor.keys}</span>}>
                    <div class="flex flex-wrap items-center gap-1">
                      <For each={slotsOf(descriptor.bindings)}>
                        {(binding, index) => {
                          const isListening = () => listening()?.id === descriptor.id && listening()?.index === index();
                          const shared = () => (binding ? conflicts(descriptor, binding) : []);

                          return (
                            <span class="inline-flex items-center">
                              <button
                                type="button"
                                class={[
                                  keycap,
                                  'min-w-12 cursor-pointer hover:border-[var(--accent)]',
                                  {
                                    'border-[var(--accent)]! text-[var(--accent)]': isListening(),
                                    'border-[#f44]!': shared().length > 0,
                                    'text-[var(--muted)]': !binding && !isListening()
                                  }
                                ]}
                                title={shared().length > 0 ? `Also used by: ${shared().join(', ')}` : undefined}
                                data-testid={`shortcut-binding-${descriptor.id}-${index()}`}
                                onClick={() => setListening(isListening() ? undefined : { id: descriptor.id, index: index() })}
                                onBlur={() => isListening() && setListening(undefined)}
                              >
                                {isListening() ? 'Press keys…' : binding ? formatBinding(binding) : '+'}
                              </button>
                              <Show when={binding}>
                                <button
                                  type="button"
                                  class="ml-0.5 cursor-pointer px-0.5 text-[var(--muted)] hover:text-[var(--text)]"
                                  aria-label={`Remove ${binding ? formatBinding(binding) : ''}`}
                                  data-testid={`shortcut-remove-${descriptor.id}-${index()}`}
                                  onClick={() => update(descriptor, descriptor.bindings.filter((_, itemIndex) => itemIndex !== index()))}
                                >
                                  ×
                                </button>
                              </Show>
                            </span>
                          );
                        }}
                      </For>
                      <Show when={!sameBindings(descriptor.bindings, descriptor.defaultBindings)}>
                        <button
                          type="button"
                          class="cursor-pointer text-[11px] text-[var(--accent)] hover:underline"
                          data-testid={`shortcut-reset-${descriptor.id}`}
                          onClick={() => props.setBindings(descriptor.id, undefined)}
                        >
                          Reset
                        </button>
                      </Show>
                    </div>
                  </Show>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

const keycap =
  "inline-block rounded border border-[var(--soft-border)] bg-[#080b12] px-1.5 py-0.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] in-[.theme-light]:bg-[#f8fbff]";

/** GodSVG's category order; unknown categories go last. */
function categoryRank(category: string): number {
  const rank = ['file', 'edit', 'view', 'tool', 'help'].indexOf(category);
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}

/** The bindings plus one empty slot while there is room for another. */
function slotsOf(bindings: readonly ShortcutBinding[]): readonly (ShortcutBinding | undefined)[] {
  return bindings.length < maxBindingsPerAction ? [...bindings, undefined] : bindings;
}

function sameBindings(a: readonly ShortcutBinding[], b: readonly ShortcutBinding[]): boolean {
  return a.length === b.length && a.every((binding, index) => sameBinding(binding, b[index] as ShortcutBinding));
}
