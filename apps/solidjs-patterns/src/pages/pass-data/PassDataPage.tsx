import { createContextProvider } from '@solid-primitives/context';
import { Show, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import { template } from 'solid-js/web';
import { CodeBlock } from '../../components/CodeBlock';
import { Callout } from '../../components/PatternLayout';
import PassDataContent from './pass-data.mdx?markdown';

export default function PassDataPage(): JSX.Element {
  return <PassDataContent components={markdownComponents} />;
}

const markdownComponents = {
  h1(props: JSX.IntrinsicElements['h1']): JSX.Element {
    return <h1 class="text-2xl font-bold text-stone-950 dark:text-white" {...props} />;
  },
  h2(props: JSX.IntrinsicElements['h2']): JSX.Element {
    return <h2 class="pt-2 text-sm font-semibold text-stone-900 dark:text-slate-200" {...props} />;
  },
  h3(props: JSX.IntrinsicElements['h3']): JSX.Element {
    return <h3 class="text-sm font-semibold text-stone-800 dark:text-slate-300" {...props} />;
  },
  p(props: JSX.IntrinsicElements['p']): JSX.Element {
    return <p class="text-base leading-6 text-stone-700 dark:text-slate-300" {...props} />;
  },
  ul(props: JSX.IntrinsicElements['ul']): JSX.Element {
    return (
      <ul
        class="ml-5 flex list-disc flex-col gap-2 text-base leading-6 text-stone-700 dark:text-slate-300"
        {...props}
      />
    );
  },
  ol(props: JSX.IntrinsicElements['ol']): JSX.Element {
    return (
      <ol
        class="ml-5 flex list-decimal flex-col gap-2 text-base leading-6 text-stone-700 dark:text-slate-300"
        {...props}
      />
    );
  },
  li(props: JSX.IntrinsicElements['li']): JSX.Element {
    return <li {...props} />;
  },
  a(props: JSX.IntrinsicElements['a']): JSX.Element {
    return (
      <a
        class="text-violet-900 underline decoration-violet-800 underline-offset-4 transition-colors hover:text-violet-700 dark:text-violet-300 dark:hover:text-violet-200"
        target="_blank"
        rel="noreferrer"
        {...props}
      />
    );
  },
  blockquote(props: JSX.IntrinsicElements['blockquote']): JSX.Element {
    return (
      <blockquote
        class="border-l-3 border-stone-300 pl-4 text-sm text-stone-600 italic dark:border-slate-700 dark:text-slate-400"
        {...props}
      />
    );
  },
  code(props: JSX.IntrinsicElements['code']): JSX.Element {
    return <InlineCode>{props.children}</InlineCode>;
  },
  CodeBlock(props: { title?: string; children?: JSX.Element }): JSX.Element {
    return (
      <CodeProvider>
        <Show when={useCode()?.codeProps}>
          {(codeProps) => (
            <CodeBlock code={codeProps()?.code} language={codeProps()?.language} title={props.title}>
              {props.children}
            </CodeBlock>
          )}
        </Show>
      </CodeProvider>
    );
  },
  SideBySideCode(props: { title?: string; children?: JSX.Element }): JSX.Element {
    return (
      <CodeProvider>
        <Show when={useCode()?.codeProps}>
          {(codeProps) => (
            <CodeBlock
              class="flex flex-wrap [&>*]:flex-grow-1"
              code={codeProps()?.code}
              language={codeProps()?.language}
              title={props.title}
            >
              {props.children}
            </CodeBlock>
          )}
        </Show>
      </CodeProvider>
    );
  },
  Shiki(props: { code: string; language?: string; html: string; title?: string }): JSX.Element {
    const { setCodeProps } = useCode() ?? {};
    setCodeProps?.({ code: props.code, language: props.language });

    return template(props.html)();
  },
  Callout,
  Description(props: { children: JSX.Element }): JSX.Element {
    return <p class="mt-0.5 text-sm text-stone-600 dark:text-slate-400">{props.children}</p>;
  },
  ReferenceCard(props: { children: JSX.Element }): JSX.Element {
    return (
      <ul class="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-200 p-4 dark:bg-slate-900">
        {props.children}
      </ul>
    );
  },
  ReferenceLink(props: { href: string; children: JSX.Element }): JSX.Element {
    return <ReferenceLink href={props.href}>{props.children}</ReferenceLink>;
  },
  wrapper(props: { children: JSX.Element }): JSX.Element {
    return <article class="flex flex-col gap-8">{props.children}</article>;
  }
} as const;

function InlineCode(props: { children: JSX.Element }): JSX.Element {
  return (
    <code class="rounded bg-white/10 px-1 py-0.5 text-[11px] text-slate-900 dark:text-slate-200">{props.children}</code>
  );
}

function ReferenceLink(props: { href: string; children: JSX.Element }): JSX.Element {
  return (
    <li>
      <a
        href={props.href}
        target="_blank"
        rel="noreferrer"
        class="text-violet-900 underline decoration-violet-800 underline-offset-4 transition-colors hover:text-violet-700 dark:text-violet-300 dark:hover:text-violet-200"
      >
        {props.children}
      </a>
    </li>
  );
}

const [CodeProvider, useCode] = createContextProvider((props: Partial<{ code: string; language?: string }>) => {
  const [codeProps, setCodeProps] = createStore<Partial<{ code: string; language?: string }>>(props);
  return { codeProps, setCodeProps };
});
