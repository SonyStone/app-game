import { createContext, createSignal, useContext, type JSX } from 'solid-js';
import { CodeBlock } from '../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../components/PatternLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

// ============================================================================
// MARK: Context Page
// ============================================================================

export default function ContextPage(): JSX.Element {
  return (
    <PatternLayout
      title="Context"
      badge="State"
      description="createContext and useContext provide a scoped dependency injection mechanism. Context values are available to all descendants without prop drilling."
    >
      <PatternSection
        title="createContext"
        description="createContext creates a context object with an optional default value. The actual value is provided by a Context.Provider."
      >
        <CodeBlock
          language="tsx"
          code={`import { createContext, useContext } from 'solid-js';

// Create the context with a default value
const ThemeContext = createContext<'light' | 'dark'>('dark');

// Provide a value to descendants
function App() {
  return (
    <ThemeContext.Provider value="light">
      <Page />
    </ThemeContext.Provider>
  );
}

// Consume anywhere in the subtree
function Button() {
  const theme = useContext(ThemeContext);
  return <button class={theme === 'dark' ? 'btn-dark' : 'btn-light'}>Click</button>;
}`}
        />
      </PatternSection>

      <PatternSection
        title="Context with signals (reactive context)"
        description="Wrap a signal or store in context to share reactive state without prop drilling."
      >
        <CodeBlock
          language="tsx"
          code={`import { createContext, createSignal, useContext, type Accessor, type Setter } from 'solid-js';

type CounterContextValue = {
  count: Accessor<number>;
  increment: () => void;
  decrement: () => void;
};

const CounterContext = createContext<CounterContextValue>();

export function CounterProvider(props: { children: JSX.Element }) {
  const [count, setCount] = createSignal(0);

  return (
    <CounterContext.Provider value={{
      count,
      increment: () => setCount(c => c + 1),
      decrement: () => setCount(c => c - 1)
    }}>
      {props.children}
    </CounterContext.Provider>
  );
}

export function useCounter(): CounterContextValue {
  const ctx = useContext(CounterContext);
  if (!ctx) throw new Error('useCounter must be used inside CounterProvider');
  return ctx;
}`}
        />
      </PatternSection>

      <PatternSection title="Live Demo">
        <ContextDemo />
      </PatternSection>

      <Callout type="tip" title="Guard with a custom hook">
        Always create a named hook (e.g. <code class="rounded bg-white/10 px-1">useCounter()</code>) that calls{' '}
        <code class="rounded bg-white/10 px-1">useContext</code> and throws if the provider is missing. This gives
        better error messages than silently returning undefined.
      </Callout>

      <PatternSection
        title="Context vs signals"
        description="Use context for values that need to be scoped to a subtree. For truly global state, a module-level signal or store works fine."
      >
        <CodeBlock
          language="tsx"
          code={`// ✅ Module-level signal — truly global, no provider needed
export const [globalTheme, setGlobalTheme] = createSignal<'light' | 'dark'>('dark');

// ✅ Context — scoped, supports multiple instances, testable
export const ThemeContext = createContext<Theme>('dark');

// Use context when:
// - You want to scope state to a subtree
// - You have multiple instances (e.g., nested providers)
// - You want to swap implementations in tests`}
        />
      </PatternSection>
    </PatternLayout>
  );
}

// ============================================================================
// MARK: Live Demo
// ============================================================================

type CounterCtx = { count: () => number; inc: () => void; dec: () => void };
const DemoContext = createContext<CounterCtx>();

function DemoProvider(props: { children: JSX.Element }): JSX.Element {
  const [count, setCount] = createSignal(0);
  return (
    <DemoContext.Provider value={{ count, inc: () => setCount((c) => c + 1), dec: () => setCount((c) => c - 1) }}>
      {props.children}
    </DemoContext.Provider>
  );
}

function CounterDisplay(): JSX.Element {
  const ctx = useContext(DemoContext)!;
  return (
    <div class="flex items-center gap-3 rounded-lg bg-neutral-800/50 px-4 py-3">
      <span class="text-xs text-neutral-500">CounterDisplay reads context:</span>
      <span class="font-mono text-lg font-bold text-violet-300">{ctx.count()}</span>
    </div>
  );
}

function CounterButtons(): JSX.Element {
  const ctx = useContext(DemoContext)!;
  return (
    <div class="flex gap-2">
      <Button size="sm" variant="outline" onClick={ctx.dec}>
        −
      </Button>
      <Button size="sm" variant="outline" onClick={ctx.inc}>
        +
      </Button>
    </div>
  );
}

function ContextDemo(): JSX.Element {
  return (
    <Card>
      <DemoProvider>
        <div class="flex flex-col gap-3">
          <p class="text-xs text-neutral-500">
            Both components below consume from the same <code class="rounded bg-white/10 px-1">DemoContext</code> — no
            prop drilling.
          </p>
          <CounterDisplay />
          <CounterButtons />
        </div>
      </DemoProvider>
    </Card>
  );
}
