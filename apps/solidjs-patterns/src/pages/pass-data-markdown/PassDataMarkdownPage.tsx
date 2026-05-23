import { createSignal, type JSX } from 'solid-js';
import { Callout, PatternLayout } from '../../components/PatternLayout';
import { components } from '../pass-data-mdx/PassDataMdxParts';
import PassDataContent from './pass-data-component.md?markdown';
import PassDataContentMdx from './pass-data-component.md?markdown2';

type RendererMode = 'markdown' | 'markdown2';

const markdownComponents = {
  ...components,
  h1: (props: { children: JSX.Element }) => <h1 class="text-2xl font-bold text-blue-500">{props.children}</h1>,
  wrapper(props: { children: JSX.Element }): JSX.Element {
    return props.children;
  }
} as const;

export default function PassDataMarkdownPage(): JSX.Element {
  const [rendererMode, setRendererMode] = createSignal<RendererMode>('markdown');
  const isMarkdown = () => rendererMode() === 'markdown';

  return (
    <PatternLayout
      title="Pass Data (Markdown vs Markdown2)"
      badge="MD"
      description="The same .md file rendered through the custom markdown component pipeline and the mdx-js based markdown2 pipeline for a direct comparison."
    >
      <div class="flex flex-col gap-4">
        <div class="inline-flex w-fit items-center rounded-xl border border-neutral-700 bg-neutral-900/80 p-1">
          <button
            type="button"
            class={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              isMarkdown() ? 'bg-blue-500 text-white' : 'text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100'
            }`}
            onClick={() => setRendererMode('markdown')}
          >
            ?markdown
          </button>
          <button
            type="button"
            class={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              isMarkdown() ? 'text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100' : 'bg-blue-500 text-white'
            }`}
            onClick={() => setRendererMode('markdown2')}
          >
            ?markdown2
          </button>
        </div>

        <Callout type="tip" title="Why this feels better than post-processing HTML">
          The prose stays as markdown, but the rich pieces stay as real components instead of becoming DOM-replacement
          code after rendering.
        </Callout>

        <section class="flex flex-col gap-4 rounded-xl border border-neutral-700 bg-neutral-900/60 p-4">
          <div class="flex flex-col gap-1">
            <h2 class="text-lg font-semibold text-neutral-100">{isMarkdown() ? '`?markdown`' : '`?markdown2`'}</h2>
            <p class="text-sm text-neutral-400">
              {isMarkdown()
                ? 'Custom markdown-exit pipeline with component promotion, internal node plugins, and generated Solid module output.'
                : 'mdx-js compilation of the same `.md` source, still using the shared component map and Shiki remark transform.'}
            </p>
          </div>

          {isMarkdown() ? (
            <PassDataContent components={markdownComponents} />
          ) : (
            <PassDataContentMdx components={markdownComponents} />
          )}
        </section>
      </div>
    </PatternLayout>
  );
}
