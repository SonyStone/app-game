import { createSignal, type JSX } from 'solid-js';

// ============================================================================
// MARK: CodeBlock
// ============================================================================

export type CodeBlockProps = {
  code: string;
  language?: string;
  title?: string;
  class?: string;
};

export function CodeBlock(props: CodeBlockProps): JSX.Element {
  const [copied, setCopied] = createSignal(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(props.code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      class={`group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 ${props.class ?? ''}`}
    >
      {/* Top bar */}
      <div class="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/50 px-4 py-2">
        <div class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 rounded-full bg-red-500/60" />
          <span class="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
          <span class="h-2.5 w-2.5 rounded-full bg-green-500/60" />
          {props.title && <span class="ml-2 text-[11px] text-neutral-500">{props.title}</span>}
        </div>
        <div class="flex items-center gap-2">
          {props.language && <span class="font-mono text-[10px] text-neutral-600 uppercase">{props.language}</span>}
          <button
            onClick={handleCopy}
            class="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-neutral-300"
            aria-label="Copy code"
          >
            {copied() ? <CheckIcon /> : <CopyIcon />}
            {copied() ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Code */}
      <pre class="overflow-x-auto p-4 text-[0.8rem] leading-relaxed text-neutral-200">
        <code>{props.code.trim()}</code>
      </pre>
    </div>
  );
}

// ============================================================================
// MARK: Icons
// ============================================================================

function CopyIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
