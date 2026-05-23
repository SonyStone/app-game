<Page
title="Owner & Computation"
badge="Advanced"
description="A mental model for SolidJS internals: owner scopes, computation nodes, and how the main reactive primitives fit together."

>   <Callout type="info" title="Start with two graphs, not one">

    Solid maintains both an ownership tree and a dependency graph. They are closely related, but they solve different
    problems: owners manage scope, cleanup, and context; computations manage reactive execution.

  </Callout>

  <Section
    title="Owner"
    description="An owner is a scope node in Solid's ownership tree. It links parent/child scopes, cleanup callbacks, and context."
  >
    An owner is not necessarily a computation. Think of it as the scope object that ties together lifecycle, context
    propagation, and cleanup chains. It points to its parent through <code>owner</code>, its child scopes through <code>
      owned
    </code>, and its teardown callbacks through <code>cleanups</code>.

    A component does not automatically become a computation node. If it contains no effect, memo, or other reactive
    primitive, it can simply execute inside the parent's owner scope.

```ts title="owner.ts"
export interface Owner {
  owned: Computation<any>[] | null;
  cleanups: (() => void)[] | null;
  owner: Owner | null;
  context: any | null;
  sourceMap?: SourceMapValue[];
  name?: string;
}
```

  </Section>

  <Section
    title="Computation"
    description="A computation is an owner plus reactive execution state: a function to run, dependencies to track, and cached state to update."
  >
    Every <code>createEffect</code>, <code>createMemo</code>, and <code>createComputed</code> creates its own
    computation node. That node stores the function, dependency list, current state, and most recent value.

    Internally, Solid uses a helper called <code>createComputation</code> to create those nodes in the dependency
    graph. A computation knows its owner, the signals it depends on, and the bookkeeping needed to keep the graph in
    sync in both directions.

```ts title="computation.ts"
export interface Computation<Init, Next extends Init = Init> extends Owner {
  fn: EffectFunction<Init, Next>;
  state: ComputationState;
  tState?: ComputationState;
  sources: SignalState<Next>[] | null;
  sourceSlots: number[] | null;
  value?: Init;
  updatedAt: number | null;
  pure: boolean;
  user?: boolean;
  suspense?: SuspenseContextType;
}
```

  </Section>

  <Callout type="tip" title="A useful rule of thumb">
    Owners answer "who owns this scope?" and computations answer "what should re-run when dependencies change?" Many
    nodes participate in both structures, but the roles are still distinct.
  </Callout>

  <Section
    title="How common primitives map onto computations"
    description="The main difference between these primitives is when they run and whether they are considered pure."
  >
    <PrimitiveGrid />
  </Section>

  <Section
    title="createSelector"
    description="createSelector is useful when many subscribers care about whether one key matches the current selection."
  >
    Each subscriber only reacts when its key starts matching or stops matching. For large selectable lists, that is
    much cheaper than making every item recompute a generic equality check on every update.

```tsx title="selector-list.tsx"
const isSelected = createSelector(selectedId);

<For each={list()}>{(item) => <li classList={{ active: isSelected(item.id) }}>{item.name}</li>}</For>;
```

  </Section>

  <Section
    title="createRoot"
    description="createRoot creates a new owner scope without creating a computation node. It establishes ownership, not a new reactive effect."
  >
    It helps to read the API surface this way: <code>createEffect</code> creates a computation, while <code>
      createRoot
    </code> creates a scope. Computations become children of their owner all the way up to a root owner created by <code>
      createRoot
    </code> or <code>render</code>.

    In practice, <code>createRoot</code> is useful for manual lifecycle control, isolated scopes, and some tooling or
    debugging scenarios.

    <ShortVersionCard />

  </Section>

  <Section title="References" description="Primary sources for the internal details summarized above.">
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
  </Section>
</Page>
