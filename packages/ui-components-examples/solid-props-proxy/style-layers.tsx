import { PropsProxy } from '@app-game/solid-props-proxy';
import { createSignal, Show } from 'solid-js';
import { createDOMValue, DOMValue, ExampleCard, Toggle } from './playground-ui';

/** Demonstrates stable layer order and cleanup without removing or recreating the target. */
export function StyleLayersExample() {
  const [target, setTarget] = createSignal<HTMLDivElement>();
  const [a, setA] = createSignal(false);
  const [b, setB] = createSignal(false);
  const [offset, setOffset] = createSignal(48);
  const actual = createDOMValue(target, (element) => element.style.transform || 'none');
  return (
    <ExampleCard
      id="style-layers"
      number="01"
      title="One target. Two owners."
      tag="Style layers"
      description="Each behavior owns a temporary transform. The last mounted layer wins; updating a lower layer keeps its position."
      hint="Enable A, then B. Move A's slider, then remove A first. B stays in place. Re-enabling a layer mounts it on top."
      code={`<Show when={a()}>
  <PropsProxy target={target()}
    style={{ transform: \`translateX(\${offset()}px)\` }} />
</Show>
<Show when={b()}>
  <PropsProxy target={target()}
    style={{ transform: 'translateX(120px)' }} />
</Show>`}
      preview={
        <>
          <div class="pp-track">
            <div ref={setTarget} class="pp-token" style={{ transform: 'translateX(0px)' }}>
              target
            </div>
          </div>
          <div class="pp-scale">
            <span>base · 0 px</span>
            <span>B · 120 px</span>
          </div>
          <DOMValue label="style.transform" value={actual()} />
        </>
      }
    >
      <Toggle label="Layer A" detail="Adjustable transform" checked={a()} onChange={setA} />
      <label class="pp-range">
        A offset <output>{offset()} px</output>
        <input
          aria-label="Layer A offset"
          type="range"
          min="0"
          max="120"
          value={offset()}
          onInput={(event) => setOffset(Number(event.currentTarget.value))}
        />
      </label>
      <Toggle label="Layer B" detail="Fixed at 120 px" checked={b()} onChange={setB} />
      <Show when={a()}>
        <PropsProxy target={target()} style={{ transform: `translateX(${offset()}px)` }} />
      </Show>
      <Show when={b()}>
        <PropsProxy target={target()} style={{ transform: 'translateX(120px)' }} />
      </Show>
    </ExampleCard>
  );
}
