import { createEffect, createSignal, JSX, onCleanup, Show } from 'solid-js';

import { useCloudStorage } from './CloudStorageContext';

// ============================================================================
// MARK: Main Component
// ============================================================================

export function DialogOverlay(): JSX.Element {
  const { state, actions } = useCloudStorage();

  const isOpen = () => state.dialog.type !== null;

  // Close on escape
  createEffect(() => {
    if (isOpen()) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          actions.closeDialog();
        }
      };

      document.addEventListener('keydown', handleEscape);
      onCleanup(() => document.removeEventListener('keydown', handleEscape));
    }
  });

  return (
    <Show when={isOpen()}>
      <div
        class="z-1000 fixed inset-0 flex items-center justify-center bg-black/60 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            actions.closeDialog();
          }
        }}
      >
        <Show when={state.dialog.type === 'create-folder'}>
          <CreateFolderDialog />
        </Show>
        <Show when={state.dialog.type === 'create-file'}>
          <CreateFileDialog />
        </Show>
        <Show when={state.dialog.type === 'rename'}>
          <RenameDialog />
        </Show>
        <Show when={state.dialog.type === 'delete'}>
          <DeleteConfirmDialog />
        </Show>
      </div>
    </Show>
  );
}

// ============================================================================
// MARK: Sub-Components
// ============================================================================

function CreateFolderDialog(): JSX.Element {
  const { state, actions } = useCloudStorage();
  const [name, setName] = createSignal('');
  const [error, setError] = createSignal('');
  let inputRef: HTMLInputElement | undefined;

  createEffect(() => {
    inputRef?.focus();
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const trimmedName = name().trim();

    if (!trimmedName) {
      setError('Folder name is required');
      return;
    }

    if (trimmedName.includes('/') || trimmedName.includes('\\')) {
      setError('Folder name cannot contain slashes');
      return;
    }

    try {
      await actions.createFolder(trimmedName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    }
  };

  return (
    <div class="w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-800 p-4 shadow-xl">
      <h2 class="mb-4 text-lg font-medium text-neutral-100">Create New Folder</h2>

      <form onSubmit={handleSubmit}>
        <label class="mb-1 block text-sm text-neutral-400">Folder Name</label>
        <input
          ref={inputRef}
          type="text"
          class="mb-2 w-full rounded border border-neutral-600 bg-neutral-700 px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          placeholder="New Folder"
          value={name()}
          onInput={(e) => {
            setName(e.currentTarget.value);
            setError('');
          }}
        />

        <Show when={error()}>
          <p class="mb-2 text-sm text-red-400">{error()}</p>
        </Show>

        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            onClick={() => actions.closeDialog()}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
            disabled={state.isLoading}
          >
            {state.isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateFileDialog(): JSX.Element {
  const { state, actions } = useCloudStorage();
  const [name, setName] = createSignal('');
  const [error, setError] = createSignal('');
  let inputRef: HTMLInputElement | undefined;

  createEffect(() => {
    inputRef?.focus();
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const trimmedName = name().trim();

    if (!trimmedName) {
      setError('File name is required');
      return;
    }

    if (trimmedName.includes('/') || trimmedName.includes('\\')) {
      setError('File name cannot contain slashes');
      return;
    }

    try {
      await actions.createFile(trimmedName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create file');
    }
  };

  return (
    <div class="w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-800 p-4 shadow-xl">
      <h2 class="mb-4 text-lg font-medium text-neutral-100">Create New File</h2>

      <form onSubmit={handleSubmit}>
        <label class="mb-1 block text-sm text-neutral-400">File Name</label>
        <input
          ref={inputRef}
          type="text"
          class="mb-2 w-full rounded border border-neutral-600 bg-neutral-700 px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          placeholder="document.txt"
          value={name()}
          onInput={(e) => {
            setName(e.currentTarget.value);
            setError('');
          }}
        />

        <Show when={error()}>
          <p class="mb-2 text-sm text-red-400">{error()}</p>
        </Show>

        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            onClick={() => actions.closeDialog()}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
            disabled={state.isLoading}
          >
            {state.isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function RenameDialog(): JSX.Element {
  const { state, actions } = useCloudStorage();
  const [name, setName] = createSignal(state.dialog.initialValue ?? '');
  const [error, setError] = createSignal('');
  let inputRef: HTMLInputElement | undefined;

  createEffect(() => {
    inputRef?.focus();
    inputRef?.select();
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const trimmedName = name().trim();

    if (!trimmedName) {
      setError('Name is required');
      return;
    }

    if (trimmedName.includes('/') || trimmedName.includes('\\')) {
      setError('Name cannot contain slashes');
      return;
    }

    if (trimmedName === state.dialog.initialValue) {
      actions.closeDialog();
      return;
    }

    try {
      await actions.rename(trimmedName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename');
    }
  };

  return (
    <div class="w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-800 p-4 shadow-xl">
      <h2 class="mb-4 text-lg font-medium text-neutral-100">Rename</h2>

      <form onSubmit={handleSubmit}>
        <label class="mb-1 block text-sm text-neutral-400">New Name</label>
        <input
          ref={inputRef}
          type="text"
          class="mb-2 w-full rounded border border-neutral-600 bg-neutral-700 px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          value={name()}
          onInput={(e) => {
            setName(e.currentTarget.value);
            setError('');
          }}
        />

        <Show when={error()}>
          <p class="mb-2 text-sm text-red-400">{error()}</p>
        </Show>

        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            onClick={() => actions.closeDialog()}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
            disabled={state.isLoading}
          >
            {state.isLoading ? 'Renaming...' : 'Rename'}
          </button>
        </div>
      </form>
    </div>
  );
}

function DeleteConfirmDialog(): JSX.Element {
  const { state, actions } = useCloudStorage();

  const selectedCount = () => state.selection.selectedIds.size;
  const selectedItems = () => state.items.filter((item) => state.selection.selectedIds.has(item.id));

  const handleDelete = async () => {
    await actions.deleteSelected();
  };

  return (
    <div class="w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-800 p-4 shadow-xl">
      <h2 class="mb-2 text-lg font-medium text-neutral-100">Delete Items</h2>

      <p class="mb-4 text-sm text-neutral-400">
        Are you sure you want to delete {selectedCount()} item{selectedCount() > 1 ? 's' : ''}?
      </p>

      <Show when={selectedCount() <= 5}>
        <ul class="mb-4 max-h-32 overflow-auto rounded border border-neutral-700 bg-neutral-900 p-2">
          {selectedItems().map((item) => (
            <li class="flex items-center gap-2 py-1 text-sm text-neutral-300">
              <span>{item.type === 'folder' ? '📁' : '📄'}</span>
              <span class="truncate">{item.name}</span>
            </li>
          ))}
        </ul>
      </Show>

      <p class="mb-4 text-xs text-red-400">This action cannot be undone.</p>

      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          onClick={() => actions.closeDialog()}
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500 disabled:opacity-50"
          onClick={handleDelete}
          disabled={state.isLoading}
        >
          {state.isLoading ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  );
}
