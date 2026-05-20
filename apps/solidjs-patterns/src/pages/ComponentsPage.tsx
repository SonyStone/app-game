import { type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../components/PatternLayout';
import example1Html, { code as example1Code, language as example1Language } from './components-example-1?shiki';
import example2Html, { code as example2Code, language as example2Language } from './components-example-2?shiki';
import example3Html, { code as example3Code, language as example3Language } from './components-example-3?shiki';
import example4Html, { code as example4Code, language as example4Language } from './components-example-4?shiki';
import example5Html, { code as example5Code, language as example5Language } from './components-example-5?shiki';

// ============================================================================
// MARK: Components Page
// ============================================================================

export default function ComponentsPage(): JSX.Element {
  return (
    <PatternLayout
      title="Component Patterns"
      badge="Components"
      description="Best practices for defining props, passing children, splitting props, and building reusable components in SolidJS."
    >
      <PatternSection
        title="Props & type definitions"
        description="Use type aliases (not interfaces). For exported components, define props type separately."
      >
        <CodeBlock language={example1Language} code={example1Code}>
          {template(example1Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="splitProps"
        description="splitProps separates your component's own props from props to forward. Essential for avoiding unknown DOM attribute warnings."
      >
        <CodeBlock language={example2Language} code={example2Code}>
          {template(example2Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="mergeProps — default values"
        description="mergeProps safely merges props with defaults, preserving reactivity of the original props."
      >
        <CodeBlock language={example3Language} code={example3Code}>
          {template(example3Html)()}
        </CodeBlock>
      </PatternSection>

      <Callout type="danger" title="Never destructure props">
        Destructuring SolidJS props breaks reactivity because JSX accesses property getters lazily. Always use{' '}
        <code class="rounded bg-white/10 px-1">props.value</code> or{' '}
        <code class="rounded bg-white/10 px-1">splitProps</code> /{' '}
        <code class="rounded bg-white/10 px-1">mergeProps</code>.
      </Callout>

      <PatternSection
        title="children helper"
        description="Use the children() helper when you need to evaluate or inspect children — it memoizes them properly."
      >
        <CodeBlock language={example4Language} code={example4Code}>
          {template(example4Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="Component as prop"
        description="Pass components as props using the Component<Props> type or JSX.Element for static content."
      >
        <CodeBlock language={example5Language} code={example5Code}>
          {template(example5Html)()}
        </CodeBlock>
      </PatternSection>
    </PatternLayout>
  );
}
