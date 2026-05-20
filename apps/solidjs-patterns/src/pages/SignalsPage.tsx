import { createSignal, type JSX } from 'solid-js';
import { CodeBlock } from '../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../components/PatternLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

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
        title="Basic Signal"
        description="createSignal returns a getter and setter tuple. The getter is a function — calling it inside a reactive context subscribes to changes."
      >
        <CodeBlock
          language="tsx"
          title="basic-signal.tsx"
          code={`import { createSignal } from 'solid-js';

const [count, setCount] = createSignal(0);

// Read: call the getter
console.log(count()); // 0

// Write: call the setter
setCount(1);
setCount(prev => prev + 1); // functional update`}
        />
      </PatternSection>

      <PatternSection title="Live Demo">
        <SignalDemo />
      </PatternSection>

      <PatternSection
        title="Equality Check"
        description="Signals skip notifications when the new value equals the old one. Customize with the equals option."
      >
        <CodeBlock
          language="tsx"
          code={`// Custom equality — always notify (useful for arrays/objects)
const [items, setItems] = createSignal([], { equals: false });

// Never re-run subscribers (suppress updates)
const [data, setData] = createSignal(initialData, { equals: () => true });

// Custom comparator
const [pos, setPos] = createSignal(
  { x: 0, y: 0 },
  { equals: (a, b) => a.x === b.x && a.y === b.y }
);`}
        />
      </PatternSection>

      <PatternSection
        title="Signals vs State"
        description="Unlike React useState, signals are not tied to components. They can live outside components and be shared freely."
      >
        <CodeBlock
          language="tsx"
          code={`// Global signal — lives outside any component
export const [theme, setTheme] = createSignal<'light' | 'dark'>('dark');

// Use in any component without prop drilling
function ThemeToggle() {
  return (
    <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
      Current: {theme()}
    </button>
  );
}`}
        />
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
        <CodeBlock
          language="tsx"
          code={`// ✅ Pass getter — child subscribes at its own level
function Parent() {
  const [count, setCount] = createSignal(0);
  return <Display value={count} />;
  //                      ^^^^^ pass getter, not count()
}

function Display(props: { value: Accessor<number> }) {
  return <span>{props.value()}</span>;
  //            ^^^^^^^^^^^^^ subscribe here
}

// ❌ Pass value — breaks reactivity, static snapshot
function Parent() {
  const [count] = createSignal(0);
  return <Display value={count()} />; // count() is 0 forever
}`}
        />
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
