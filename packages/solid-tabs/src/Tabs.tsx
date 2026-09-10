import type { JSX } from '@solidjs/web';
import { For } from 'solid-js';
import { createTabs, type TabItem, type TabsOptions } from './createTabs';

/** Optional part classes and card variables supply a skin without replacing structural geometry. */
export type TabsProps<T extends TabItem> = TabsOptions<T> & {
  label: string;
  getLabel: (item: T) => string;
  renderTab: (item: T) => JSX.Element;
  children: (item: T, active: () => boolean, next: () => void) => JSX.Element;
  class?: string;
  classes?: Partial<Record<'list' | 'card' | 'trigger' | 'panel' | 'echo', string>>;
  cardClass?: (item: T) => string;
  cardStyle?: (item: T) => JSX.CSSProperties;
  /** Optional rail buttons or other controls; mark interactive groups data-tabs-no-drag. */
  controls?: (state: ReturnType<typeof createTabs<T>>) => JSX.Element;
};

/** Styled by the caller; behavior and required geometry come from createTabs and CSS Modules. */
export function Tabs<T extends TabItem>(props: TabsProps<T>) {
  const state = createTabs(props);
  return (
    <div
      {...state.rootProps()}
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
      <For each={state.departingItems()}>
        {(item) => (
          <div
            {...state.echoProps(item)}
            class={`${state.echoProps(item).class} ${props.classes?.card ?? ''} ${props.classes?.echo ?? ''} ${props.cardClass?.(item) ?? ''}`}
            style={{ ...props.cardStyle?.(item), ...state.echoProps(item).style }}
          >
            <div
              data-tabs-trigger=""
              class={`${state.triggerProps(item).class} ${props.classes?.trigger ?? ''}`}
              style={state.triggerProps(item).style}
            >
              {props.renderTab(item)}
            </div>
            <div
              data-tabs-panel=""
              class={`${state.panelProps(item).class} ${props.classes?.panel ?? ''}`}
              ref={(el) => state.snapshot(item.id, el)}
            />
          </div>
        )}
      </For>
    </div>
  );
}
