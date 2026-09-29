import { render } from '@solidjs/web';
import { createRoot, createSignal, For, onCleanup, Show } from 'solid-js';
import type { Camera } from '../../src/features/camera/camera';
import { CameraControls } from '../../src/features/camera/CameraControls';
import { DocumentCamera, useDocumentCamera } from '../../src/features/camera/DocumentCamera';
import { DocumentSpace } from '../../src/features/camera/DocumentSpace';
import type { TextDocument } from '../../src/features/document/document';
import { DocumentLayer } from '../../src/features/document/rendering/DocumentLayer';
import { DocumentRendererProvider } from '../../src/features/document/rendering/DocumentRendererProvider';
import { Rectangle } from '../../src/features/graphics/Rectangle';
import { Rectangles } from '../../src/features/graphics/Rectangles';
import { FrameLoop, useFrame } from '../../src/features/scene/FrameLoop';
import { ScreenSpace, useSceneSpace, type Point } from '../../src/features/scene/SceneSpace';
import { useViewport, Viewport } from '../../src/features/viewport/Viewport';
import type { ViewerError } from '../../src/shared/errors';
import { GpuCanvasProvider, useGpuCanvas } from '../../src/shared/gpu/GpuCanvasProvider';
import { TypeGPURootProvider } from '../../src/shared/gpu/TypeGPURootProvider';

/** Browser fixture with independently toggled document and graphic components. */
export function mountScene(canvas: HTMLCanvasElement, document: TextDocument) {
  return createRoot((disposeState) => {
    const [showDocument, setShowDocument] = createSignal(false);
    const [documentVisible, setDocumentVisible] = createSignal(true);
    const [documentOrder, setDocumentOrder] = createSignal(0);
    const [showRectangle, setShowRectangle] = createSignal(true);
    const [rectangleVisible, setRectangleVisible] = createSignal(true);
    const [worldVisible, setWorldVisible] = createSignal(false);
    const [annotations, setAnnotations] = createSignal([{ id: 'highlight', x: 0.4, y: 0.4 }]);
    const [maxDpr, setMaxDpr] = createSignal(2);
    const [pageAspect, setPageAspect] = createSignal(document.pages[0]!.width / document.pages[0]!.height);
    let project!: (point: Point) => Point;
    let viewport!: ReturnType<typeof useViewport>;
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
    let camera: ReturnType<typeof useDocumentCamera> | undefined;

    function Probe() {
      stats.cameraMounts++;
      camera = useDocumentCamera();
      viewport = useViewport();
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
        <TypeGPURootProvider
          requiredBufferBytes={
            document.kind === 'glyphs'
              ? document.glyphVertices.byteLength
              : Math.max(document.curves.byteLength, document.instances.byteLength)
          }
          error={fail}
        >
          <GpuCanvasProvider canvas={canvas} error={fail}>
            <Viewport maxDpr={maxDpr()}>
              <FrameLoop onError={fail}>
                <DocumentCamera pageAspect={pageAspect()}>
                  <DocumentSpace>
                    <Probe />
                    <CameraControls />
                    <Show when={showDocument()}>
                      <DocumentRendererProvider document={document} onReady={() => stats.ready++} error={fail}>
                        <DocumentLayer visible={documentVisible()} order={documentOrder()} />
                      </DocumentRendererProvider>
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
                </DocumentCamera>
              </FrameLoop>
            </Viewport>
          </GpuCanvasProvider>
        </TypeGPURootProvider>
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
      viewport: () => viewport.size(),
      setCamera(value: Partial<Camera>) {
        camera!.setCamera((current) => ({ ...current, ...value }));
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
      camera: () => camera?.camera(),
      dispose() {
        disposeView();
        disposeState();
      }
    };
  });
}
