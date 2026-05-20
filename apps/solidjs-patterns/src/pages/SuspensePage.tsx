import { type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../components/CodeBlock';
import { PatternLayout, PatternSection } from '../components/PatternLayout';
import example1Html, {
  code as example1Code,
  language as example1Language
} from './suspense-example-1.txt?shiki&lang=tsx';
import example2Html, {
  code as example2Code,
  language as example2Language
} from './suspense-example-2.txt?shiki&lang=tsx';
import example3Html, {
  code as example3Code,
  language as example3Language
} from './suspense-example-3.txt?shiki&lang=tsx';
import example4Html, {
  code as example4Code,
  language as example4Language
} from './suspense-example-4.txt?shiki&lang=tsx';

// ============================================================================
// MARK: Suspense Page
// ============================================================================

export default function SuspensePage(): JSX.Element {
  return (
    <PatternLayout
      title="Suspense & Lazy"
      badge="Async"
      description="Suspense declaratively handles loading states for async resources. lazy() code-splits components."
    >
      <PatternSection
        title="Suspense"
        description="Suspense catches all pending resources in its subtree and shows the fallback until they resolve."
      >
        <CodeBlock language={example1Language} code={example1Code}>
          {template(example1Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="SuspenseList"
        description="Coordinates multiple Suspense boundaries, controlling order and revealing strategy."
      >
        <CodeBlock language={example2Language} code={example2Code}>
          {template(example2Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="lazy() — code splitting"
        description="lazy wraps a dynamic import and returns a component that integrates with Suspense."
      >
        <CodeBlock language={example3Language} code={example3Code}>
          {template(example3Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="ErrorBoundary"
        description="Catches errors thrown in the render tree (including resource errors). Required when using Suspense with fallible resources."
      >
        <CodeBlock language={example4Language} code={example4Code}>
          {template(example4Html)()}
        </CodeBlock>
      </PatternSection>
    </PatternLayout>
  );
}
