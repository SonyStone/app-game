import type { JSX } from '@solidjs/web';
import { createEffect, Loading, Show } from 'solid-js';
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
  const output = createDocumentExport(() => source.document()?.unwrapOr(undefined));
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
  return (
    <Show when={!source.error()}>
      <Loading>
        {source.document()?.match(({ data }) => {
          return props.children(data, source.fail, output.available() ? output : undefined);
        }, source.fail)}
      </Loading>
    </Show>
  );
}
