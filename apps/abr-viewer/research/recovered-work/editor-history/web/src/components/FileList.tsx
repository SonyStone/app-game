import { For, Show } from 'solid-js';
import type { AbrFileWithMeta } from '~/lib/abr';

type FileListProps {
  files: Array<{ name: string; data: AbrFileWithMeta }>;
  selectedFile: string | null;
  onSelectFile: (name: string) => void;
  onRemoveFile: (name: string) => void;
}

export function FileList(props: FileListProps) {
  return (
    <div class="space-y-2">
      <For each={props.files}>
        {(file) => (
          <div
            class={`
              flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
              ${props.selectedFile === file.name
                ? 'bg-ps-accent/20 border border-ps-accent'
                : 'bg-ps-bg-dark border border-ps-border hover:border-ps-border-light'
              }
            `}
            onClick={() => props.onSelectFile(file.name)}
          >
            {/* File icon */}
            <div class={`
              w-10 h-10 rounded flex items-center justify-center
              ${props.selectedFile === file.name ? 'bg-ps-accent/30' : 'bg-ps-bg-lighter'}
            `}>
              <svg class="w-5 h-5 text-ps-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>

            {/* File info */}
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-ps-text-bright truncate" title={file.name}>
                {file.name}
              </p>
              <p class="text-xs text-ps-text-muted">
                {file.data.brushes.length} brush{file.data.brushes.length !== 1 ? 'es' : ''} • v{file.data.version}.{file.data.subVersion}
              </p>
            </div>

            {/* Errors indicator */}
            <Show when={file.data.errors.length > 0}>
              <div
                class="w-6 h-6 rounded-full bg-ps-warning/20 flex items-center justify-center"
                title={`${file.data.errors.length} warning(s)`}
              >
                <svg class="w-4 h-4 text-ps-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </Show>

            {/* Remove button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                props.onRemoveFile(file.name);
              }}
              class="p-1 text-ps-text-muted hover:text-ps-error rounded transition-colors"
              aria-label={`Remove ${file.name}`}
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
