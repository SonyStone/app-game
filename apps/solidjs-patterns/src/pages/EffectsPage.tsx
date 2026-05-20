import { createEffect, createSignal, type JSX } from 'solid-js';
import { CodeBlock } from '../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../components/PatternLayout';
import { Card } from '../components/ui/Card';

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
        <CodeBlock
          language="tsx"
          code={`import { createSignal, createEffect } from 'solid-js';

const [count, setCount] = createSignal(0);

createEffect(() => {
  // Runs immediately, then on every count() change
  console.log('count changed:', count());
  document.title = \`Count: \${count()}\`;
});`}
        />
      </PatternSection>

      <PatternSection
        title="onCleanup"
        description="Registers a cleanup function that runs before the effect re-runs and when the owner disposes."
      >
        <CodeBlock
          language="tsx"
          code={`import { createEffect, onCleanup } from 'solid-js';

createEffect(() => {
  const id = setInterval(() => console.log('tick'), 1000);

  // Runs before next effect execution or on dispose
  onCleanup(() => clearInterval(id));
});`}
        />
      </PatternSection>

      <PatternSection
        title="onMount / onCleanup in components"
        description="onMount runs once after the component mounts. Use onCleanup for teardown."
      >
        <CodeBlock
          language="tsx"
          code={`import { onMount, onCleanup } from 'solid-js';

function ResizeWatcher() {
  onMount(() => {
    const handler = () => console.log(window.innerWidth);
    window.addEventListener('resize', handler);
    onCleanup(() => window.removeEventListener('resize', handler));
  });
  return null;
}

// ✅ Better: use @solid-primitives/event-listener
import { makeEventListener } from '@solid-primitives/event-listener';

function ResizeWatcher() {
  onMount(() => {
    makeEventListener(window, 'resize', () => console.log(window.innerWidth));
    // Cleaned up automatically on unmount
  });
  return null;
}`}
        />
      </PatternSection>

      <Callout type="warning" title="Effects run after render">
        <code class="rounded bg-white/10 px-1">createEffect</code> is scheduled after the DOM has updated. For
        synchronous tracking during rendering, use <code class="rounded bg-white/10 px-1">createRenderEffect</code>.
      </Callout>

      <PatternSection
        title="on() — explicit dependencies"
        description="on() lets you specify dependencies explicitly, avoiding implicit tracking. Useful for watching specific signals."
      >
        <CodeBlock
          language="tsx"
          code={`import { createSignal, createEffect, on } from 'solid-js';

const [source, setSource] = createSignal(0);
const [other, setOther] = createSignal('hello');

// Only re-runs when source changes — other is not tracked
createEffect(on(source, (value, prevValue) => {
  console.log('source:', value, 'was:', prevValue);
  // Safe to read other() here without subscribing
  console.log('other snapshot:', other());
}));

// Defer first run (don't run on init)
createEffect(on(source, () => {
  console.log('source changed (not initial)');
}, { defer: true }));`}
        />
      </PatternSection>

      <PatternSection
        title="Tracking context"
        description="Only code inside a reactive root tracks dependencies. Reading signals outside tracking context (e.g. in async callbacks) won't subscribe."
      >
        <CodeBlock
          language="tsx"
          code={`import { createSignal, createEffect, untrack } from 'solid-js';

const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

createEffect(() => {
  // Tracks a — effect re-runs when a changes
  const aVal = a();

  // Does NOT track b — untrack reads without subscribing
  const bVal = untrack(() => b());

  console.log(aVal + bVal);
});`}
        />
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
