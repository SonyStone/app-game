import Drawer from '@corvu/drawer';
import { A, useLocation } from '@solidjs/router';
import { createSignal, For, type JSX } from 'solid-js';
import { navSections } from '../nav';

// ============================================================================
// MARK: Sidebar
// ============================================================================

export function Sidebar(): JSX.Element {
  return (
    <>
      {/* Desktop sidebar — always visible */}
      <aside class="hidden w-56 shrink-0 border-r border-neutral-800 bg-neutral-900/50 md:flex md:flex-col">
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
    <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
      <For each={navSections}>
        {(section) => (
          <div class="mb-3">
            <div class="mb-1 px-2 text-[10px] font-semibold tracking-widest text-neutral-500 uppercase">
              {section.title}
            </div>
            <For each={section.items}>
              {(item) => (
                <NavLink href={item.href} label={item.label} badge={item.badge} onNavigate={props.onNavigate} />
              )}
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

function NavLink(props: { href: string; label: string; badge?: string; onNavigate?: () => void }): JSX.Element {
  const location = useLocation();
  const isActive = () => {
    const base = props.href.replace('./', '/').replace(/^\/\//, '/');
    const path = base === '/' ? '/' : base;
    if (path === '/') return location.pathname === '/' || location.pathname === '/overview';
    return location.pathname === path;
  };

  return (
    <A
      href={props.href}
      onClick={() => props.onNavigate?.()}
      class={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
        isActive()
          ? 'bg-violet-600/20 font-medium text-violet-300'
          : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
      }`}
    >
      <span
        class={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${isActive() ? 'bg-violet-400' : 'bg-neutral-700'}`}
      />
      <span class="flex-1">{props.label}</span>
      {props.badge && (
        <span class="rounded bg-neutral-700 px-1 py-0.5 text-[9px] font-medium text-neutral-400">{props.badge}</span>
      )}
    </A>
  );
}

// ============================================================================
// MARK: Mobile Drawer
// ============================================================================

function MobileDrawer(): JSX.Element {
  const [open, setOpen] = createSignal(false);

  return (
    <>
      <button
        class="fixed top-3 left-3 z-50 flex h-8 w-8 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900/80 backdrop-blur-sm md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
      >
        <HamburgerIcon />
      </button>

      <Drawer side="left" open={open()} onOpenChange={setOpen}>
        {(drawerProps) => (
          <Drawer.Portal>
            <Drawer.Overlay
              class="fixed inset-0 z-100 transition-colors duration-300"
              style={{ 'background-color': `rgb(0 0 0 / ${0.6 * drawerProps.openPercentage})` }}
            />
            <Drawer.Content class="fixed inset-y-0 left-0 z-101 flex w-60 flex-col border-r border-neutral-800 bg-neutral-950 data-transitioning:transition-transform data-transitioning:duration-300 data-transitioning:ease-[cubic-bezier(0.32,0.72,0,1)]">
              <div class="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                <div class="flex items-baseline gap-2">
                  <Drawer.Label class="text-sm font-bold text-white">SolidJS</Drawer.Label>
                  <span class="text-xs text-violet-400">Patterns</span>
                </div>
                <Drawer.Close class="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-white/10 hover:text-white">
                  <CloseIcon />
                </Drawer.Close>
              </div>
              <SidebarContent onNavigate={() => setOpen(false)} />
            </Drawer.Content>
          </Drawer.Portal>
        )}
      </Drawer>
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
