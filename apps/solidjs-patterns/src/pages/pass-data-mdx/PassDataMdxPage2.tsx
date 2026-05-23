import { type JSX } from 'solid-js';
import { PatternLayout } from '../../components/PatternLayout';
import { components } from './PassDataMdxParts';

const c = components;

// ============================================================================
// MARK: Pass Data MDX Page
// ============================================================================

export default function PassDataMdxPage(): JSX.Element {
  return (
    <PatternLayout
      title="Pass Data (MDX)"
      badge="MDX"
      description="A small MDX trial: prose stays in markdown while richer examples and callouts stay as Solid components."
    >
      <div class="flex flex-col gap-6">
        <c.h2>Props preserve reactivity</c.h2>
        <c.p>
          MDX keeps the prose readable while still letting this page drop in real Solid components where markdown alone
          becomes too limiting.
        </c.p>
        <c.p>
          When a parent passes <c.InlineCode>{`count={count()}`}</c.InlineCode> it reads immediately. When it passes{' '}
          <c.InlineCode>{`count={count}`}</c.InlineCode> it hands the child a getter, so the child decides where the
          subscription lives.
        </c.p>
        <c.PassDataGetterExample />
        <c.Callout type="tip" title="Why this feels better than post-processing HTML">
          The prose stays as markdown, but the rich pieces stay as real components instead of becoming DOM-replacement
          code after rendering.
        </c.Callout>
        <c.h2>More MDX Experiments</c.h2>
        <c.p>This is the useful boundary for MDX in this app:</c.p>
        <c.ul>
          <c.li>normal explanation text stays in markdown</c.li>
          <c.li>reusable UI pieces such as callouts can come from the MDX provider</c.li>
          <c.li>
            richer examples can stay in regular Solid components with existing loaders such as{' '}
            <c.InlineCode>?shiki</c.InlineCode>
          </c.li>
        </c.ul>
        <c.p>The lower-level implementation details can still reuse the current Shiki-based code block pipeline:</c.p>
        <c.PassDataComponentSource />
        <c.Callout>
          MDX does not remove the need for components. It gives you a cleaner place to mix prose and components without
          inventing a custom markdown schema.
        </c.Callout>
        <c.h2>References</c.h2>
        <c.ReferenceCard>
          <c.ReferenceLink href="https://mdxjs.com/packages/rollup/">@mdx-js/rollup</c.ReferenceLink>
          <c.ReferenceLink href="https://mdxjs.com/guides/injecting-components/">
            Injecting MDX components
          </c.ReferenceLink>
          <c.ReferenceLink href="https://docs.solidjs.com/concepts/components/props">
            Solid props concept docs
          </c.ReferenceLink>
        </c.ReferenceCard>
      </div>
    </PatternLayout>
  );
}
