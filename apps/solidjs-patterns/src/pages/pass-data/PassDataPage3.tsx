import { ComponentProps, type JSX } from 'solid-js';
import { components } from '../pass-data-mdx/PassDataMdxParts';
import PassData from './pass-data.md?markdown';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'doc-description': ComponentProps<'div'>;
    }
  }
}

export default function PassDataPage3(): JSX.Element {
  return (
    <div>
      <PassData components={{ ...components, Description }} />
    </div>
  );
}

function Description(props: { children?: JSX.Element }): JSX.Element {
  return <div class="flex-inline text-sm text-stone-600 dark:text-slate-400">{props.children}</div>;
}
