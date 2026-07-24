import type { Routes } from '@app-game/app-router';
import { A, type RouteSectionProps } from '@solidjs/router';
import { lazy, Suspense } from 'solid-js';

/** Main-application route for the package and its examples. */
export const solidVirtualRoutes = {
  path: '/solid-virtual',
  name: 'Solid Virtual',
  Preview: PackagePreview,
  component: SolidVirtualLayout,
  children: [
    {
      path: '/',
      name: 'Fixed height',
      Preview: ExampleRoutePreview,
      component: lazy(() => import('./examples/fixed-height'))
    },
    {
      path: '/dynamic-height',
      name: 'Dynamic height',
      Preview: ExampleRoutePreview,
      component: lazy(() => import('./examples/dynamic-height'))
    },
    {
      path: '/fixed-tree',
      name: 'Fixed tree',
      Preview: ExampleRoutePreview,
      component: lazy(() => import('./examples/fixed-tree'))
    },
    {
      path: '/nested-tree',
      name: 'Dynamic tree',
      Preview: ExampleRoutePreview,
      component: lazy(() => import('./examples/nested-tree'))
    }
  ]
} satisfies Routes;

function SolidVirtualLayout(props: RouteSectionProps) {
  return (
    <main class="flex max-h-screen min-h-screen flex-col bg-zinc-50 text-zinc-950">
      <header class="border-b border-zinc-200 bg-white">
        <div class="mx-auto flex h-14 max-w-[1800px] items-center gap-6 px-4 lg:px-6">
          <A class="flex items-center gap-2.5 font-semibold tracking-tight" href="/solid-virtual">
            <span class="grid h-7 w-7 place-items-center rounded-md bg-zinc-950 text-[10px] font-bold text-white">
              SV
            </span>
            <span>Solid Virtual</span>
          </A>
          <nav class="flex items-center gap-1 text-sm text-zinc-600" aria-label="Examples">
            <A
              class="rounded-md px-3 py-1.5 transition-colors"
              activeClass="bg-zinc-100 font-medium text-zinc-950"
              inactiveClass="hover:bg-zinc-100 hover:text-zinc-950"
              end
              href="/solid-virtual"
            >
              Fixed height
            </A>
            <A
              class="rounded-md px-3 py-1.5 transition-colors"
              activeClass="bg-zinc-100 font-medium text-zinc-950"
              inactiveClass="hover:bg-zinc-100 hover:text-zinc-950"
              href="/solid-virtual/dynamic-height"
            >
              Dynamic height
            </A>
            <A
              class="rounded-md px-3 py-1.5 transition-colors"
              activeClass="bg-zinc-100 font-medium text-zinc-950"
              inactiveClass="hover:bg-zinc-100 hover:text-zinc-950"
              href="/solid-virtual/fixed-tree"
            >
              Fixed tree
            </A>
            <A
              class="rounded-md px-3 py-1.5 transition-colors"
              activeClass="bg-zinc-100 font-medium text-zinc-950"
              inactiveClass="hover:bg-zinc-100 hover:text-zinc-950"
              href="/solid-virtual/nested-tree"
            >
              Dynamic tree
            </A>
          </nav>
        </div>
      </header>
      <div class="mx-auto flex h-0 w-full max-w-[1800px] grow flex-col p-3 sm:p-5 lg:p-6">
        <Suspense fallback={<ExampleLoading />}>{props.children}</Suspense>
      </div>
    </main>
  );
}

function ExampleLoading() {
  return <div class="h-[640px] animate-pulse rounded-lg border border-zinc-200 bg-white" />;
}

function PackagePreview(props: { name: string; path: string }) {
  return (
    <A
      class="group flex aspect-square w-full flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md"
      href={props.path}
    >
      <span class="grid h-9 w-9 place-items-center rounded-lg bg-zinc-950 text-xs font-bold text-white">SV</span>
      <span class="mt-auto text-sm font-semibold">{props.name}</span>
      <span class="mt-1 flex items-center text-xs text-zinc-500">
        3 primitives
        <ArrowRightIcon class="ms-auto" />
      </span>
    </A>
  );
}

function ExampleRoutePreview(props: { name: string; path: string }) {
  return (
    <A class="rounded-xl border border-zinc-200 bg-white p-5 text-sm font-semibold shadow-sm" href={props.path}>
      {props.name}
    </A>
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
