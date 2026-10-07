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
 * for review (`openDialog` is called) instead of opening right away; clean text opens immediately. `resolve(true)`
 * imports the held text, `resolve(false)` drops it.
 */
export function createImportReview(options: {
  readonly importSvgText: (text: string, name: string) => void;
  readonly openDialog: () => void;
  readonly closeDialog: () => void;
}) {
  const [pending, setPending] = createSignal<ImportReview>();

  function requestImport(text: string, name: string): void {
    const review = reviewImport(text, name);

    if (!review) {
      options.importSvgText(text, name);
      return;
    }

    setPending(review);
    options.openDialog();
  }

  function resolve(accept: boolean): void {
    const review = pending();
    setPending(undefined);
    options.closeDialog();

    if (accept && review) {
      options.importSvgText(review.text, review.name);
    }
  }

  return { pending, requestImport, resolve };
}

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
