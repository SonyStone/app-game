import { PropsProxy } from '@app-game/solid-props-proxy';
import { createSignal, Show } from 'solid-js';
import { createDOMValue, DOMValue, ExampleCard, Toggle } from './playground-ui';

/** A single inspector behavior follows selection across persistent elements. */
export function TargetHandoffExample() {
  const [first, setFirst] = createSignal<HTMLButtonElement>();
  const [second, setSecond] = createSignal<HTMLButtonElement>();
  const [selected, setSelected] = createSignal<'a' | 'b'>('a');
  const [enabled, setEnabled] = createSignal(false);
  const [events, setEvents] = createSignal(0);
  const firstState = createDOMValue(first, (element) => element.getAttribute('data-inspected') ?? 'base');
  const secondState = createDOMValue(second, (element) => element.getAttribute('data-inspected') ?? 'base');
  return (
    <ExampleCard
      id="target-handoff"
      number="04"
      title="Follow the selection"
      tag="Target replacement"
      description="An inspector follows the selected node. The previous node loses its temporary styling and handler."
      hint="Enable inspection, switch to B, then click both targets. Only the selected one increments the counter."
      code={`createPropsProxy(
  () => selected() === 'a' ? first() : second(),
  { 'data-inspected': 'active', onClick: inspect }
);`}
      preview={
        <>
          <div class="pp-targets">
            <button ref={setFirst} class="pp-select-target">
              Element A
            </button>
            <button ref={setSecond} class="pp-select-target">
              Element B
            </button>
          </div>
          <DOMValue label="A / B" value={`${firstState()} / ${secondState()}`} />
          <DOMValue label="Inspector events" value={String(events())} />
        </>
      }
    >
      <Toggle label="Enable inspection" checked={enabled()} onChange={setEnabled} />
      <div class="pp-segment" aria-label="Inspector target">
        <button aria-pressed={selected() === 'a' ? 'true' : 'false'} onClick={() => setSelected('a')}>
          Target A
        </button>
        <button aria-pressed={selected() === 'b' ? 'true' : 'false'} onClick={() => setSelected('b')}>
          Target B
        </button>
      </div>
      <Show when={enabled()}>
        <PropsProxy
          target={selected() === 'a' ? first() : second()}
          data-inspected="active"
          style={{ 'border-color': 'var(--pp-accent)', color: 'var(--pp-accent)' }}
          onClick={() => setEvents((value) => value + 1)}
        />
      </Show>
    </ExampleCard>
  );
}
