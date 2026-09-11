import type { JSX } from '@solidjs/web';
import { createSignal, For, Show } from 'solid-js';
import { createCardStack, type CardStackItem, type CardStackOptions } from './createCardStack';
import { CardStackDebug } from './debug/CardStackDebug';

/** Optional part classes and card variables supply a skin without replacing structural geometry. */
export type CardStackProps<T extends CardStackItem> = CardStackOptions<T> & {
  label: string;
  getLabel: (item: T) => string;
  renderTab: (item: T) => JSX.Element;
  children: (item: T, active: () => boolean, next: () => void) => JSX.Element;
  class?: string;
  classes?: Partial<Record<'list' | 'card' | 'trigger' | 'panel', string>>;
  cardClass?: (item: T) => string;
  cardStyle?: (item: T) => JSX.CSSProperties;
  /** Optional rail buttons or other controls; mark interactive groups data-tabs-no-drag. */
  controls?: (state: ReturnType<typeof createCardStack<T>>) => JSX.Element;
  /** Opt-in docked motion inspector outside the deck gesture targets. Defaults false. */
  debug?: boolean;
};

/** Styled by the caller; behavior and required geometry come from createCardStack and CSS Modules. */
export function CardStack<T extends CardStackItem>(props: CardStackProps<T>) {
  const state = createCardStack(props);
  const [root, setRoot] = createSignal<HTMLDivElement>();
  return (
    <>
      <div
        {...state.rootProps()}
        ref={(element) => {
          state.rootProps().ref(element);
          setRoot(element);
        }}
        class={`${state.rootProps().class} ${props.class ?? ''} ${state.rootProps()['data-dragging'] !== undefined ? 'is-dragging' : ''} ${state.rootProps()['data-direct'] !== undefined ? 'is-rail-direct' : ''}`}
      >
        {props.controls?.(state)}
        <div
          {...state.listProps()}
          class={`${state.listProps().class} ${props.classes?.list ?? ''}`}
          aria-label={props.label}
        />
        <For each={props.items}>
          {(item) => (
            <div
              {...state.cardProps(item)}
              class={`${state.cardProps(item).class} ${props.classes?.card ?? ''} ${props.cardClass?.(item) ?? ''} ${state.activeId() === item.id ? 'is-active' : ''} ${state.cardProps(item)['data-revealed'] !== undefined ? 'is-revealed' : ''} ${state.cardProps(item)['data-phase'] ? 'is-' + state.cardProps(item)['data-phase'] : ''}`}
              style={{ ...props.cardStyle?.(item), ...state.cardProps(item).style }}
            >
              <button
                {...state.triggerProps(item)}
                class={`${state.triggerProps(item).class} ${props.classes?.trigger ?? ''}`}
                aria-label={props.getLabel(item)}
              >
                {props.renderTab(item)}
              </button>
              <section
                {...state.panelProps(item)}
                class={`${state.panelProps(item).class} ${props.classes?.panel ?? ''}`}
              >
                {props.children(item, () => state.activeId() === item.id, state.next)}
              </section>
            </div>
          )}
        </For>
      </div>
      <Show when={props.debug}>
        <CardStackDebug target={root} label={props.label} />
      </Show>
    </>
  );
}
