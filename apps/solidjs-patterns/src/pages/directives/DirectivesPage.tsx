import { type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../../components/PatternLayout';
import example1Html, {
  code as example1Code,
  language as example1Language
} from './directives-example-1.txt?shiki&lang=tsx';
import example2Html, {
  code as example2Code,
  language as example2Language
} from './directives-example-2.txt?shiki&lang=tsx';
import example3Html, {
  code as example3Code,
  language as example3Language
} from './directives-example-3.txt?shiki&lang=tsx';

// ============================================================================
// MARK: Directives Page
// ============================================================================

export default function DirectivesPage(): JSX.Element {
  return (
    <PatternLayout
      title="Directives"
      badge="Advanced"
      description="SolidJS directives are functions that run on DOM element creation, providing a clean way to attach imperative behavior."
    >
      <PatternSection
        title="Creating a directive"
        description="A directive is a function (el, accessor) where el is the DOM element and accessor returns the value passed to use:directiveName."
      >
        <CodeBlock language={example1Language} code={example1Code}>
          {template(example1Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="Directives with options"
        description="Pass an options object or reactive value through the use: prop."
      >
        <CodeBlock language={example2Language} code={example2Code}>
          {template(example2Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection title="autoFocus directive" description="A simple directive to focus an element on mount.">
        <CodeBlock language={example3Language} code={example3Code}>
          {template(example3Html)()}
        </CodeBlock>
      </PatternSection>

      <Callout type="info" title="Import directives to prevent tree-shaking">
        If a directive is imported but only used in JSX (via <code class="rounded bg-white/10 px-1">use:</code>), some
        bundlers may tree-shake it. Import it explicitly:{' '}
        <code class="rounded bg-white/10 px-1">import './directives/clickOutside'</code> or reference it in a variable
        to keep it alive.
      </Callout>
    </PatternLayout>
  );
}
