import { createSignal, Show, onMount, onCleanup } from 'solid-js';

type DropZoneProps {
  onFilesDropped: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}

export function DropZone(props: DropZoneProps) {
  const [isDragging, setIsDragging] = createSignal(false);
  let dropZoneRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;
  let dragCounter = 0;

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter = 0;

    if (props.disabled) return;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files).filter(
        file => file.name.toLowerCase().endsWith('.abr')
      );
      if (fileArray.length > 0) {
        props.onFilesDropped(props.multiple ? fileArray : [fileArray[0]]);
      }
    }
  };

  const handleFileInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      props.onFilesDropped(props.multiple ? fileArray : [fileArray[0]]);
    }
    // Reset input so same file can be selected again
    target.value = '';
  };

  const handleClick = () => {
    if (!props.disabled) {
      inputRef?.click();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  // Global paste handler
  const handlePaste = (e: ClipboardEvent) => {
    if (props.disabled) return;

    const items = e.clipboardData?.items;
    if (items) {
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file && file.name.toLowerCase().endsWith('.abr')) {
            files.push(file);
          }
        }
      }
      if (files.length > 0) {
        props.onFilesDropped(props.multiple ? files : [files[0]]);
      }
    }
  };

  onMount(() => {
    document.addEventListener('paste', handlePaste);
  });

  onCleanup(() => {
    document.removeEventListener('paste', handlePaste);
  });

  return (
    <div
      ref={dropZoneRef}
      class={`
        relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
        transition-all duration-200 ease-in-out
        ${isDragging()
          ? 'border-ps-accent bg-ps-accent/10 drop-zone-active'
          : 'border-ps-border hover:border-ps-border-light hover:bg-ps-bg-light/30'
        }
        ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label="Drop zone for ABR files"
    >
      <input
        ref={inputRef}
        type="file"
        accept={props.accept || '.abr'}
        multiple={props.multiple}
        class="hidden"
        onChange={handleFileInput}
        disabled={props.disabled}
      />

      <div class="flex flex-col items-center gap-4">
        {/* Icon */}
        <div class={`
          w-16 h-16 rounded-full flex items-center justify-center
          ${isDragging() ? 'bg-ps-accent/20' : 'bg-ps-bg-lighter'}
        `}>
          <svg
            class={`w-8 h-8 ${isDragging() ? 'text-ps-accent' : 'text-ps-text-muted'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        {/* Text */}
        <div>
          <Show
            when={isDragging()}
            fallback={
              <>
                <p class="text-ps-text-bright text-lg font-medium mb-1">
                  Drop .abr files here
                </p>
                <p class="text-ps-text-muted text-sm">
                  or click to browse • Supports multiple files
                </p>
              </>
            }
          >
            <p class="text-ps-accent text-lg font-medium">
              Release to upload
            </p>
          </Show>
        </div>

        {/* Supported formats hint */}
        <div class="flex items-center gap-2 text-xs text-ps-text-muted">
          <span class="px-2 py-1 bg-ps-bg-lighter rounded">ABR v6+</span>
          <span class="px-2 py-1 bg-ps-bg-lighter rounded">ABR v9</span>
          <span class="px-2 py-1 bg-ps-bg-lighter rounded">ABR v10</span>
        </div>
      </div>
    </div>
  );
}
