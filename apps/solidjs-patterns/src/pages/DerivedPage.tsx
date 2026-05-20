import { createMemo, createSignal, type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../components/PatternLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import example1Html, { code as example1Code, language as example1Language } from './derived-example-1?shiki';
import example2Html, { code as example2Code, language as example2Language } from './derived-example-2?shiki';
import example3Html, { code as example3Code, language as example3Language } from './derived-example-3?shiki';
import example4Html, { code as example4Code, language as example4Language } from './derived-example-4?shiki';

// ============================================================================
// MARK: Derived Page
// ============================================================================

export default function DerivedPage(): JSX.Element {
  return (
    <PatternLayout
      title="Derived & Memo"
      badge="Core"
      description="createMemo creates a derived reactive value that re-runs only when its dependencies change. Results are memoized — multiple reads return the cached value."
    >
      <PatternSection
        title="createMemo"
        description="Memo tracks its reactive dependencies automatically. It only re-runs when a dependency changes, and caches the result between updates."
      >
        <CodeBlock language={example1Language} code={example1Code}>
          {template(example1Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection title="Live Demo">
        <MemoDemo />
      </PatternSection>

      <PatternSection
        title="Memo vs Inline Expression"
        description="Use memo when the computation is expensive or when the result is read multiple times. Inline expressions recompute on each read."
      >
        <CodeBlock language={example2Language} code={example2Code}>
          {template(example2Html)()}
        </CodeBlock>
      </PatternSection>

      <Callout type="tip" title="Memo = derived signal">
        Think of <code class="rounded bg-white/10 px-1">createMemo</code> as a read-only signal whose value is derived
        from other reactive sources. It returns a getter just like{' '}
        <code class="rounded bg-white/10 px-1">createSignal</code>.
      </Callout>

      <PatternSection
        title="Chained Memos"
        description="Memos can depend on other memos, forming a reactive dependency graph."
      >
        <CodeBlock language={example3Language} code={example3Code}>
          {template(example3Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="Memo with equals"
        description="Control when downstream effects are notified by providing a custom equality check."
      >
        <CodeBlock language={example4Language} code={example4Code}>
          {template(example4Html)()}
        </CodeBlock>
      </PatternSection>
    </PatternLayout>
  );
}

// ============================================================================
// MARK: Live Demo
// ============================================================================

function MemoDemo(): JSX.Element {
  const [a, setA] = createSignal(3);
  const [b, setB] = createSignal(4);
  let memoCallCount = 0;

  const hypotenuse = createMemo(() => {
    memoCallCount++;
    return Math.sqrt(a() ** 2 + b() ** 2);
  });

  const [renderCount, setRenderCount] = createSignal(0);

  return (
    <Card class="flex flex-col gap-4">
      <p class="text-xs text-neutral-500">Hypotenuse = √(a² + b²)</p>
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <span class="text-xs text-neutral-400">a =</span>
          <Button size="sm" variant="outline" onClick={() => setA((v) => v - 1)}>
            −
          </Button>
          <span class="w-6 text-center font-mono text-sm text-violet-300">{a()}</span>
          <Button size="sm" variant="outline" onClick={() => setA((v) => v + 1)}>
            +
          </Button>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-neutral-400">b =</span>
          <Button size="sm" variant="outline" onClick={() => setB((v) => v - 1)}>
            −
          </Button>
          <span class="w-6 text-center font-mono text-sm text-violet-300">{b()}</span>
          <Button size="sm" variant="outline" onClick={() => setB((v) => v + 1)}>
            +
          </Button>
        </div>
      </div>
      <div class="rounded-lg bg-neutral-950 p-3 font-mono text-sm">
        <span class="text-neutral-500">hypotenuse = </span>
        <span class="text-green-400">{hypotenuse().toFixed(4)}</span>
      </div>
    </Card>
  );
}
