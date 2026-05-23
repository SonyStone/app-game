import { type JSX } from 'solid-js';
import { components } from '../pass-data-mdx/PassDataMdxParts';
import PassDataContent from './pass-data-component.en.md?markdown';

const markdownComponents = {
  ...components,
  Section: (props: JSX.IntrinsicElements['section']): JSX.Element => (
    <section class="flex flex-col gap-6 py-4" {...props} />
  ),
  h1: (props: { children: JSX.Element }) => <h1 class="text-2xl font-bold text-blue-500">{props.children}</h1>,
  wrapper(props: { children: JSX.Element }): JSX.Element {
    return props.children;
  }
} as const;

export default function PassDataMarkdownPage(): JSX.Element {
  return (
    <article>
      <PassDataContent components={markdownComponents} />
    </article>
  );
}
