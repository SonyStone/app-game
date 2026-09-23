import { createSignal, onCleanup, Show, untrack } from 'solid-js';
import type { ViewerError } from '../../shared/errors';
import { CameraControls } from '../camera/CameraControls';
import { CameraTour } from '../camera/CameraTour';
import { DocumentCamera } from '../camera/DocumentCamera';
import { DocumentSpace } from '../camera/SceneSpace';
import { loadDocument, type TextDocument } from '../document/document';
import { createDocumentDraw } from '../document/rendering/createDocumentDraw';
import { DocumentRendererProvider } from '../document/rendering/DocumentRendererProvider';
import { FrameLoop } from '../scene/FrameLoop';
import { RenderLayer } from '../scene/RenderLayer';
import { Viewport } from '../viewport/Viewport';
import type { ViewerState } from './createViewerState';

/** A document session beneath shared GPU providers. Replacing the file retains the viewer device and canvas. */
export function DocumentViewer(props: {
  viewer: ViewerState;
  /** Fixed for this mounted session; omit to open the bundled demo. */
  file?: File;
  /** Receives an owned downloadable GDOC before GPU preparation. */
  onConverted?: (file: File) => void;
  /** Runs after validated CPU data is ready so profile-specific controls can be shown. */
  onProfile?: (kind: TextDocument['kind']) => void;
}) {
  const viewer = untrack(() => props.viewer);
  const [document, setDocument] = createSignal<TextDocument>();
  const [failed, setFailed] = createSignal(false, { ownedWrite: true });

  const abort = new AbortController();
  let loaded: TextDocument | undefined;

  viewer.setState({ phase: 'loading', message: 'Loading document…' });

  onCleanup(() => {
    abort.abort();
    closeImages();
  });

  void loadDocument(
    abort.signal,
    untrack(() => props.file),
    props.onConverted
  ).then((result) => {
    if (result.isErr()) {
      return fail(result.error);
    }

    if (abort.signal.aborted) {
      result.value.images.forEach((image) => image.close());
      return;
    }

    loaded = result.value;
    props.onProfile?.(loaded.kind);
    viewer.setState({ phase: 'preparing', message: 'Preparing TypeGPU…' });
    setDocument(loaded);
  });

  return (
    <Show when={!failed()}>
      <Show when={document()} keyed>
        {(data) => (
          <Viewport>
            <FrameLoop onError={fail}>
              {(loop) => (
                <DocumentCamera>
                  <DocumentSpace pageAspect={data.pages[0]!.width / data.pages[0]!.height}>
                    <CameraControls
                      pageAspect={data.pages[0]!.width / data.pages[0]!.height}
                      onInteraction={() => viewer.setAutoZoom(false)}
                      onDraggingChange={viewer.setDragging}
                    />

                    <CameraTour document={data} enabled={viewer.autoZoom()} />

                    <DocumentRendererProvider
                      document={data}
                      onResourceUsage={(bytes) =>
                        viewer.setState({
                          phase: 'ready',
                          message: `TypeGPU · ${(bytes / 1048576).toFixed(1)} MiB GPU resources`
                        })
                      }
                      onReady={(info) =>
                        viewer.setState({
                          phase: 'ready',
                          message: `TypeGPU · ${Math.round(info.preparationMs)} ms preparation · ${(info.resourceBytes / 1048576).toFixed(1)} MiB GPU resources`
                        })
                      }
                      error={(error) => {
                        loop.fail(error);
                        return null;
                      }}
                    >
                      {() => {
                        const draw = createDocumentDraw({
                          vectorOnly: viewer.vectorOnly,
                          grids: viewer.grids
                        });

                        return <RenderLayer draw={draw} />;
                      }}
                    </DocumentRendererProvider>
                  </DocumentSpace>
                </DocumentCamera>
              )}
            </FrameLoop>
          </Viewport>
        )}
      </Show>
    </Show>
  );

  function fail(error: ViewerError) {
    if (abort.signal.aborted || error.kind === 'aborted') {
      return null;
    }

    abort.abort();
    closeImages();

    setFailed(true);
    viewer.setState({ phase: 'error', message: error.message, error });

    return null;
  }

  function closeImages() {
    loaded?.images.forEach((image) => image.close());
    loaded?.images.clear();
  }
}
