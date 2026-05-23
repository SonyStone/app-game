import { type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../../components/CodeBlock';
import { Callout } from '../../components/PatternLayout';
import componentHtml, { code as componentCode, language as componentLanguage } from '../pass-data/component?shiki';
import example1Html, {
  code as example1Code,
  language as example1Language
} from '../pass-data/pass-data-example-1?shiki';

export const components = {
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
  pre(props: JSX.IntrinsicElements['pre']): JSX.Element {
    return <pre class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm" {...props} />;
  },
  code(props: JSX.IntrinsicElements['code']): JSX.Element {
    return (
      <code class="rounded bg-white/10 px-1 py-0.5 text-[11px] text-slate-900 dark:text-slate-200">
        {props.children}
      </code>
    );
  },
  InlineCode(props: { children: JSX.Element }): JSX.Element {
    return (
      <code class="rounded bg-white/10 px-1 py-0.5 text-[11px] text-slate-900 dark:text-slate-200">
        {props.children}
      </code>
    );
  },
  ShikiCodeBlock(props: { code: string; language?: string; html: string; title?: string }): JSX.Element {
    return (
      <CodeBlock code={props.code} language={props.language} title={props.title}>
        {template(props.html)()}
      </CodeBlock>
    );
  },
  Callout,
  ReferenceCard(props: { children: JSX.Element }): JSX.Element {
    return (
      <ul class="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-200 p-4 dark:bg-slate-900">
        {props.children}
      </ul>
    );
  },
  ReferenceLink(props: { href: string; children: JSX.Element }): JSX.Element {
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
  },
  PassDataGetterExample(): JSX.Element {
    return (
      <CodeBlock language={example1Language} code={example1Code} title="props-lowering.tsx">
        {template(example1Html)()}
      </CodeBlock>
    );
  },
  PassDataComponentSource(): JSX.Element {
    return (
      <CodeBlock language={componentLanguage} code={componentCode} title="component.ts">
        {template(componentHtml)()}
      </CodeBlock>
    );
  },
  Wrapper(props: { children: JSX.Element }): JSX.Element {
    return <div class="flex flex-col gap-6 rounded-xl border border-red-500 p-1">{props.children}</div>;
  }
} as const;
