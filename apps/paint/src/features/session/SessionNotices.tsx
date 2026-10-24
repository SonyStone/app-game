import { createSignal, Show, untrack } from 'solid-js';
import { FolderAccessNotice } from '../drawing-folder';
import { FreshTabNotice } from '../fresh-tab';
import { HiddenLayerNotice } from '../hidden-layer';
import { MissingTilesNotice, StorageLockNotice } from '../storage-lock';
import type { PaintSession } from './createPaintSession';
import { ErrorNotice } from './ErrorNotice';

/**
 * Notices every variant must show, because the drawing cannot be used or saved correctly without the user's answer:
 * drawing folder access, painting on a hidden layer, lost tiles, the pen hover lost in this tab, the drawing open in
 * another tab, and failures.
 * Place it over the canvas, inside the variant's UI layer.
 */
export function SessionNotices(props: { session: PaintSession }) {
  const { engine, drawingFolder, hiddenLayer, freshTab, size, edit, setError } = untrack(() => props.session);
  /** The count of lost tiles the user last closed the notice at. */
  const [missingSeen, setMissingSeen] = createSignal(0);

  return (
    <>
      <Show when={drawingFolder.status()?.access === 'prompt' ? drawingFolder.status() : undefined}>
        {(status) => (
          <FolderAccessNotice name={status().name} size={size()} onAllow={() => void drawingFolder.allow()} />
        )}
      </Show>
      <Show when={hiddenLayer.notice()}>
        {(notice) => (
          <HiddenLayerNotice
            name={notice().name}
            size={size()}
            onShow={() => {
              edit({ type: 'layer', action: { type: 'update', id: notice().id, patch: { visible: true } } });
              hiddenLayer.dismiss();
            }}
            onDismiss={hiddenLayer.dismiss}
          />
        )}
      </Show>
      <Show
        when={(engine.paging().storage?.missingTiles ?? 0) !== missingSeen() && engine.paging().storage?.missingTiles}
      >
        {(count) => <MissingTilesNotice count={count()} size={size()} onDismiss={() => setMissingSeen(count())} />}
      </Show>
      <Show when={freshTab.offered()}>
        <FreshTabNotice
          size={size()}
          blocked={freshTab.blocked()}
          onMove={freshTab.move}
          onDismiss={freshTab.dismiss}
        />
      </Show>
      <Show when={engine.storageLock()}>
        {(state) => <StorageLockNotice state={state()} onTakeOver={engine.takeOver} />}
      </Show>
      <Show when={props.session.error()}>
        {(current) => (
          <ErrorNotice
            error={current()}
            onRestore={props.session.restoreRenderer}
            onRestart={() => engine.restart()}
            onDismiss={() => setError(undefined)}
          />
        )}
      </Show>
    </>
  );
}
