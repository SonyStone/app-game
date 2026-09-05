import type { JSX } from '@solidjs/web';
import { For, createSignal, onSettled } from 'solid-js';
import { WebGLIframeStateDiagram } from './iframe-state-diagram';

const THREE_EXAMPLES_URL = 'https://threejs.org/examples/';
const DEFAULT_EXAMPLE = 'webgl_postprocessing_unreal_bloom';

/** Loads the official Three.js WebGL catalog and inspects whichever example is selected. */
export function ThreeExamplesStateDiagram(): JSX.Element {
  const [groups, setGroups] = createSignal<readonly ThreeExampleGroup[]>([]);
  const [selectedExample, setSelectedExample] = createSignal(DEFAULT_EXAMPLE);
  const [sourceDocument, setSourceDocument] = createSignal(statusDocument('Loading the official Three.js example…'));
  const [loading, setLoading] = createSignal(true);
  let requestGeneration = 0;

  onSettled(() => {
    void loadCatalog();
    void loadExample(DEFAULT_EXAMPLE);
    return () => {
      requestGeneration += 1;
    };
  });

  async function loadCatalog(): Promise<void> {
    try {
      const response = await fetch(`${THREE_EXAMPLES_URL}files.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const catalog: unknown = await response.json();
      setGroups(readWebGLGroups(catalog));
    } catch (error: unknown) {
      console.warn('The Three.js example catalog could not be loaded.', error);
    }
  }

  async function loadExample(id: string): Promise<void> {
    const generation = ++requestGeneration;
    setSelectedExample(id);
    setLoading(true);

    try {
      const url = new URL(`${id}.html`, THREE_EXAMPLES_URL);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = addBaseUrl(await response.text(), url.href);
      if (generation !== requestGeneration) return;
      setSourceDocument(html);
    } catch (error: unknown) {
      if (generation !== requestGeneration) return;
      const reason = error instanceof Error ? error.message : String(error);
      setSourceDocument(statusDocument(`Could not load ${id}: ${reason}`, true));
    } finally {
      if (generation === requestGeneration) setLoading(false);
    }
  }

  const exampleTitle = () => formatExampleName(selectedExample());

  return (
    <WebGLIframeStateDiagram
      srcdoc={sourceDocument()}
      iframeTitle={`Three.js · ${exampleTitle()}`}
      diagramTitle={`${exampleTitle()} · WebGL state diagram`}
      pageControls={
        <>
          <label class="wgsd-example-picker">
            <span>{loading() ? 'loading example…' : 'official example'}</span>
            <select
              aria-label="Three.js example"
              value={selectedExample()}
              disabled={loading()}
              onChange={(event) => void loadExample(event.currentTarget.value)}
            >
              <For each={groups()}>
                {(group) => (
                  <optgroup label={group.label}>
                    <For each={group.examples}>
                      {(example) => <option value={example}>{formatExampleName(example)}</option>}
                    </For>
                  </optgroup>
                )}
              </For>
              <For each={groups().length === 0 ? [DEFAULT_EXAMPLE] : []}>
                {(example) => <option value={example}>{formatExampleName(example)}</option>}
              </For>
            </select>
          </label>
          <a
            class="wgsd-example-picker__link"
            href={`${THREE_EXAMPLES_URL}#${selectedExample()}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Open the original Three.js example"
            title="Open the original Three.js example"
          >
            ↗
          </a>
        </>
      }
    />
  );
}

interface ThreeExampleGroup {
  readonly label: string;
  readonly examples: readonly string[];
}

function readWebGLGroups(value: unknown): readonly ThreeExampleGroup[] {
  if (!isRecord(value)) throw new Error('The catalog is not an object.');

  return Object.entries(value).flatMap(([label, examples]) => {
    if (!label.startsWith('webgl') || !Array.isArray(examples)) return [];
    const validExamples = examples.filter((example): example is string => typeof example === 'string');
    return validExamples.length > 0 ? [{ label, examples: validExamples }] : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatExampleName(id: string): string {
  return id.replace(/^webgl_/, '').replaceAll('_', ' / ');
}

function addBaseUrl(html: string, url: string): string {
  const base = `<base href="${url}">`;
  return /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${base}`)
    : base + html;
}

function statusDocument(message: string, error = false): string {
  const color = error ? '#ffb7b7' : '#dcecff';
  return `<!doctype html>
    <html lang="en">
      <meta charset="utf-8">
      <style>
        html, body { height: 100%; }
        body { display: grid; margin: 0; place-items: center; color: ${color}; background: #07111f;
          font: 600 14px/1.5 system-ui, sans-serif; text-align: center; }
      </style>
      <body><p>${escapeHtml(message)}</p></body>
    </html>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
