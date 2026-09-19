import { PropsProxy } from '@app-game/solid-props-proxy';
import { createEffect, createSignal, Show, untrack } from 'solid-js';
import { createDOMValue, DOMValue, ExampleCard, Toggle } from './playground-ui';

/** Simulates a library that owns and can replace its editor element independently of Solid JSX. */
export function ExternalWidgetExample() {
  const [host, setHost] = createSignal<HTMLDivElement>();
  const [target, setTarget] = createSignal<HTMLTextAreaElement>();
  const [version, setVersion] = createSignal(1);
  const [locked, setLocked] = createSignal(false);
  const [baseReadOnly, setBaseReadOnly] = createSignal(false);

  createEffect(
    () => ({ host: host(), version: version() }),
    ({ host, version }) => {
      if (!host) return;
      const editor = mountExampleEditor(host, version, untrack(baseReadOnly));
      setTarget(editor.element);
      return () => {
        setTarget(undefined);
        editor.dispose();
      };
    }
  );
  createEffect(
    () => ({ element: target(), value: baseReadOnly() }),
    ({ element, value }) => {
      if (element) element.readOnly = value;
    }
  );
  const actual = createDOMValue(target, (element) => (element.readOnly ? 'read-only' : 'editable'));
  return (
    <ExampleCard
      id="external-widget"
      number="03"
      title="Respect the widget's base state"
      tag="External DOM"
      description="An imperative editor owns its textarea. A review layer follows replacement nodes and restores the editor's latest state."
      hint="Turn on the temporary lock, change the widget's own read-only state, then release the lock. The latest base is restored."
      code={`<Show when={reviewing()}>
  <PropsProxy target={editorElement()}
    prop:readOnly={true}
    style={{ outline: '2px solid #e8b86c' }} />
</Show>`}
      preview={
        <>
          <div class="pp-widget-bar">
            <span>EDITOR / INSTANCE {version()}</span>
            <span>Demo adapter</span>
          </div>
          <div ref={setHost} class="pp-editor-host" />
          <DOMValue label="Observed property" value={actual()} />
        </>
      }
    >
      <Toggle
        label="Temporary read-only"
        detail="The review workflow's layer"
        checked={locked()}
        onChange={setLocked}
      />
      <button class="pp-button" onClick={() => setBaseReadOnly((value) => !value)}>
        Widget read-only: {String(baseReadOnly())}
      </button>
      <button class="pp-button pp-button-quiet" onClick={() => setVersion((value) => value + 1)}>
        Replace widget element
      </button>
      <Show when={locked()}>
        <PropsProxy
          target={target()}
          prop:readOnly={true}
          style={{ outline: '2px solid #e8b86c' }}
          data-reviewing="true"
        />
      </Show>
    </ExampleCard>
  );
}

/** A small stand-in for an external editor API, not an integration with a specific library. */
function mountExampleEditor(host: HTMLElement, version: number, readOnly: boolean) {
  const element = host.ownerDocument.createElement('textarea');
  element.setAttribute('aria-label', `External editor ${version}`);
  element.value = `Editor instance ${version}\n\nThis node belongs to the editor. Try typing here, then enable the temporary review layer.`;
  element.readOnly = readOnly;
  element.className = 'pp-editor';
  host.append(element);
  return { element, dispose: () => element.remove() };
}
