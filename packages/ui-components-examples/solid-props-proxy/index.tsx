import { createSignal, For, lazy, Show } from 'solid-js';
import { BodyModesExample } from './body-modes';
import { CustomElementExample } from './custom-element';
import { ExternalWidgetExample } from './external-widget';
import { IframePreviewExample } from './iframe-preview';
import './playground.css';
import { StyleLayersExample } from './style-layers';
import { TargetHandoffExample } from './target-handoff';
import { WorkspaceStateExample } from './workspace-state';

/** Curated, interactive examples of reversible props and independent owner lifetimes. */
export default function SolidPropsProxyExample() {
  const [legacy, setLegacy] = createSignal(false);
  return (
    <main class="props-playground">
      <div class="pp-page">
        <header class="pp-hero">
          <div class="pp-topline">
            <a href="#">solid-props-proxy</a>
            <span class="pp-version">SOLID 2 · EXPERIMENTAL</span>
          </div>
          <h1>
            Temporary props.
            <br />
            <span>Independent owners.</span>
          </h1>
          <p>
            Try a behavior. Change its target. Remove its owner.
            <br class="pp-desktop-break" /> Watch the element return to the state underneath.
          </p>
          <div class="pp-hero-footer">
            <span>07 interactive examples</span>
            <span>Live DOM state</span>
            <span>Owned cleanup</span>
          </div>
        </header>
        <div class="pp-layout">
          <aside class="pp-sidebar">
            <span class="pp-label">Explore the behavior</span>
            <nav aria-label="Examples">
              <For each={examples}>
                {(example, index) => (
                  <a href={`#${example.id}`}>
                    <span>{String(index() + 1).padStart(2, '0')}</span>
                    {example.name}
                  </a>
                )}
              </For>
            </nav>
            <div class="pp-sidebar-note">
              <strong>When is a proxy useful?</strong>
              <p>
                When the target and the temporary behavior have different owners. For props collected in your own JSX,
                start with a regular spread.
              </p>
            </div>
          </aside>
          <div class="pp-examples">
            <StyleLayersExample />
            <BodyModesExample />
            <ExternalWidgetExample />
            <TargetHandoffExample />
            <IframePreviewExample />
            <WorkspaceStateExample />
            <CustomElementExample />
            <details class="pp-legacy" onToggle={(event) => setLegacy(event.currentTarget.open)}>
              <summary>
                Earlier experiments <span>Original examples, kept for reference</span>
              </summary>
              <Show when={legacy()}>
                <LegacyExamples />
              </Show>
            </details>
            <footer class="pp-footer">
              Built with Solid 2. Layers are removed with their owner.<a href="#">Back to top</a>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}

const LegacyExamples = lazy(() => import('./legacy-examples'));
const examples = [
  { id: 'style-layers', name: 'Style layers' },
  { id: 'body-modes', name: 'Page modes' },
  { id: 'external-widget', name: 'External editor' },
  { id: 'target-handoff', name: 'Target handoff' },
  { id: 'iframe-preview', name: 'Iframe preview' },
  { id: 'workspace-state', name: 'Workspace state' },
  { id: 'custom-element', name: 'Custom element' }
];
