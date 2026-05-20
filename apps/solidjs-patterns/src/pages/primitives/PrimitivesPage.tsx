import { type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../../components/PatternLayout';
import example1Html, {
  code as example1Code,
  language as example1Language
} from './primitives-example-1.txt?shiki&lang=tsx';
import example2Html, {
  code as example2Code,
  language as example2Language
} from './primitives-example-2.txt?shiki&lang=tsx';
import example3Html, {
  code as example3Code,
  language as example3Language
} from './primitives-example-3.txt?shiki&lang=tsx';
import example4Html, {
  code as example4Code,
  language as example4Language
} from './primitives-example-4.txt?shiki&lang=tsx';

// ============================================================================
// MARK: Primitives Page
// ============================================================================

export default function PrimitivesPage(): JSX.Element {
  return (
    <PatternLayout
      title="Solid Primitives"
      badge="Advanced"
      description="@solid-primitives provides community utilities built on SolidJS reactivity. Covers event listeners, storage, timers, and much more."
    >
      <PatternSection
        title="Event listeners"
        description="Use makeEventListener / createEventListener instead of manual addEventListener for automatic cleanup."
      >
        <CodeBlock language={example1Language} code={example1Code}>
          {template(example1Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection title="Keyboard" description="createKeyHold and createShortcut for keyboard interactions.">
        <CodeBlock language={example2Language} code={example2Code}>
          {template(example2Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="Storage"
        description="createLocalStorage and createCookieStorage for persistent reactive state."
      >
        <CodeBlock language={example3Language} code={example3Code}>
          {template(example3Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection title="Bounds & resize" description="createElementBounds for reactive element dimensions.">
        <CodeBlock language={example4Language} code={example4Code}>
          {template(example4Html)()}
        </CodeBlock>
      </PatternSection>

      <Callout type="tip" title="Browse all primitives">
        Over 50 primitives at{' '}
        <a href="https://primitives.solidjs.community" target="_blank" class="text-violet-400 underline">
          primitives.solidjs.community
        </a>
        . Each package is independently installable.
      </Callout>
    </PatternLayout>
  );
}
