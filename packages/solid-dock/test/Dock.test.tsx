import { render } from '@solidjs/web';
import { createSignal, createStore, flush, For, onCleanup, Show } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDockState, Dock, movePanel } from '../src';

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = '';
});

function mountDock() {
  const [state, setState] = createStore(
    createDockState({
      row: [
        { id: 'a', group: ['one', 'two'] },
        { id: 'b', group: ['three'] }
      ]
    })
  );
  const [showExtra, setShowExtra] = createSignal(false);
  const mounts: string[] = [];
  const unmounts: string[] = [];

  function Content(props: { name: string }) {
    mounts.push(props.name);
    onCleanup(() => unmounts.push(props.name));
    return <p data-content={props.name}>{props.name}</p>;
  }

  dispose = render(
    () => (
      <Dock.Root
        state={state}
        setState={setState}
        data-testid="root"
        panels={
          <>
            <Dock.Panel id="one" title="One">
              <Content name="one" />
            </Dock.Panel>
            <Dock.Panel id="two" title="Two" closable>
              <Content name="two" />
            </Dock.Panel>
            <Dock.Panel id="three">
              <Content name="three" />
            </Dock.Panel>
            <Show when={showExtra()}>
              <Dock.Panel id="extra" title="Extra">
                <Content name="extra" />
              </Dock.Panel>
            </Show>
          </>
        }
      >
        <Dock.Windows>
          {(group) => (
            <section {...group.props} data-group={group.id}>
              <div ref={group.tabListRef}>
                <For each={group.panels()}>
                  {(panelId) => (
                    <Dock.Tab id={panelId}>
                      {(tab) => (
                        <button {...tab.props} data-tab={panelId} data-active={tab.active()}>
                          {tab.title()}
                        </button>
                      )}
                    </Dock.Tab>
                  )}
                </For>
              </div>
              <div ref={group.contentRef} />
            </section>
          )}
        </Dock.Windows>
        <Dock.Sashes>{(sash) => <div {...sash.props} data-sash />}</Dock.Sashes>
        <Dock.Panels />
      </Dock.Root>
    ),
    document.body
  );
  flush();

  return { state, setState, setShowExtra, mounts, unmounts };
}

const tabs = (groupId: string) =>
  [...document.querySelectorAll(`[data-group="${groupId}"] [data-tab]`)].map((tab) => tab.textContent);

describe('Dock', () => {
  it('renders groups with declared titles and mounts each open panel once', () => {
    const { mounts } = mountDock();

    expect(tabs('a')).toEqual(['One', 'Two']);
    expect(tabs('b')).toEqual(['three']);
    expect(mounts).toEqual(['one', 'two', 'three']);
    expect(document.querySelector('[data-tab="one"]')).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('[data-tab="two"]')).toHaveAttribute('aria-selected', 'false');
  });

  it('renders one sash per gap and marks windows for animation', () => {
    mountDock();

    expect(document.querySelectorAll('[data-sash]')).toHaveLength(1);
    expect(document.querySelector('[data-group="a"]')).toHaveAttribute('data-dock-flip', 'group:a');
  });

  it('keeps panel content mounted when the store moves it to another group', () => {
    const { setState, mounts, unmounts } = mountDock();
    const content = document.querySelector('[data-content="two"]');

    setState((draft) => movePanel(draft, 'two', { type: 'group', groupId: 'b', zone: 'center' }));
    flush();

    expect(tabs('a')).toEqual(['One']);
    expect(tabs('b')).toEqual(['three', 'Two']);
    expect(document.querySelector('[data-content="two"]')).toBe(content);
    expect(mounts).toEqual(['one', 'two', 'three']);
    expect(unmounts).toEqual([]);
  });

  it('unmounts closed panels and mounts panels added to the state', () => {
    const { setState, setShowExtra, mounts, unmounts } = mountDock();

    setState((draft) => {
      const group = draft.nodes.a;
      if (group.type === 'group') {
        group.panels = ['one'];
      }
    });
    flush();
    expect(unmounts).toEqual(['two']);

    setShowExtra(true);
    flush();
    expect(mounts).toEqual(['one', 'two', 'three']);

    setState((draft) => {
      const group = draft.nodes.b;
      if (group.type === 'group') {
        group.panels.push('extra');
      }
    });
    flush();
    expect(tabs('b')).toEqual(['three', 'Extra']);
    expect(mounts).toEqual(['one', 'two', 'three', 'extra']);
  });

  it('measures slots after every layout change, including one that follows a new root', () => {
    const { setState } = mountDock();
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');

    // Wraps the root row in a new column split, so `root` changes and nodes are added.
    setState((draft) => movePanel(draft, 'three', { type: 'root', edge: 'bottom' }));
    flush();
    expect(measure).toHaveBeenCalled();

    measure.mockClear();
    setState((draft) => movePanel(draft, 'two', { type: 'group', groupId: 'a', zone: 'right' }));
    flush();
    expect(measure).toHaveBeenCalled();

    measure.mockRestore();
  });
});
