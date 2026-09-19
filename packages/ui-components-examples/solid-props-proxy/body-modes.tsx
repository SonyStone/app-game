import { createPropsProxy } from '@app-game/solid-props-proxy';
import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, Show } from 'solid-js';
import { createDOMValue, DOMValue, ExampleCard, Toggle } from './playground-ui';

/** Independent interaction modes temporarily share the page body without owning its render. */
export function BodyModesExample() {
  const [pan, setPan] = createSignal(false);
  const [pick, setPick] = createSignal(false);
  const cursor = createDOMValue(
    () => document.body,
    (element) => element.style.cursor || 'default'
  );
  return (
    <ExampleCard
      id="body-modes"
      number="02"
      title="Share the page, keep ownership"
      tag="Body + events"
      description="Pan and pick modes share document.body. Window and document events use an owned event-listener primitive."
      hint="Enable pan, then pick. Disable pan first: pick remains active. Escape or window blur exits pick."
      code={`createPropsProxy(() => document.body, {
  style: { cursor: 'crosshair', 'user-select': 'none' }
});
createEventListener(() => window, 'blur', exit);
createEventListener(() => document, 'keydown', event => {
  if (event.key === 'Escape') exit();
});`}
      preview={
        <>
          <div class="pp-body-surface">
            <span class="pp-label">document.body</span>
            <strong>Move your cursor here</strong>
            <p>
              Modes belong to different owners.
              <br />
              The page remains the same element.
            </p>
            <kbd>esc</kbd>
            <span class="pp-muted">exit pick mode</span>
          </div>
          <DOMValue label="body.style.cursor" value={cursor()} />
        </>
      }
    >
      <Toggle label="Pan mode" detail="Adds a grab cursor" checked={pan()} onChange={setPan} />
      <Toggle label="Pick mode" detail="Adds crosshair + disables selection" checked={pick()} onChange={setPick} />
      <Show when={pan()}>
        <BodyCursor cursor="grab" />
      </Show>
      <Show when={pick()}>
        <PickMode exit={() => setPick(false)} />
      </Show>
    </ExampleCard>
  );
}

/** Reads document lazily so server rendering does not evaluate a browser global. */
function BodyCursor(props: { cursor: string }) {
  createPropsProxy(() => document.body, {
    get style() {
      return { cursor: props.cursor };
    }
  });
  return null;
}

/** Combines body prop ownership with the existing window/document listener primitive. */
function PickMode(props: { exit: () => void }) {
  createPropsProxy(() => document.body, { style: { cursor: 'crosshair', 'user-select': 'none' } });
  createEventListener(() => window, 'blur', props.exit);
  createEventListener(
    () => document,
    'keydown',
    (event) => {
      if (event.key === 'Escape') props.exit();
    }
  );
  return null;
}
