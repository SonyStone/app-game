import { For, JSX } from 'solid-js';

import { useCloudStorage } from './CloudStorageContext';

// ============================================================================
// MARK: Main Component
// ============================================================================

export function Breadcrumbs(): JSX.Element {
  const { state, actions } = useCloudStorage();

  return (
    <div class="bg-neutral-850 flex items-center gap-1 overflow-x-auto border-b border-neutral-700 px-3 py-2">
      <For each={state.breadcrumbs}>
        {(crumb, index) => (
          <>
            <button
              class={`shrink-0 rounded px-2 py-0.5 text-sm transition-colors hover:bg-neutral-700 ${
                index() === state.breadcrumbs.length - 1
                  ? 'font-medium text-blue-400'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              onClick={() => actions.navigateToFolder(crumb.id)}
            >
              {crumb.name}
            </button>
            {index() < state.breadcrumbs.length - 1 && <span class="shrink-0 text-neutral-600">/</span>}
          </>
        )}
      </For>
    </div>
  );
}
