import { createEffect, createSignal, type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../../components/PatternLayout';
import { Card } from '../../components/ui/Card';
import example1Html, {
  code as example1Code,
  language as example1Language
} from './effects-example-1.txt?shiki&lang=tsx';
import example2Html, {
  code as example2Code,
  language as example2Language
} from './effects-example-2.txt?shiki&lang=tsx';
import example3Html, {
  code as example3Code,
  language as example3Language
} from './effects-example-3.txt?shiki&lang=tsx';
import example4Html, {
  code as example4Code,
  language as example4Language
} from './effects-example-4.txt?shiki&lang=tsx';
import example5Html, {
  code as example5Code,
  language as example5Language
} from './effects-example-5.txt?shiki&lang=tsx';

// ============================================================================
// MARK: Effects Page
// ============================================================================

export default function EffectsPage(): JSX.Element {
  return (
    <PatternLayout
      title="Effects"
      badge="Core"
      description="Effects run side-effects in response to reactive changes. SolidJS provides createEffect, onMount, and onCleanup as the primary tools."
    >
      <PatternSection
        title="createEffect"
        description="Runs immediately and re-runs whenever its reactive dependencies change. Not for producing values — use createMemo for that."
      >
        <CodeBlock language={example1Language} code={example1Code}>
          {template(example1Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="onCleanup"
        description="Registers a cleanup function that runs before the effect re-runs and when the owner disposes."
      >
        <CodeBlock language={example2Language} code={example2Code}>
          {template(example2Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="onMount / onCleanup in components"
        description="onMount runs once after the component mounts. Use onCleanup for teardown."
      >
        <CodeBlock language={example3Language} code={example3Code}>
          {template(example3Html)()}
        </CodeBlock>
      </PatternSection>

      <Callout type="warning" title="Effects run after render">
        <code class="rounded bg-white/10 px-1">createEffect</code> is scheduled after the DOM has updated. For
        synchronous tracking during rendering, use <code class="rounded bg-white/10 px-1">createRenderEffect</code>.
      </Callout>

      <PatternSection
        title="on() — explicit dependencies"
        description="on() lets you specify dependencies explicitly, avoiding implicit tracking. Useful for watching specific signals."
      >
        <CodeBlock language={example4Language} code={example4Code}>
          {template(example4Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="Tracking context"
        description="Only code inside a reactive root tracks dependencies. Reading signals outside tracking context (e.g. in async callbacks) won't subscribe."
      >
        <CodeBlock language={example5Language} code={example5Code}>
          {template(example5Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection title="Live Demo">
        <EffectsDemo />
      </PatternSection>
    </PatternLayout>
  );
}

// ============================================================================
// MARK: Live Demo
// ============================================================================

function EffectsDemo(): JSX.Element {
  const [logs, setLogs] = createSignal<string[]>([]);
  const [count, setCount] = createSignal(0);

  const addLog = (msg: string) =>
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 8));

  createEffect(() => {
    const c = count();
    if (c === 0) {
      addLog('effect ran: count = 0 (initial)');
    } else {
      addLog(`effect ran: count changed to ${c}`);
    }
  });

  return (
    <Card class="flex flex-col gap-4">
      <div class="flex items-center gap-3">
        <span class="text-xs text-neutral-400">count: </span>
        <span class="font-mono font-bold text-violet-300">{count()}</span>
        <button
          class="rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
          onClick={() => setCount((c) => c + 1)}
        >
          increment
        </button>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-[10px] font-semibold tracking-wider text-neutral-600 uppercase">Effect log</span>
        <div class="space-y-0.5 rounded-lg bg-neutral-950 p-3 font-mono text-xs text-neutral-400">
          {logs().map((log) => (
            <div>{log}</div>
          ))}
        </div>
      </div>
    </Card>
  );
}
