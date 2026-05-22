import { createMemo, createSignal, type JSX } from 'solid-js';
import s from './CodeBlock.module.css';

// ============================================================================
// MARK: CodeBlock
// ============================================================================

export type CodeBlockProps = {
  code?: string;
  language?: string;
  highlightedHtml?: string;
  title?: string;
  class?: string;
  children?: JSX.Element;
};

export function CodeBlock(props: CodeBlockProps): JSX.Element {
  return (
    <div
      class={`group relative overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${props.class ?? ''}`}
    >
      {/* Top bar */}
      <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/80">
        <div class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 rounded-full bg-red-500/60" />
          <span class="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
          <span class="h-2.5 w-2.5 rounded-full bg-green-500/60" />
          {props.title && <span class="ml-2 text-[11px] text-slate-600 dark:text-slate-400">{props.title}</span>}
        </div>
        <div class="flex items-center gap-2">
          {props.language && (
            <span class="font-mono text-[10px] text-slate-400 uppercase dark:text-slate-500">{props.language}</span>
          )}
          <CopyButton code={props.code} />
        </div>
      </div>

      {/* Code */}
      <div class={`text-sm [&>*]:overflow-auto [&>*]:p-4 ${s.shiki}`}>{props.children}</div>
    </div>
  );
}

function CopyButton(props: { code?: string }): JSX.Element {
  const [copied, setCopied] = createSignal(false);
  const trimmedCode = createMemo(() => props.code?.trim() ?? '');

  const handleCopy = async () => {
    if (!trimmedCode()) {
      return;
    }

    await navigator.clipboard.writeText(trimmedCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {props.code && (
        <button
          onClick={handleCopy}
          class="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          aria-label="Copy code"
        >
          {copied() ? <CheckIcon /> : <CopyIcon />}
          {copied() ? 'Copied!' : 'Copy'}
        </button>
      )}
    </>
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
