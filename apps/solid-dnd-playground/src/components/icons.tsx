import type { JSX } from 'solid-js';

// ============================================================================
// MARK: GripIcon
// ============================================================================

/** 6-dot drag handle icon. Pass `class` to override size/color (default: h-4 w-4 text-neutral-500). */
export function GripIcon(props: { class?: string }): JSX.Element {
  return (
    <svg class={`shrink-0 ${props.class ?? 'h-4 w-4 text-neutral-500'}`} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="3" r="1.2" />
      <circle cx="11" cy="3" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="13" r="1.2" />
      <circle cx="11" cy="13" r="1.2" />
    </svg>
  );
}

// ============================================================================
// MARK: CheckIcon
// ============================================================================

/** Checkmark icon for selected items. Pass `class` to override size/color (default: h-4 w-4 text-purple-400). */
export function CheckIcon(props: { class?: string }): JSX.Element {
  return (
    <svg class={`shrink-0 ${props.class ?? 'h-4 w-4 text-purple-400'}`} viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
    </svg>
  );
}
