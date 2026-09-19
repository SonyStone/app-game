import { PropsProxy } from '@app-game/solid-props-proxy';
import { createSignal, Show } from 'solid-js';
import { ExampleCard, Toggle } from './playground-ui';

/** Adds a temporary inspection mode to a same-origin preview that replaces its own document. */
export function IframePreviewExample() {
  const [target, setTarget] = createSignal<HTMLButtonElement>();
  const [enabled, setEnabled] = createSignal(false);
  const [version, setVersion] = createSignal(1);
  const [clicks, setClicks] = createSignal(0);
  return (
    <ExampleCard
      id="iframe-preview"
      number="05"
      title="Inspect another document"
      tag="Same-origin iframe"
      description="The preview owns its DOM. Inspection attaches to a button inside the frame and reconnects after each reload."
      hint="Enable inspection and click the preview button. Reload it while active: the new target gets the layer, and the old one is released."
      code={`<iframe onLoad={event => setTarget(
  event.currentTarget.contentDocument
    ?.querySelector('button')
)} />
<PropsProxy target={target()} onClick={inspect} />`}
      preview={
        <>
          <div class="pp-widget-bar">
            <span>PREVIEW / DOCUMENT {version()}</span>
            <span>same origin</span>
          </div>
          <iframe
            title="Props proxy preview"
            class="pp-frame"
            srcdoc={`<!doctype html><html><style>body{background:#142129;color:#dfeaf1;font:14px system-ui;display:grid;place-content:center;gap:18px;text-align:center;margin:0;height:190px}small{color:#91a7b9}button{background:#203a43;border:1px solid #3b6369;border-radius:10px;padding:18px 28px;color:#c6f2e9;font:600 16px system-ui;cursor:pointer}</style><body><small>This button lives inside an iframe</small><button id="preview">Preview ${version()}</button></body></html>`}
            onLoad={(event) =>
              setTarget(event.currentTarget.contentDocument?.querySelector<HTMLButtonElement>('#preview') ?? undefined)
            }
          />
        </>
      }
    >
      <Toggle label="Inspect preview" checked={enabled()} onChange={setEnabled} />
      <button
        class="pp-button"
        onClick={() => {
          setTarget(undefined);
          setVersion((value) => value + 1);
        }}
      >
        Reload preview
      </button>
      <output class="pp-event-count">Inspection clicks: {clicks()}</output>
      <Show when={enabled()}>
        <PropsProxy
          target={target()}
          title="Inspection is active"
          class="inspecting"
          style={{ outline: '2px solid #e8b86c', cursor: 'crosshair' }}
          onClick={() => setClicks((value) => value + 1)}
        />
      </Show>
    </ExampleCard>
  );
}
