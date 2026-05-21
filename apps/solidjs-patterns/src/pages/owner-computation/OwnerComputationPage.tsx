import { For, type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../../components/PatternLayout';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import example1Html, {
  code as example1Code,
  language as example1Language
} from './owner-computation-example-1.txt?shiki&lang=ts';
import example2Html, {
  code as example2Code,
  language as example2Language
} from './owner-computation-example-2.txt?shiki&lang=ts';
import example3Html, {
  code as example3Code,
  language as example3Language
} from './owner-computation-example-3.txt?shiki&lang=tsx';

// ============================================================================
// MARK: Types
// ============================================================================

type PrimitiveNote = {
  name: string;
  purity: 'pure' | 'not pure';
  timing: string;
  summary: string;
};

// ============================================================================
// MARK: Owner & Computation Page
// ============================================================================

export default function OwnerComputationPage(): JSX.Element {
  return (
    <PatternLayout
      title="Owner & Computation"
      badge="Advanced"
      description="A mental model for SolidJS internals: owner scopes, computation nodes, and how the main reactive primitives fit together."
    >
      <Callout type="info" title="Start with two graphs, not one">
        Solid maintains both an ownership tree and a dependency graph. They are closely related, but they solve
        different problems: owners manage scope, cleanup, and context; computations manage reactive execution.
      </Callout>

      <PatternSection
        title="Owner"
        description="An owner is a scope node in Solid's ownership tree. It links parent/child scopes, cleanup callbacks, and context."
      >
        <div class="flex flex-col gap-3 text-baseleading-6 dark:text-slate-300">
          <p>
            An owner is not necessarily a computation. Think of it as the scope object that ties together lifecycle,
            context propagation, and cleanup chains. It points to its parent through <InlineCode>owner</InlineCode>, its
            child scopes through <InlineCode>owned</InlineCode>, and its teardown callbacks through
            <InlineCode>cleanups</InlineCode>.
          </p>
          <p>
            A component does not automatically become a computation node. If it contains no effect, memo, or other
            reactive primitive, it can simply execute inside the parent's owner scope.
          </p>
        </div>

        <CodeBlock language={example1Language} code={example1Code} title="owner.ts">
          {template(example1Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="Computation"
        description="A computation is an owner plus reactive execution state: a function to run, dependencies to track, and cached state to update."
      >
        <div class="flex flex-col gap-3 text-baseleading-6 dark:text-slate-300">
          <p>
            Every <InlineCode>createEffect</InlineCode>, <InlineCode>createMemo</InlineCode>, and
            <InlineCode>createComputed</InlineCode> creates its own computation node. That node stores the function,
            dependency list, current state, and most recent value.
          </p>
          <p>
            Internally, Solid uses a helper called <InlineCode>createComputation</InlineCode> to create those nodes in
            the dependency graph. A computation knows its owner, the signals it depends on, and the bookkeeping needed
            to keep the graph in sync in both directions.
          </p>
        </div>

        <CodeBlock language={example2Language} code={example2Code} title="computation.ts">
          {template(example2Html)()}
        </CodeBlock>
      </PatternSection>

      <Callout type="tip" title="A useful rule of thumb">
        Owners answer “who owns this scope?” and computations answer “what should re-run when dependencies change?” Many
        nodes participate in both structures, but the roles are still distinct.
      </Callout>

      <PatternSection
        title="How common primitives map onto computations"
        description="The main difference between these primitives is when they run and whether they are considered pure."
      >
        <div class="grid gap-3 lg:grid-cols-2">
          <For each={PRIMITIVE_NOTES}>{(note) => <PrimitiveCard note={note} />}</For>
        </div>
      </PatternSection>

      <PatternSection
        title="createSelector"
        description="createSelector is useful when many subscribers care about whether one key matches the current selection."
      >
        <div class="flex flex-col gap-3 text-baseleading-6 dark:text-slate-300">
          <p>
            Each subscriber only reacts when its key starts matching or stops matching. For large selectable lists, that
            is much cheaper than making every item recompute a generic equality check on every update.
          </p>
        </div>

        <CodeBlock language={example3Language} code={example3Code} title="selector-list.tsx">
          {template(example3Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="createRoot"
        description="createRoot creates a new owner scope without creating a computation node. It establishes ownership, not a new reactive effect."
      >
        <div class="flex flex-col gap-3 text-baseleading-6 dark:text-slate-300">
          <p>
            It helps to read the API surface this way: <InlineCode>createEffect</InlineCode> creates a computation,
            while <InlineCode>createRoot</InlineCode> creates a scope. Computations become children of their owner all
            the way up to a root owner created by <InlineCode>createRoot</InlineCode> or <InlineCode>render</InlineCode>
            .
          </p>
          <p>
            In practice, <InlineCode>createRoot</InlineCode> is useful for manual lifecycle control, isolated scopes,
            and some tooling or debugging scenarios.
          </p>
        </div>

        <Card class="flex flex-col gap-2 text-baseleading-6 dark:text-slate-300">
          <div>
            <span class="font-semibold text-slate-100">Short version:</span> computations create child owners, but not
            every owner is a computation.
          </div>
        </Card>
      </PatternSection>

      <PatternSection title="References" description="Primary sources for the internal details summarized above.">
        <ReferenceCard>
          <ReferenceLink href="https://github.com/solidjs/solid/blob/a5b51fe200fd59a158410f4008677948fec611d9/packages/solid/src/reactive/signal.ts#L95">
            Owner and computation source
          </ReferenceLink>
          <ReferenceLink href="https://docs.solidjs.com/reference/secondary-primitives/create-computed">
            createComputed docs
          </ReferenceLink>
          <ReferenceLink href="https://docs.solidjs.com/reference/secondary-primitives/create-render-effect">
            createRenderEffect docs
          </ReferenceLink>
          <ReferenceLink href="https://docs.solidjs.com/reference/basic-reactivity/create-effect">
            createEffect docs
          </ReferenceLink>
          <ReferenceLink href="https://docs.solidjs.com/reference/secondary-primitives/create-reaction">
            createReaction docs
          </ReferenceLink>
          <ReferenceLink href="https://docs.solidjs.com/reference/basic-reactivity/create-memo">
            createMemo docs
          </ReferenceLink>
          <ReferenceLink href="https://docs.solidjs.com/reference/secondary-primitives/create-deferred">
            createDeferred docs
          </ReferenceLink>
          <ReferenceLink href="https://docs.solidjs.com/reference/secondary-primitives/create-selector">
            createSelector docs
          </ReferenceLink>
          <ReferenceLink href="https://docs.solidjs.com/reference/reactive-utilities/catch-error">
            catchError docs
          </ReferenceLink>
        </ReferenceCard>
      </PatternSection>
    </PatternLayout>
  );
}

// ============================================================================
// MARK: Sub-Components
// ============================================================================

function PrimitiveCard(props: { note: PrimitiveNote }): JSX.Element {
  return (
    <Card class="flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <h3 class="text-basefont-semibold text-slate-100">{props.note.name}</h3>
        <Badge variant={props.note.purity === 'pure' ? 'success' : 'warning'}>{props.note.purity}</Badge>
      </div>
      <p class="text-xs text-slate-500">{props.note.timing}</p>
      <p class="text-baseleading-6 dark:text-slate-300">{props.note.summary}</p>
    </Card>
  );
}

function InlineCode(props: { children: JSX.Element }): JSX.Element {
  return <code class="rounded bg-white/10 px-1 py-0.5 text-[11px] text-slate-200">{props.children}</code>;
}

function ReferenceCard(props: { children: JSX.Element }): JSX.Element {
  return <ul class="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4">{props.children}</ul>;
}

function ReferenceLink(props: { href: string; children: JSX.Element }): JSX.Element {
  return (
    <li>
      <a
        href={props.href}
        target="_blank"
        rel="noreferrer"
        class="text-basetext-violet-300 underline decoration-violet-800 underline-offset-4 transition-colors hover:text-violet-200"
      >
        {props.children}
      </a>
    </li>
  );
}

// ============================================================================
// MARK: Data
// ============================================================================

const PRIMITIVE_NOTES: PrimitiveNote[] = [
  {
    name: 'createComputed',
    purity: 'pure',
    timing: 'Runs immediately before render.',
    summary: 'A reactive computation used mainly for synchronously writing into other primitives.'
  },
  {
    name: 'createRenderEffect',
    purity: 'not pure',
    timing: 'Runs during render while DOM is being created or updated.',
    summary: 'Useful when work must stay tightly coupled to DOM creation and update timing.'
  },
  {
    name: 'createEffect',
    purity: 'not pure',
    timing: 'Runs after the render phase.',
    summary: 'The standard side-effect primitive for async work, logging, subscriptions and DOM interactions.'
  },
  {
    name: 'createReaction',
    purity: 'not pure',
    timing: 'Runs after render with explicit tracking control.',
    summary: 'Lets you separate dependency tracking from the callback that should run on the next invalidation.'
  },
  {
    name: 'createMemo',
    purity: 'pure',
    timing: 'Derived value inside the reactive graph.',
    summary: 'Readonly memoized signal for deterministic derived state.'
  },
  {
    name: 'createDeferred',
    purity: 'pure',
    timing: 'Defers notifications until the browser is idle.',
    summary: 'Useful when derived updates may lag behind more urgent UI interactions.'
  },
  {
    name: 'createSelector',
    purity: 'pure',
    timing: 'Conditional signal keyed by equality against the current selected value.',
    summary: 'Notifies subscribers only when their key starts or stops matching the current selection.'
  },
  {
    name: 'catchError',
    purity: 'pure',
    timing: 'Wraps child scopes and reacts when they throw.',
    summary: 'Provides a reactive error-boundary-style primitive for child computation scopes.'
  },
  {
    name: 'devComponent',
    purity: 'pure',
    timing: 'Development-only internal helper.',
    summary: 'Not a public everyday primitive, but it still participates in the same owner/computation model.'
  }
];
