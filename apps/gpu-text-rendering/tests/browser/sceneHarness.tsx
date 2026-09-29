import { render } from '@solidjs/web';
import { createRoot, createSignal, For, onCleanup, Show } from 'solid-js';
import type { Camera } from '../../src/features/camera/camera';
import { CameraControls } from '../../src/features/camera/CameraControls';
import { createDocumentCamera } from '../../src/features/camera/createDocumentCamera';
import { DocumentSpace } from '../../src/features/camera/DocumentSpace';
import type { TextDocument } from '../../src/features/document/document';
import { DocumentRenderer } from '../../src/features/document/rendering/DocumentRenderer';
import { GlyphText } from '../../src/features/document/rendering/GlyphText';
import { Page } from '../../src/features/document/rendering/Page';
import { VectorArtwork } from '../../src/features/document/rendering/VectorArtwork';
import { Rectangle } from '../../src/features/graphics/Rectangle';
import { Rectangles } from '../../src/features/graphics/Rectangles';
import { FrameLoop, useFrame } from '../../src/features/scene/FrameLoop';
import { ScreenSpace, useSceneSpace, type Point } from '../../src/features/scene/SceneSpace';
import { createViewport } from '../../src/features/viewport/createViewport';
import type { ViewerError } from '../../src/shared/errors';
import { GpuCanvas } from '../../src/shared/gpu/GpuCanvas';
import { useGpuCanvas } from '../../src/shared/gpu/GpuCanvasProvider';

/** Browser fixture with independently toggled document and graphic components. */
export function mountScene(canvas: HTMLCanvasElement, document: TextDocument) {
  return createRoot((disposeState) => {
    const [showDocument, setShowDocument] = createSignal(false);
    const [documentVisible, setDocumentVisible] = createSignal(true);
    const [documentOrder, setDocumentOrder] = createSignal(0);
    const [pageMarkVisible, setPageMarkVisible] = createSignal(false);
    const [showRectangle, setShowRectangle] = createSignal(true);
    const [rectangleVisible, setRectangleVisible] = createSignal(true);
    const [worldVisible, setWorldVisible] = createSignal(false);
    const [annotations, setAnnotations] = createSignal([{ id: 'highlight', x: 0.4, y: 0.4 }]);
    const [maxDpr, setMaxDpr] = createSignal(2);
    const [pageAspect, setPageAspect] = createSignal(document.pages[0]!.width / document.pages[0]!.height);
    let project!: (point: Point) => Point;
    let projectPage!: (point: Point) => Point;
    const viewport = createViewport(() => canvas, { maxDpr });
    const camera = createDocumentCamera({ pageAspect });
    const [order, setOrder] = createSignal(0);
    const [x, setX] = createSignal(360);
    const [color, setColor] = createSignal<[number, number, number, number]>([1, 0, 0, 1]);
    const errors: ViewerError[] = [];
    const stats = {
      frames: 0,
      ready: 0,
      cameraMounts: 0,
      cameraDisposals: 0,
      destroyedBuffers: 0,
      presses: 0,
      moves: 0,
      releases: 0
    };

    function PageProbe() {
      projectPage = useSceneSpace().toScreen;
      return null;
    }

    function Probe() {
      stats.cameraMounts++;
      project = useSceneSpace().toScreen;
      onCleanup(() => stats.cameraDisposals++);
      useFrame(() => stats.frames++, { phase: 'update' });

      const device = useGpuCanvas().device;
      const createBuffer = device.createBuffer.bind(device);
      device.createBuffer = (descriptor) => {
        const buffer = createBuffer(descriptor);
        const destroy = buffer.destroy.bind(buffer);
        buffer.destroy = () => {
          stats.destroyedBuffers++;
          destroy();
        };
        return buffer;
      };
      onCleanup(() => {
        device.createBuffer = createBuffer;
      });

      return null;
    }

    const fail = (error: ViewerError) => {
      errors.push(error);
      return null;
    };

    const disposeView = render(
      () => (
        <GpuCanvas
          canvas={canvas}
          requiredBufferBytes={
            document.kind === 'glyphs'
              ? document.glyphVertices.byteLength
              : Math.max(document.curves.byteLength, document.instances.byteLength)
          }
          error={fail}
        >
          <FrameLoop viewport={viewport} onError={fail}>
            <DocumentSpace camera={camera}>
              <Probe />
              <CameraControls camera={camera} />
              <Show when={showDocument()}>
                <DocumentRenderer document={document} onReady={() => stats.ready++} onError={fail}>
                  {document.kind === 'glyphs' ? (
                    <GlyphText camera={camera} visible={documentVisible()} order={documentOrder()} />
                  ) : (
                    <VectorArtwork camera={camera} visible={documentVisible()} order={documentOrder()} />
                  )}
                  <Page camera={camera} index={0}>
                    <PageProbe />
                    <Rectangle
                      x={100}
                      y={100}
                      width={40}
                      height={40}
                      color={[1, 1, 0, 1]}
                      visible={pageMarkVisible()}
                      order={40}
                    />
                  </Page>
                </DocumentRenderer>
              </Show>
              <For each={annotations()} keyed={(item) => item.id}>
                {(item) => (
                  <Rectangle
                    x={item().x}
                    y={item().y}
                    width={0.2}
                    height={0.2}
                    color={[1, 0, 1, 1]}
                    visible={worldVisible()}
                    order={30}
                  />
                )}
              </For>
            </DocumentSpace>
            <ScreenSpace>
              <Show when={showRectangle()}>
                <Rectangle
                  x={x()}
                  y={260}
                  width={80}
                  height={80}
                  color={color()}
                  order={order()}
                  visible={rectangleVisible()}
                />
              </Show>
              <Rectangle
                x={20}
                y={20}
                width={40}
                height={40}
                color={[0, 0, 1, 1]}
                order={20}
                onPointerDown={() => stats.presses++}
                onPointerMove={() => stats.moves++}
                onPointerUp={() => stats.releases++}
              />
              <Rectangles
                items={[
                  { x: 700, y: 20, width: 40, height: 40 },
                  { x: 700, y: 80, width: 40, height: 40 }
                ]}
                color={[0, 1, 0, 1]}
                order={20}
              />
            </ScreenSpace>
          </FrameLoop>
        </GpuCanvas>
      ),
      globalThis.document.createElement('div')
    );

    return {
      setRectangleVisible,
      setWorldVisible,
      setAnnotations,
      setMaxDpr,
      setPageAspect,
      project: (point: Point) => project(point),
      projectPage: (point: Point) => projectPage(point),
      setPageMarkVisible,
      viewport: () => viewport.size(),
      setCamera(value: Partial<Camera>) {
        camera.setCamera((current) => ({ ...current, ...value }));
      },
      setShowDocument,
      setDocumentVisible,
      setDocumentOrder,
      setShowRectangle,
      setOrder,
      setX,
      setColor,
      stats,
      errors,
      camera: () => camera.camera(),
      dispose() {
        disposeView();
        disposeState();
      }
    };
  });
}
