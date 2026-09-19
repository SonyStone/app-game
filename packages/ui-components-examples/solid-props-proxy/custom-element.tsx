import { PropsProxy } from '@app-game/solid-props-proxy';
import { createEffect, createSignal, Show } from 'solid-js';
import { createDOMValue, DOMValue, ExampleCard, Toggle } from './playground-ui';

/** Exercises a custom element's reversible public property without reaching into its shadow root. */
export function CustomElementExample() {
  const [host, setHost] = createSignal<HTMLDivElement>();
  const [target, setTarget] = createSignal<HTMLElement>();
  const [enabled, setEnabled] = createSignal(false);
  const state = createDOMValue(target, (element) => element.dataset.mode ?? 'edit');
  createEffect(host, (container) => {
    if (!container) return;
    registerReviewPanel();
    const element = container.ownerDocument.createElement('props-proxy-review-panel');
    container.append(element);
    setTarget(element);
    return () => {
      setTarget(undefined);
      element.remove();
    };
  });
  return (
    <ExampleCard
      id="custom-element"
      number="07"
      title="Use the public property"
      tag="Custom elements"
      description="An initialized web component exposes a reviewMode setter. The proxy changes that property and its accent variable."
      hint="Switch review mode on and off. The component updates its own shadow DOM; cleanup calls its setter with the original value."
      code={`<PropsProxy target={panel()}
  prop:reviewMode={true}
  style={{ '--panel-accent': '#e8b86c' }}
/>`}
      preview={
        <>
          <div ref={setHost} class="pp-custom-host" />
          <DOMValue label="Component mode" value={state()} />
        </>
      }
    >
      <Toggle label="Review mode" checked={enabled()} onChange={setEnabled} />
      <p class="pp-note">The component is registered once. Each mounted example owns a separate instance.</p>
      <Show when={enabled()}>
        <PropsProxy target={target()} prop:reviewMode={true} style={{ '--panel-accent': '#e8b86c' }} />
      </Show>
    </ExampleCard>
  );
}

/** Registers this demo-only component in the browser; its setter owns the rendered mode. */
function registerReviewPanel() {
  if (customElements.get('props-proxy-review-panel')) return;
  customElements.define(
    'props-proxy-review-panel',
    class extends HTMLElement {
      #review = false;
      #label: HTMLElement;
      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'closed' });
        const style = document.createElement('style');
        style.textContent =
          ':host{display:block;--panel-accent:#82d8c8}article{border:1px solid var(--panel-accent);border-radius:12px;padding:26px;background:#141d25;color:#e8edf4;font:14px system-ui}small{color:#9aa8b8}h3{color:var(--panel-accent);font-size:22px;margin:14px 0}p{margin:0;color:#a8b5c4;line-height:1.6}';
        const article = document.createElement('article');
        const small = document.createElement('small');
        small.textContent = '<review-panel> · closed shadow root';
        this.#label = document.createElement('h3');
        this.#label.textContent = 'Edit mode';
        const note = document.createElement('p');
        note.textContent = 'This content is rendered by the web component.';
        article.append(small, this.#label, note);
        shadow.append(style, article);
      }
      get reviewMode() {
        return this.#review;
      }
      set reviewMode(value: boolean) {
        this.#review = value;
        this.dataset.mode = value ? 'review' : 'edit';
        this.#label.textContent = value ? 'Review mode' : 'Edit mode';
      }
    }
  );
}
