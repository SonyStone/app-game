import { type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../components/PatternLayout';
import example1Html, { code as example1Code, language as example1Language } from './props-example-1.txt?shiki&lang=tsx';
import example2Html, { code as example2Code, language as example2Language } from './props-example-2.txt?shiki&lang=tsx';
import example3Html, { code as example3Code, language as example3Language } from './props-example-3.txt?shiki&lang=tsx';

// ============================================================================
// MARK: Props Page
// ============================================================================

export default function PropsPage(): JSX.Element {
  return (
    <PatternLayout
      title="Props & Spreading"
      badge="Components"
      description="How SolidJS handles props spreading, forwarding, and native element attribute passing."
    >
      <PatternSection
        title="Spreading props onto native elements"
        description="Spread remaining props onto the native element. SolidJS handles the DOM attributes correctly."
      >
        <CodeBlock language={example1Language} code={example1Code}>
          {template(example1Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="class prop merging"
        description="SolidJS uses class (not className). Merge with a utility for conditional classes."
      >
        <CodeBlock language={example2Language} code={example2Code}>
          {template(example2Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="ref forwarding"
        description="Forward refs to DOM elements using the ref prop. SolidJS refs are assigned on mount, not wrapped in a callback."
      >
        <CodeBlock language={example3Language} code={example3Code}>
          {template(example3Html)()}
        </CodeBlock>
      </PatternSection>

      <Callout type="info" title="use:directive syntax">
        SolidJS supports custom directives via the <code class="rounded bg-white/10 px-1">use:</code> prefix. Declare
        them with <code class="rounded bg-white/10 px-1">declare module 'solid-js'</code> for TypeScript support. See
        the Directives page for details.
      </Callout>
    </PatternLayout>
  );
}
