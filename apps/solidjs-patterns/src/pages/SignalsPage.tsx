import { createSignal, type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../components/PatternLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import example1Html, {
  code as example1Code,
  language as example1Language
} from './signals-example-1.txt?shiki&lang=tsx';
import example2Html, {
  code as example2Code,
  language as example2Language
} from './signals-example-2.txt?shiki&lang=tsx';
import example3Html, {
  code as example3Code,
  language as example3Language
} from './signals-example-3.txt?shiki&lang=tsx';
import example4Html, {
  code as example4Code,
  language as example4Language
} from './signals-example-4.txt?shiki&lang=tsx';

// ============================================================================
// MARK: Signals Page
// ============================================================================

export default function SignalsPage(): JSX.Element {
  return (
    <PatternLayout
      title="Signals"
      badge="Core"
      description="Signals are the fundamental reactive primitive in SolidJS. They hold a value and notify subscribers when it changes."
    >
      <PatternSection
        title="Basic Signal 2"
        description="createSignal returns a getter and setter tuple. The getter is a function — calling it inside a reactive context subscribes to changes."
      >
        <CodeBlock language={example1Language} code={example1Code} title="basic-signal.tsx">
          {template(example1Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection title="Live Demo">
        <SignalDemo />
      </PatternSection>

      <PatternSection
        title="Equality Check"
        description="Signals skip notifications when the new value equals the old one. Customize with the equals option."
      >
        <CodeBlock language={example2Language} code={example2Code}>
          {template(example2Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="Signals vs State"
        description="Unlike React useState, signals are not tied to components. They can live outside components and be shared freely."
      >
        <CodeBlock language={example3Language} code={example3Code}>
          {template(example3Html)()}
        </CodeBlock>
      </PatternSection>

      <Callout type="tip" title="Getter is a function">
        Always call the getter as a function: <code class="rounded bg-white/10 px-1">count()</code>, not{' '}
        <code class="rounded bg-white/10 px-1">count</code>. Passing the getter (not calling it) lets you pass
        reactivity around without subscribing.
      </Callout>

      <PatternSection
        title="Passing Reactivity"
        description="Pass the getter function (without calling it) to defer reading and preserve the reactive subscription at the call site."
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

function SignalDemo(): JSX.Element {
  const [count, setCount] = createSignal(0);
  const [name, setName] = createSignal('World');

  return (
    <Card class="flex flex-col gap-4">
      <div class="flex items-center gap-3">
        <span class="text-xs text-neutral-400">count:</span>
        <span class="font-mono text-lg font-bold text-violet-300">{count()}</span>
        <Button size="sm" variant="outline" onClick={() => setCount((c) => c - 1)}>
          −
        </Button>
        <Button size="sm" variant="outline" onClick={() => setCount((c) => c + 1)}>
          +
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCount(0)}>
          reset
        </Button>
      </div>

      <div class="flex items-center gap-3">
        <span class="text-xs text-neutral-400">name:</span>
        <input
          class="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1 text-sm text-white focus:border-violet-500 focus:outline-none"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <span class="text-sm text-neutral-300">Hello, {name()}!</span>
      </div>
    </Card>
  );
}
