import { createSignal } from 'solid-js';

type SearchBarProps = {
  value: string;
  onSearch: (query: string) => void;
  placeholder?: string;
};

export function SearchBar(props: SearchBarProps) {
  const [focused, setFocused] = createSignal(false);

  return (
    <div
      class={`bg-ps-bg-dark relative flex items-center rounded-lg border transition-colors ${focused() ? 'border-ps-accent' : 'border-ps-border'} `}
    >
      {/* Search icon */}
      <div class="text-ps-text-muted pl-3">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Input */}
      <input
        type="text"
        value={props.value}
        onInput={(e) => props.onSearch(e.currentTarget.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={props.placeholder || 'Search brushes...'}
        class="text-ps-text placeholder-ps-text-muted flex-1 bg-transparent px-3 py-2 text-sm outline-none"
      />

      {/* Clear button */}
      {props.value && (
        <button
          onClick={() => props.onSearch('')}
          class="text-ps-text-muted hover:text-ps-text pr-3"
          aria-label="Clear search"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
