import type { JSX } from '@solidjs/web';
import './styles.css';
/**
 * MARK: Home Page
 *
 * The main page for the ABR Editor. Uses the Photoshop-style BrushPanel
 * which provides a unified master list with drag & drop, multi-select,
 * nested groups, and flexible export.
 */

import { Show, createSignal } from 'solid-js';
import { BrushPanel } from './components/BrushPanel';
import { BrushDetailEditable } from './features/brush-detail/BrushDetailEditable';
import type { BrushWithPreview } from './lib/abr';

// ============================================================================
// MARK: Home
// ============================================================================

/** Opens Photoshop brush files and inspects their settings locally. */
export function App() {
  const [selectedBrush, setSelectedBrush] = createSignal<BrushWithPreview | null>(null);

  return (
    <div class="abr-viewer bg-ps-bg-dark text-ps-text flex h-screen flex-col">
      {/* Header */}
      <Header />

      {/* Main content: the brush panel takes the full area */}
      <main class="min-h-0 flex-1">
        <BrushPanel onOpenBrushDetail={(brush) => setSelectedBrush(brush)} />
      </main>

      {/* Footer */}
      <Footer />

      {/* Brush detail modal */}
      <Show when={selectedBrush()}>
        <BrushDetailEditable
          brush={selectedBrush()!}
          onClose={() => setSelectedBrush(null)}
          onSave={(updatedBrush) => {
            // TODO: propagate save back to tree
            setSelectedBrush(updatedBrush);
          }}
          onDelete={() => {
            // TODO: propagate delete to tree
            setSelectedBrush(null);
          }}
          onDuplicate={() => {
            // TODO: propagate duplicate to tree
          }}
        />
      </Show>
    </div>
  );
}

// ============================================================================
// MARK: Header
// ============================================================================

function Header(): JSX.Element {
  return (
    <header class="bg-ps-bg border-ps-border border-b">
      <div class="flex items-center justify-between px-4 py-2">
        <div class="flex items-center gap-3">
          <div class="bg-ps-accent flex h-7 w-7 items-center justify-center rounded">
            <svg class="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </div>
          <div>
            <h1 class="text-ps-text-bright text-sm font-semibold">ABR Editor</h1>
            <p class="text-ps-text-muted text-[10px]">Photoshop Brush File Editor</p>
          </div>
        </div>

        <p class="text-ps-text-muted text-[10px]">All processing happens locally in your browser</p>
      </div>
    </header>
  );
}

// ============================================================================
// MARK: Footer
// ============================================================================

function Footer(): JSX.Element {
  return (
    <footer class="border-ps-border bg-ps-bg border-t">
      <div class="text-ps-text-muted px-4 py-1.5 text-center text-[10px]">
        ABR Editor • Create, edit, and export Photoshop brush files v6+
      </div>
    </footer>
  );
}
