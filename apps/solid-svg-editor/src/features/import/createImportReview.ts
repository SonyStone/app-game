import { createSignal } from 'solid-js';

import { importProblems } from '../../editor/element-warnings';
import { parseSvgMarkup, type SvgElementNode } from '../../svg-model';

/** An import waiting for the user's decision, with what GodSVG's "Import Problems" dialog reports about it. */
export type ImportReview = {
  readonly text: string;
  readonly name: string;
  /** The parser's message when the text is not valid XML; the other fields are then empty. */
  readonly syntaxError: string | undefined;
  /** The parsed document, for the preview. */
  readonly root: SvgElementNode | undefined;
  readonly unrecognizedElements: readonly string[];
  readonly unrecognizedAttributes: readonly string[];
};

/**
 * GodSVG's import check: SVG text with a syntax error or with elements or attributes GodSVG doesn't recognize is held
 * for review instead of opening right away; clean text opens immediately. Held imports queue up and are reviewed one
 * at a time: `openDialog` is called when the first arrives, `closeDialog` when the last is resolved. `resolve(true)`
 * imports the current one, `resolve(false)` drops it.
 */
export function createImportReview(options: {
  /** Opens the text in a tab (in place of `replaceTabId` when given) and returns the tab's id. */
  readonly importSvgText: (text: string, name: string, replaceTabId?: string) => string;
  readonly openDialog: () => void;
  readonly closeDialog: () => void;
}) {
  // The plain array is the source of truth: signal reads lag behind writes until the next flush, and several files
  // can arrive in one event.
  let items: readonly QueuedImport[] = [];
  const [queue, setQueue] = createSignal<readonly QueuedImport[]>(items);
  const pending = () => queue()[0]?.review;
  const update = (next: readonly QueuedImport[]) => {
    items = next;
    setQueue(next);
  };

  /**
   * Imports the text, after review if it has problems. The new tab takes the place of `target.replaceTabId` when
   * given, and `target.onImported` receives its id.
   */
  function requestImport(text: string, name: string, target: ImportTarget = {}): void {
    const review = reviewImport(text, name);

    if (!review) {
      target.onImported?.(options.importSvgText(text, name, target.replaceTabId));
      return;
    }

    const wasEmpty = items.length === 0;
    update([...items, { review, target }]);

    if (wasEmpty) {
      options.openDialog();
    }
  }

  function resolve(accept: boolean): void {
    const [current, ...rest] = items;
    update(rest);

    if (rest.length === 0) {
      options.closeDialog();
    }

    if (accept && current) {
      current.target.onImported?.(options.importSvgText(current.review.text, current.review.name, current.target.replaceTabId));
    }
  }

  return { pending, requestImport, resolve };
}

/** Where an import goes: the tab it replaces, and who learns the new tab's id. */
export type ImportTarget = { readonly replaceTabId?: string; readonly onImported?: (tabId: string) => void };

type QueuedImport = { readonly review: ImportReview; readonly target: ImportTarget };

/** The review of SVG text, or `undefined` when it has nothing to report. */
export function reviewImport(text: string, name: string): ImportReview | undefined {
  const parsed = parseSvgMarkup(text);

  if (!parsed.ok) {
    return { text, name, syntaxError: parsed.message, root: undefined, unrecognizedElements: [], unrecognizedAttributes: [] };
  }

  const problems = importProblems(parsed.root);

  if (problems.elements.length === 0 && problems.attributes.length === 0) {
    return undefined;
  }

  return {
    text,
    name,
    syntaxError: undefined,
    root: parsed.root,
    unrecognizedElements: problems.elements,
    unrecognizedAttributes: problems.attributes
  };
}
