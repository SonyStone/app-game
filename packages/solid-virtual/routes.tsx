import { lazy, Suspense, type Component, type JSX } from 'solid-js';

const FixedHeightExample = lazy(() => import('./examples/virtual-scroll'));
const DynamicHeightExample = lazy(() =>
  import('./examples/virtual-scroll').then((module) => ({ default: module.DynamicHeightVirtualScrollExample }))
);
const NestedVirtualExample = lazy(() => import('./examples/virtual-scroll-nested'));

/** Main-application route for the package and its examples. */
export const solidVirtualRoutes = {
  path: '/solid-virtual',
  name: 'Solid Virtual',
  Preview: PackagePreview,
  children: [
    {
      path: '/',
      name: 'Fixed height',
      Preview: ExampleRoutePreview,
      component: FixedHeightPage
    },
    {
      path: '/dynamic-height',
      name: 'Dynamic height',
      Preview: ExampleRoutePreview,
      component: DynamicHeightPage
    },
    {
      path: '/nested-tree',
      name: 'Nested tree',
      Preview: ExampleRoutePreview,
      component: NestedTreePage
    }
  ]
} satisfies ExampleRoute;

/** Minimal route shape kept independent from the application's router package. */
type ExampleRoute = {
  path: string;
  name?: string;
  Preview?: Component<{ name: string; path: string }>;
  component?: Component;
  children?: ExampleRoute[];
};

function FixedHeightPage() {
  return (
    <PageShell active="fixed">
      <Suspense fallback={<ExampleLoading />}>
        <FixedHeightExample embedded />
      </Suspense>
    </PageShell>
  );
}

function DynamicHeightPage() {
  return (
    <PageShell active="dynamic">
      <Suspense fallback={<ExampleLoading />}>
        <DynamicHeightExample embedded />
      </Suspense>
    </PageShell>
  );
}

function NestedTreePage() {
  return (
    <PageShell active="nested">
      <Suspense fallback={<ExampleLoading />}>
        <NestedVirtualExample embedded />
      </Suspense>
    </PageShell>
  );
}

function PageShell(props: { active: 'fixed' | 'dynamic' | 'nested'; children: JSX.Element }) {
  return (
    <main class="min-h-screen bg-zinc-50 text-zinc-950">
      <header class="border-b border-zinc-200 bg-white">
        <div class="mx-auto flex h-14 max-w-[1800px] items-center gap-6 px-4 lg:px-6">
          <a class="flex items-center gap-2.5 font-semibold tracking-tight" href="/solid-virtual">
            <span class="grid h-7 w-7 place-items-center rounded-md bg-zinc-950 text-[10px] font-bold text-white">
              SV
            </span>
            <span>Solid Virtual</span>
          </a>
          <nav class="flex items-center gap-1 text-sm text-zinc-600" aria-label="Examples">
            <PageLink active={props.active === 'fixed'} href="/solid-virtual">
              Fixed height
            </PageLink>
            <PageLink active={props.active === 'dynamic'} href="/solid-virtual/dynamic-height">
              Dynamic height
            </PageLink>
            <PageLink active={props.active === 'nested'} href="/solid-virtual/nested-tree">
              Nested tree
            </PageLink>
          </nav>
        </div>
      </header>
      <div class="mx-auto max-w-[1800px] p-3 sm:p-5 lg:p-6">{props.children}</div>
    </main>
  );
}

function PageLink(props: { active: boolean; href: string; children: JSX.Element }) {
  return (
    <a
      class={`rounded-md px-3 py-1.5 transition-colors ${
        props.active ? 'bg-zinc-100 font-medium text-zinc-950' : 'hover:bg-zinc-100 hover:text-zinc-950'
      }`}
      href={props.href}
    >
      {props.children}
    </a>
  );
}

function ExampleLoading() {
  return <div class="h-[640px] animate-pulse rounded-lg border border-zinc-200 bg-white" />;
}

function PackagePreview(props: { name: string; path: string }) {
  return (
    <a
      class="group flex aspect-square w-full flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md"
      href={props.path}
    >
      <span class="grid h-9 w-9 place-items-center rounded-lg bg-zinc-950 text-xs font-bold text-white">SV</span>
      <span class="mt-auto text-sm font-semibold">{props.name}</span>
      <span class="mt-1 flex items-center text-xs text-zinc-500">
        3 primitives
        <ArrowRightIcon class="ms-auto" />
      </span>
    </a>
  );
}

function ExampleRoutePreview(props: { name: string; path: string }) {
  return (
    <a class="rounded-xl border border-zinc-200 bg-white p-5 text-sm font-semibold shadow-sm" href={props.path}>
      {props.name}
    </a>
  );
}

function ArrowRightIcon(props: { class?: string } = {}) {
  return (
    <svg
      aria-hidden="true"
      class={`h-4 w-4 ${props.class ?? ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
