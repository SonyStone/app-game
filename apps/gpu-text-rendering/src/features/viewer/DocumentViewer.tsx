import { createEffect, createSignal, onCleanup, Show, untrack } from 'solid-js';
import type { ViewerError } from '../../shared/errors';
import { CameraControls } from '../camera/CameraControls';
import { CameraTour } from '../camera/CameraTour';
import { DocumentCamera, useDocumentCamera } from '../camera/DocumentCamera';
import { DocumentSpace } from '../camera/SceneSpace';
import { loadDocument, type TextDocument } from '../document/document';
import type { ExportDocument } from '../document/readDocumentSource';
import { createDocumentDraw } from '../document/rendering/createDocumentDraw';
import { createFrame } from '../document/rendering/createFrame';
import { DocumentRendererProvider } from '../document/rendering/DocumentRendererProvider';
import { FrameLoop, useFrameLoop } from '../scene/FrameLoop';
import { RenderLayer } from '../scene/RenderLayer';
import { useViewport, Viewport } from '../viewport/Viewport';
import type { ViewerState } from './createViewerState';

/** A document session beneath shared GPU providers. Replacing the file retains the viewer device and canvas. */
export function DocumentViewer(props: {
  viewer: ViewerState;
  /** Fixed for this mounted session; omit to open the bundled demo. */
  file?: File;
  /** Receives an on-demand GDOC exporter after successful PDF import. */
  onConverted?: (exportDocument: ExportDocument) => void;
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
    props.onConverted,
    (progress) => {
      if (!abort.signal.aborted) viewer.setState({ phase: 'loading', message: 'Loading document…', progress });
    }
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
    viewer.setState({ phase: 'preparing', message: 'Preparing TypeGPU…', progress: { stage: 'preparingGraphics' } });
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

                    <OverviewCamera document={data} viewer={viewer} />

                    <CameraTour document={data} enabled={viewer.autoZoom()} />

                    <ViewerDocumentRenderer
                      document={data}
                      onResourceUsage={(bytes) =>
                        viewer.setState({
                          phase: 'ready',
                          resourceBytes: bytes,
                          message: `TypeGPU · ${(bytes / 1048576).toFixed(1)} MiB GPU resources`
                        })
                      }
                      onReady={(info) =>
                        viewer.setState({
                          phase: 'ready',
                          resourceBytes: info.resourceBytes,
                          preparationMs: info.preparationMs,
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
                    </ViewerDocumentRenderer>
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

/** Captures the initial camera beneath its providers so preparation can prioritize visible pages. */
function ViewerDocumentRenderer(props: Parameters<typeof DocumentRendererProvider>[0]) {
  const camera = useDocumentCamera();
  const viewport = useViewport();
  const initialFrame = untrack(() => {
    const { pixels, css } = viewport.size();
    return createFrame(props.document, camera, pixels.width, pixels.height, false, false, css);
  });
  return <DocumentRendererProvider {...props} initialFrame={initialFrame} />;
}

/** Fits all page bounds, reserving space below for the floating toolbar. */
function OverviewCamera(props: { document: TextDocument; viewer: ViewerState }) {
  const camera = useDocumentCamera();
  const viewport = useViewport();
  const loop = useFrameLoop();
  createEffect(props.viewer.overviewRequest, (request) => {
    if (!request) return;
    const document = untrack(() => props.document);
    const first = document.pages[0]!;
    let left = Infinity,
      right = -Infinity,
      bottom = Infinity,
      top = -Infinity;
    for (const page of document.pages) {
      left = Math.min(left, -page.x);
      right = Math.max(right, -page.x + page.width / first.width);
      bottom = Math.min(bottom, 1 - page.y - page.height / first.height);
      top = Math.max(top, 1 - page.y);
    }
    const { width, height } = untrack(viewport.size).css;
    const aspect = first.width / first.height;
    const availableHeight = Math.max(1, height - 128);
    camera.zoom =
      Math.max(
        ((right - left) * height) / Math.max(1, width - 48),
        ((top - bottom) * height) / (aspect * availableHeight)
      ) / 2;
    camera.x = (left + right) / 2;
    camera.y = (bottom + top) / 2 - (40 * camera.zoom * aspect) / height;
    camera.rotation = 0;
    loop.invalidate();
  });
  return null;
}
