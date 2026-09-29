import type { JSX } from '@solidjs/web';
import { createEffect, Show } from 'solid-js';
import { createDocumentSource } from '../../src/features/document/createDocumentSource';
import type { TextDocument } from '../../src/features/document/document';
import type { DocumentProgress } from '../../src/features/document/documentProgress';
import { createDocumentExport } from '../../src/features/viewer/createDocumentExport';
import type { ViewerError } from '../../src/shared/errors';

/** Test assembly for the session primitive, with document loading and export controls. */
export function DocumentSource(props: {
  file?: File;
  onLoading?: (progress?: DocumentProgress) => void;
  onError: (error: Exclude<ViewerError, { kind: 'aborted' }>) => void;
  children: (
    document: TextDocument,
    fail: (error: ViewerError) => null,
    output: ReturnType<typeof createDocumentExport> | undefined
  ) => JSX.Element;
}) {
  const source = createDocumentSource(() => props.file);
  const output = createDocumentExport(() => source.prepared());
  createEffect(
    () => source.progress(),
    (progress) => {
      props.onLoading?.(progress);
    }
  );
  createEffect(
    () => source.error(),
    (error) => {
      if (error) props.onError(error);
    }
  );
  // Keyed Show children run untracked; the JSX hole keeps export availability reactive.
  return (
    <Show when={source.prepared()} keyed>
      {({ data, fail }) => <>{props.children(data, fail, output.available() ? output : undefined)}</>}
    </Show>
  );
}
