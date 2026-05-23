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

// ============================================================================
// MARK: Pass Data Page
// ============================================================================

export default function PassDataPage2(): JSX.Element {
  return <PassData components={{ ...components, Description }} />;
}

function Description(props: { children?: JSX.Element }): JSX.Element {
  return <doc-description class="flex-inline text-sm text-stone-600 dark:text-slate-400">{props.children}</doc-description>;
}
