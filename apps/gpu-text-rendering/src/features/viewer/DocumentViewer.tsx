import { createSignal, onCleanup, Show, untrack } from 'solid-js';
import type { ViewerError } from '../../shared/errors';
import { GpuCanvasProvider } from '../../shared/gpu/GpuCanvasProvider';
import { TypeGPURootProvider } from '../../shared/gpu/TypeGPURootProvider';
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

/** A canvas-scoped document session. JSX mounts GPU consumers only after their prerequisites are ready. */
export function DocumentViewer(props: { canvas: HTMLCanvasElement; viewer: ViewerState }) {
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

  void loadDocument(abort.signal).then((result) => {
    if (result.isErr()) {
      return fail(result.error);
    }

    if (abort.signal.aborted) {
      result.value.images.forEach((image) => image.close());
      return;
    }

    loaded = result.value;
    viewer.setState({ phase: 'preparing', message: 'Preparing TypeGPU…' });
    setDocument(loaded);
  });

  return (
    <Show when={!failed()}>
      <Show when={document()} keyed>
        {(data) => (
          <TypeGPURootProvider requiredBufferBytes={data.glyphVertices.byteLength} error={fail}>
            <GpuCanvasProvider canvas={props.canvas} error={fail}>
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
            </GpuCanvasProvider>
          </TypeGPURootProvider>
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
