import { createMutationObserver } from '@solid-primitives/mutation-observer';
import { isServer, type JSX } from '@solidjs/web';
import { createEffect, createSignal, untrack, type Accessor } from 'solid-js';

/** Consistent demo layout with a live preview, controls, and a focused API excerpt. */
export function ExampleCard(props: {
  id: string;
  number: string;
  title: string;
  tag: string;
  description: string;
  preview: JSX.Element;
  children: JSX.Element;
  code: string;
  hint: string;
}) {
  return (
    <section id={props.id} data-example={props.id} class="pp-card">
      <header class="pp-card-heading">
        <span class="pp-number">{props.number}</span>
        <div>
          <div class="pp-title-row">
            <h2>{props.title}</h2>
            <span class="pp-tag">{props.tag}</span>
          </div>
          <p>{props.description}</p>
        </div>
      </header>
      <div class="pp-demo">
        <div class="pp-preview">
          <span class="pp-label">Live target</span>
          {props.preview}
        </div>
        <div class="pp-controls">
          <span class="pp-label">Try it</span>
          {props.children}
          <p class="pp-hint">{props.hint}</p>
        </div>
      </div>
      <details class="pp-code">
        <summary>
          View code <span>Focused example</span>
        </summary>
        <pre>
          <code>{props.code}</code>
        </pre>
      </details>
    </section>
  );
}

/** Accessible native checkbox styled as a switch, with optional supporting text. */
export function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  detail?: string;
}) {
  return (
    <label class="pp-toggle">
      <span>
        <strong>{props.label}</strong>
        {props.detail && <small>{props.detail}</small>}
      </span>
      <input
        type="checkbox"
        aria-label={props.label}
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

/** Shows observed target state rather than predicting a winning layer from control values. */
export function DOMValue(props: { label: string; value: string }) {
  return (
    <div class="pp-readout">
      <span>{props.label}</span>
      <output>{props.value}</output>
    </div>
  );
}

/** Observes attribute-backed state; target replacement reconnects the existing owned observer. */
export function createDOMValue<T extends Element>(target: Accessor<T | undefined>, read: (element: T) => string) {
  const [value, setValue] = createSignal('waiting for target');
  const [add, { stop }] = createMutationObserver([], { attributes: true }, () => {
    const element = untrack(target);
    if (element) setValue(read(element));
  });
  createEffect(
    () => (isServer ? undefined : target()),
    (element) => {
      stop();
      setValue(element ? read(element) : 'waiting for target');
      if (element) add(element);
      return stop;
    }
  );
  return value;
}
