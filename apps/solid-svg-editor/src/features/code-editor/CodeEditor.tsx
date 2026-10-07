import { createMemo } from 'solid-js';

import { highlightHtml, highlightSvg } from './svg-highlight';

/**
 * A code field for SVG markup with GodSVG's syntax colors and a line-number gutter. The text is typed into a
 * transparent textarea laid over a highlighted copy, so editing, selection, undo, and IME stay native. Lines do not
 * wrap; the copy and the gutter follow the textarea's scrolling.
 */
export function CodeEditor(props: {
  readonly value: string;
  readonly onInput: (text: string) => void;
  readonly testId: string;
  readonly label: string;
}) {
  let highlight: HTMLPreElement | undefined;
  let gutter: HTMLPreElement | undefined;
  const html = createMemo(() => `${highlightHtml(highlightSvg(props.value))}\n`);
  const lineNumbers = createMemo(() =>
    Array.from({ length: props.value.split('\n').length }, (_, index) => index + 1).join('\n')
  );
  const syncScroll = (textarea: HTMLTextAreaElement) => {
    const transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
    highlight?.style.setProperty('transform', transform);
    gutter?.style.setProperty('transform', `translateY(${-textarea.scrollTop}px)`);
  };
  const shared = "m-0 p-2.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-[1.45] whitespace-pre [tab-size:2]";

  return (
    <div class="grid min-h-0 grid-cols-[auto_minmax(0,1fr)] overflow-hidden bg-[#080b12] in-[.theme-light]:bg-[#f8fbff]">
      <div class="overflow-hidden border-r border-[var(--soft-border)] bg-[color-mix(in_srgb,var(--panel-2)_60%,transparent)]">
        <pre
          ref={(element) => (gutter = element)}
          class={`${shared} pr-1.5 text-right text-[var(--muted)] select-none`}
          aria-hidden="true"
          data-testid={`${props.testId}-gutter`}
        >
          {lineNumbers()}
        </pre>
      </div>
      <div class="relative min-h-0 min-w-0 overflow-hidden">
        <pre
          ref={(element) => (highlight = element)}
          class={`${shared} pointer-events-none absolute top-0 left-0 text-[var(--text)]`}
          aria-hidden="true"
          data-testid={`${props.testId}-highlight`}
          innerHTML={html()}
        />
        <textarea
          class={`${shared} relative block h-full w-full min-w-0 resize-none overflow-auto rounded-none border-0 bg-transparent text-transparent caret-[var(--text)] outline-none selection:bg-[color-mix(in_srgb,var(--accent)_35%,transparent)]`}
          name="svg-code"
          aria-label={props.label}
          data-testid={props.testId}
          wrap="off"
          spellcheck={false}
          value={props.value}
          onInput={(event) => props.onInput(event.currentTarget.value)}
          onScroll={(event) => syncScroll(event.currentTarget)}
        />
      </div>
    </div>
  );
}
