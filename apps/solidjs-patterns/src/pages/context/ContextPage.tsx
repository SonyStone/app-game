import { createContext, createSignal, useContext, type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../../components/PatternLayout';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import example1Html, {
  code as example1Code,
  language as example1Language
} from './context-example-1.txt?shiki&lang=tsx';
import example2Html, {
  code as example2Code,
  language as example2Language
} from './context-example-2.txt?shiki&lang=tsx';
import example3Html, {
  code as example3Code,
  language as example3Language
} from './context-example-3.txt?shiki&lang=tsx';

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
        <CodeBlock language={example1Language} code={example1Code}>
          {template(example1Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="Context with signals (reactive context)"
        description="Wrap a signal or store in context to share reactive state without prop drilling."
      >
        <CodeBlock language={example2Language} code={example2Code}>
          {template(example2Html)()}
        </CodeBlock>
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
