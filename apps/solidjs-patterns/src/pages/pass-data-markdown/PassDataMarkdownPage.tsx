import { type JSX } from 'solid-js';
import { PatternLayout } from '../../components/PatternLayout';
import { components } from '../pass-data-mdx/PassDataMdxParts';
import PassDataContent from './pass-data-component.md?markdown&component';

const markdownComponents = {
  ...components,
  h1: (props: { children: JSX.Element }) => <h1 class="text-2xl font-bold text-blue-500">{props.children}</h1>,
  wrapper(props: { children: JSX.Element }): JSX.Element {
    return props.children;
  }
} as const;

export default function PassDataMarkdownPage(): JSX.Element {
  return (
    <PatternLayout
      title="Pass Data (Markdown Component)"
      badge="MD"
      description="A markdown file compiled into a component module with a components prop, closer to MDX but limited to markdown semantics."
    >
      <div class="flex flex-col gap-6">
        <PassDataContent components={markdownComponents} />
      </div>
    </PatternLayout>
  );
}
