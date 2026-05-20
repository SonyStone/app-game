import { batch, createEffect, createSignal, type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../../components/PatternLayout';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import example1Html, { code as example1Code, language as example1Language } from './batching-example-1?shiki';
import example2Html, { code as example2Code, language as example2Language } from './batching-example-2?shiki';
import example3Html, { code as example3Code, language as example3Language } from './batching-example-3?shiki';

// ============================================================================
// MARK: Batching Page
// ============================================================================

export default function BatchingPage(): JSX.Element {
  return (
    <PatternLayout
      title="Batching & Untrack"
      badge="Core"
      description="batch() groups multiple signal updates into a single notification. untrack() reads reactive values without creating a dependency."
    >
      <PatternSection
        title="batch()"
        description="Without batch, each setX() call triggers separate effect runs. batch defers notifications until the function completes."
      >
        <CodeBlock language={example1Language} code={example1Code}>
          {template(example1Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection title="Live Demo: batch">
        <BatchDemo />
      </PatternSection>

      <PatternSection
        title="untrack()"
        description="Reads reactive values without subscribing. Use inside effects or memos to access data without triggering re-runs."
      >
        <CodeBlock language={example2Language} code={example2Code}>
          {template(example2Html)()}
        </CodeBlock>
      </PatternSection>

      <Callout type="info" title="batch is automatic in event handlers">
        SolidJS automatically batches updates in DOM event handlers (onClick, onInput, etc.). You only need explicit{' '}
        <code class="rounded bg-white/10 px-1">batch()</code> for async contexts like setTimeout, fetch callbacks, or
        WebSocket handlers.
      </Callout>

      <PatternSection
        title="Practical: multi-field form reset"
        description="batch is ideal for resetting multiple fields at once without intermediate effect runs."
      >
        <CodeBlock language={example3Language} code={example3Code}>
          {template(example3Html)()}
        </CodeBlock>
      </PatternSection>
    </PatternLayout>
  );
}

// ============================================================================
// MARK: Live Demo
// ============================================================================

function BatchDemo(): JSX.Element {
  const [x, setX] = createSignal(0);
  const [y, setY] = createSignal(0);
  const [effectRunCount, setEffectRunCount] = createSignal(0);
  const [logs, setLogs] = createSignal<string[]>([]);

  createEffect(() => {
    const xv = x();
    const yv = y();
    setEffectRunCount((c) => c + 1);
    setLogs((prev) => [`effect #${effectRunCount() + 1}: x=${xv}, y=${yv}`, ...prev].slice(0, 6));
  });

  return (
    <Card class="flex flex-col gap-4">
      <div class="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setX((v) => v + 1);
            setY((v) => v + 1);
          }}
        >
          set x+y (no batch — 2 effects)
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={() =>
            batch(() => {
              setX((v) => v + 1);
              setY((v) => v + 1);
            })
          }
        >
          set x+y (batch — 1 effect)
        </Button>
      </div>
      <div class="flex gap-6 font-mono text-sm">
        <span>
          <span class="text-neutral-500">x=</span>
          <span class="text-violet-300">{x()}</span>
        </span>
        <span>
          <span class="text-neutral-500">y=</span>
          <span class="text-violet-300">{y()}</span>
        </span>
        <span>
          <span class="text-neutral-500">effects run=</span>
          <span class="text-yellow-400">{effectRunCount()}</span>
        </span>
      </div>
      <div class="space-y-0.5 rounded-lg bg-neutral-950 p-3 font-mono text-xs text-neutral-400">
        {logs().map((l) => (
          <div>{l}</div>
        ))}
      </div>
    </Card>
  );
}
