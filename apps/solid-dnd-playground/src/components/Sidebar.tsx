import { useHref, useLocation, useResolvedPath } from '@solidjs/router';
import type { JSX } from '@solidjs/web';
import { createSignal, For, Show } from 'solid-js';
import { navSections } from '../nav';

// ============================================================================
// MARK: Sidebar
// ============================================================================

export default function Sidebar(): JSX.Element {
  return (
    <>
      {/* Desktop sidebar — always visible */}
      <aside class="hidden w-60 shrink-0 border-r border-white/10 bg-white/2 md:flex md:flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile hamburger + drawer */}
      <MobileDrawer />
    </>
  );
}

// ============================================================================
// MARK: Sidebar Content (shared between desktop & mobile)
// ============================================================================

function SidebarContent(props: { onNavigate?: () => void }): JSX.Element {
  return (
    <nav class="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      <For each={navSections}>
        {(section) => (
          <div class="mb-2">
            <div class="mb-1 px-2 text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">
              {section.title}
            </div>
            <For each={section.items}>
              {(item) => <NavLink href={item.href} label={item.label} onNavigate={props.onNavigate} />}
            </For>
          </div>
        )}
      </For>
    </nav>
  );
}

// ============================================================================
// MARK: NavLink
// ============================================================================

function NavLink(props: { href: string; label: string; onNavigate?: () => void }): JSX.Element {
  const location = useLocation();
  const resolvedPath = useResolvedPath(() => props.href);
  const href = useHref(resolvedPath);
  const isActive = () => {
    const path = resolvedPath();
    if (!path) return false;
    return location.pathname === path || (props.href === '' && location.pathname === `${path}/sensor`);
  };

  return (
    <a
      href={href()}
      onClick={() => props.onNavigate?.()}
      class={`flex items-center rounded-md px-2 py-1.5 text-xs transition-colors ${
        isActive()
          ? 'bg-blue-600/20 font-medium text-blue-400'
          : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
      }`}
    >
      <span class={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${isActive() ? 'bg-blue-400' : 'bg-neutral-600'}`} />
      {props.label}
    </a>
  );
}

// ============================================================================
// MARK: Mobile Drawer
// ============================================================================

function MobileDrawer(): JSX.Element {
  const [open, setOpen] = createSignal(false);

  return (
    <>
      {/* Hamburger trigger — only on mobile */}
      <button
        class="fixed top-3 left-3 z-50 flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-neutral-900/80 backdrop-blur-sm md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
      >
        <HamburgerIcon />
      </button>

      <Show when={open()}>
        <div class="fixed inset-0 z-100 bg-black/60 md:hidden" onClick={() => setOpen(false)} />
        <aside class="fixed inset-y-0 left-0 z-101 flex w-64 flex-col border-r border-white/10 bg-[#1a1a2e] md:hidden">
          {/* Drawer header */}
          <div class="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div class="text-sm font-bold text-white">Navigation</div>
            <button
              type="button"
              aria-label="Close navigation"
              class="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-white/10 hover:text-white"
              onClick={() => setOpen(false)}
            >
              <CloseIcon />
            </button>
          </div>

          {/* Nav links */}
          <SidebarContent onNavigate={() => setOpen(false)} />
        </aside>
      </Show>
    </>
  );
}

// ============================================================================
// MARK: Icons
// ============================================================================

function HamburgerIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    >
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function CloseIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    >
      <line x1="2" y1="2" x2="12" y2="12" />
      <line x1="12" y1="2" x2="2" y2="12" />
    </svg>
  );
}
