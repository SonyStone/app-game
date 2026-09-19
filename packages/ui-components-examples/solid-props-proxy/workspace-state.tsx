import { PropsProxy } from '@app-game/solid-props-proxy';
import { createSignal, Show } from 'solid-js';
import { createDOMValue, DOMValue, ExampleCard, Toggle } from './playground-ui';

/** Two independent operations temporarily prevent interaction with the same workspace. */
export function WorkspaceStateExample() {
  const [target, setTarget] = createSignal<HTMLDivElement>();
  const [saving, setSaving] = createSignal(false);
  const [syncing, setSyncing] = createSignal(false);
  const [count, setCount] = createSignal(0);
  const state = createDOMValue(target, (element) => (element.inert ? 'inert = true' : 'inert = false'));
  return (
    <ExampleCard
      id="workspace-state"
      number="06"
      title="Release your own lock"
      tag="DOM properties"
      description="Saving and syncing each own an inert layer. The workspace becomes interactive after both owners leave."
      hint="Start both operations, then finish just one. Try the workspace button before and after releasing the second."
      code={`<Show when={saving()}>
  <PropsProxy target={workspace()} prop:inert={true} />
</Show>
<Show when={syncing()}>
  <PropsProxy target={workspace()} prop:inert={true} />
</Show>`}
      preview={
        <>
          <div ref={setTarget} class="pp-workspace">
            <span class="pp-label">Draft workspace</span>
            <input aria-label="Draft name" value="Untitled canvas" />
            <button class="pp-button" onClick={() => setCount((value) => value + 1)}>
              Add a note
            </button>
            <span class="pp-muted">{count()} notes added</span>
          </div>
          <DOMValue label="Observed property" value={state()} />
        </>
      }
    >
      <Toggle label="Saving" detail="Operation A owns an inert layer" checked={saving()} onChange={setSaving} />
      <Toggle label="Syncing" detail="Operation B owns an inert layer" checked={syncing()} onChange={setSyncing} />
      <Show when={saving()}>
        <PropsProxy target={target()} prop:inert={true} style={{ opacity: '0.45' }} />
      </Show>
      <Show when={syncing()}>
        <PropsProxy target={target()} prop:inert={true} style={{ opacity: '0.45' }} />
      </Show>
    </ExampleCard>
  );
}
