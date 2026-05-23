import { type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../../components/CodeBlock';
import { Callout, PatternLayout, PatternSection } from '../../components/PatternLayout';
import { Card } from '../../components/ui/Card';
import componentHtml, { code as componentCode, language as componentLanguage } from './component?shiki';
import example1Html, { code as example1Code, language as example1Language } from './pass-data-example-1?shiki';
import example2Html, { code as example2Code, language as example2Language } from './pass-data-example-2?shiki';
import example3Html, { code as example3Code, language as example3Language } from './pass-data-example-3?shiki';
import example4Html, { code as example4Code, language as example4Language } from './pass-data-example-4?shiki';
import example5Html, { code as example5Code, language as example5Language } from './pass-data-example-5?shiki';

// ============================================================================
// MARK: Pass Data Page
// ============================================================================

export default function PassDataPage(): JSX.Element {
  return (
    <PatternLayout
      title="Pass Data"
      badge="Components"
      description="Practical ways to move data and behavior through a SolidJS component tree: props, refs, polymorphic components, context, resolved children, and shared roots."
    >
      <PatternSection
        title="Props preserve reactivity"
        description="Props can hold either plain values or getter-backed properties, so Solid can defer reads until the child actually accesses them."
      >
        <div class="text-baseleading-6 flex flex-col gap-3 dark:text-slate-300">
          <p>
            A component receives a props object through a call like <InlineCode>Comp(props)</InlineCode>. When a prop
            comes from a signal or another getter, Solid tries to keep that access lazy instead of eagerly reading it at
            the call site.
          </p>
          <p>
            In simplified terms, JSX like <InlineCode>{'rotate={props.subsecond}'}</InlineCode> becomes a getter on the
            props object. The component is then invoked through <InlineCode>untrack</InlineCode>, which avoids creating
            an accidental subscription just because the component was called.
          </p>
        </div>

        <CodeBlock language={example1Language} code={example1Code} title="props-lowering.tsx">
          {template(example1Html)()}
        </CodeBlock>
        {/* <div class="absolute rounded bg-white p-2 text-black">
          <A href="https://github.com/solidjs/solid/blob/128225942095f51f9b49a3f8fdc1bd7e3b9ee97b/packages/solid/src/render/component.ts#L96">
            createComponent source
          </A>
        </div> */}
        <CodeBlock language={componentLanguage} code={componentCode} title="component.ts">
          {template(componentHtml)()}
        </CodeBlock>
      </PatternSection>

      <Callout type="tip" title="Pass a getter when the child should own the subscription">
        If you pass an already-read value, the subscription happens in the current scope. If you pass the getter itself,
        the child can decide when to read it and where the reactive boundary should live.
      </Callout>

      <PatternSection
        title="Use ref as an output channel"
        description="A ref callback lets a child hand a concrete object back to its parent, usually a DOM node."
      >
        <div class="flex flex-col gap-3 text-base leading-6 dark:text-slate-300">
          <p>
            <InlineCode>props.ref</InlineCode> is just another callback prop. The child exposes a DOM element or some
            other object, and the parent decides what to do with it.
          </p>
          <p>
            That makes <InlineCode>ref</InlineCode> similar in spirit to <InlineCode>onClick</InlineCode> or any other
            callback prop: the child publishes something outward instead of fully owning the interaction.
          </p>
        </div>

        <CodeBlock language={example2Language} code={example2Code} title="ref-output.tsx">
          {template(example2Html)()}
        </CodeBlock>
      </PatternSection>

      <PatternSection
        title="Build polymorphic components with as and Dynamic"
        description="A common pattern is to accept an as prop, split it out, and render the final element through Dynamic."
      >
        <div class="flex flex-col gap-3 text-base leading-6 dark:text-slate-300">
          <p>
            This lets you swap the underlying tag or component without duplicating behavior. It is the core idea behind
            polymorphic APIs such as button components that can also render as links.
          </p>
        </div>

        <CodeBlock language={example3Language} code={example3Code} title="polymorphic-button.tsx">
          {template(example3Html)()}
        </CodeBlock>

        <ReferenceCard>
          <ReferenceLink href="https://docs.solidjs.com/reference/components/dynamic">Dynamic reference</ReferenceLink>
          <ReferenceLink href="https://docs.solidjs.com/concepts/control-flow/dynamic">Dynamic concepts</ReferenceLink>
          <ReferenceLink href="https://github.com/solidjs/solid/blob/a5b51fe200fd59a158410f4008677948fec611d9/packages/solid/web/src/index.ts#L131">
            createDynamic source
          </ReferenceLink>
          <ReferenceLink href="https://github.com/kobaltedev/kobalte/blob/2d05356cecf7e189034f1f94f9f92f63cce216de/packages/core/src/polymorphic/polymorphic.tsx#L55">
            Kobalte Polymorphic example
          </ReferenceLink>
        </ReferenceCard>
      </PatternSection>

      <PatternSection
        title="Use context for shared subtree state"
        description="Context moves shared values through a subtree without manually threading props through every intermediate component."
      >
        <div class="text-baseleading-6 flex flex-col gap-3 dark:text-slate-300">
          <p>
            Internally, Solid stores context on owner nodes. When a provider renders, it creates a new scope, writes a
            value into that owner context, and lets descendants read it with <InlineCode>useContext</InlineCode>.
          </p>
          <p>
            This works well for things like theme objects, scoped services, or state that many descendants need at the
            same time.
          </p>
        </div>

        <CodeBlock language={example4Language} code={example4Code} title="context-provider.tsx">
          {template(example4Html)()}
        </CodeBlock>
      </PatternSection>

      <Callout type="warning" title="Context is best for stable APIs">
        During HMR, editing a provider can sometimes leave descendants temporarily detached from their context until a
        full reload. It is a small annoyance, but it reinforces a useful rule: context is best for stable shared APIs,
        not rapidly changing local implementation details.
      </Callout>

      <PatternSection
        title="Resolve children explicitly when you need to inspect them"
        description="children(() => props.children) normalizes incoming JSX so you can work with the resolved result instead of an opaque prop."
      >
        <div class="text-baseleading-6 flex flex-col gap-3 dark:text-slate-300">
          <p>
            The <InlineCode>children</InlineCode> helper recursively unwraps child functions until it reaches concrete
            JSX values: DOM nodes, strings, numbers, booleans, <InlineCode>null</InlineCode>, or
            <InlineCode>undefined</InlineCode>.
          </p>
          <p>
            This is useful when a component needs to normalize its children once and then treat them like regular data.
          </p>
        </div>

        <CodeBlock language={example5Language} code={example5Code} title="resolve-children.tsx">
          {template(example5Html)()}
        </CodeBlock>

        <Card class="flex flex-col gap-3">
          <h3 class="text-basefont-semibold text-slate-100">Related primitives</h3>
          <div class="text-baseleading-6 flex flex-col gap-2 dark:text-slate-300">
            <p>
              <strong>solid-primitives</strong> includes <InlineCode>resolveFirst</InlineCode> and{' '}
              <InlineCode>resolveElements</InlineCode>. They are similar to <InlineCode>children</InlineCode>, but also
              let you filter the resolved output with a predicate.
            </p>
            <p>
              <InlineCode>createSingletonRoot</InlineCode> from the rootless package creates a shared global object with
              its own computation context and lifecycle. A good mental model is a reference-counted smart pointer: the
              root exists only while something is using it.
            </p>
          </div>
          <ReferenceCard>
            <ReferenceLink href="https://primitives.solidjs.community/package/refs/#resolveelements">
              resolveElements / resolveFirst
            </ReferenceLink>
            <ReferenceLink href="https://primitives.solidjs.community/package/rootless/#createsingletonroot">
              createSingletonRoot
            </ReferenceLink>
          </ReferenceCard>
        </Card>
      </PatternSection>

      <PatternSection title="References" description="Primary sources for the patterns summarized above.">
        <ReferenceCard>
          <ReferenceLink href="https://docs.solidjs.com/concepts/components/props">Props concept docs</ReferenceLink>
          <ReferenceLink href="https://github.com/solidjs/solid/blob/a5b51fe200fd59a158410f4008677948fec611d9/packages/solid/src/render/component.ts#L112">
            createComponent source
          </ReferenceLink>
          <ReferenceLink href="https://github.com/solidjs/solid/blob/a5b51fe200fd59a158410f4008677948fec611d9/packages/solid/src/reactive/signal.ts#L1203">
            createContext source
          </ReferenceLink>
          <ReferenceLink href="https://docs.solidjs.com/reference/component-apis/create-context">
            createContext docs
          </ReferenceLink>
          <ReferenceLink href="https://github.com/solidjs/solid/blob/a5b51fe200fd59a158410f4008677948fec611d9/packages/solid/src/reactive/signal.ts#L1743">
            children / resolveChildren source
          </ReferenceLink>
        </ReferenceCard>
      </PatternSection>
    </PatternLayout>
  );
}

// ============================================================================
// MARK: Supporting UI
// ============================================================================

function InlineCode(props: { children: JSX.Element }): JSX.Element {
  return (
    <code class="rounded bg-white/10 px-1 py-0.5 text-[11px] text-slate-900 dark:text-slate-200">{props.children}</code>
  );
}

function ReferenceCard(props: { children: JSX.Element }): JSX.Element {
  return (
    <ul class="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-200 p-4 dark:bg-slate-900">
      {props.children}
    </ul>
  );
}

function ReferenceLink(props: { href: string; children: JSX.Element }): JSX.Element {
  return (
    <li>
      <a
        href={props.href}
        target="_blank"
        rel="noreferrer"
        class="text-basetext-violet-300 text-violet-900 underline decoration-violet-800 underline-offset-4 transition-colors hover:text-violet-200"
      >
        {props.children}
      </a>
    </li>
  );
}
