import { type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../components/CodeBlock';
import { Callout } from '../components/PatternLayout';
import { Badge as UiBadge, type BadgeProps } from '../components/ui/Badge';

export const markdownComponents = {
  article(props: JSX.IntrinsicElements['article']): JSX.Element {
    return <article class="flex flex-col gap-8" {...props} />;
  },
  header(props: JSX.IntrinsicElements['header']): JSX.Element {
    return <header class="flex flex-col gap-2 border-b border-stone-300 pb-6 dark:border-slate-800" {...props} />;
  },
  section(props: JSX.IntrinsicElements['section']): JSX.Element {
    return <section class="flex flex-col gap-3" {...props} />;
  },
  Description(props: { children: JSX.Element }): JSX.Element {
    return <p class="text-sm text-stone-600 dark:text-slate-400">{props.children}</p>;
  },
  Badge(props: BadgeProps): JSX.Element {
    return <UiBadge {...props} />;
  },
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
  ShikiCodeBlock(props: { code: string; language?: string; html: string; title?: string }): JSX.Element {
    return (
      <CodeBlock code={props.code} language={props.language} title={props.title}>
        {template(props.html)()}
      </CodeBlock>
    );
  },
  Callout,
  wrapper(props: { children: JSX.Element }): JSX.Element {
    return <article class="flex flex-col gap-8">{props.children}</article>;
  }
} as const;

function InlineCode(props: { children: JSX.Element }): JSX.Element {
  return (
    <code class="rounded bg-white/10 px-1 py-0.5 text-[11px] text-slate-900 dark:text-slate-200">{props.children}</code>
  );
}
