import { render } from '@solidjs/web';
import { createRoot, createSignal, For, onCleanup, Show } from 'solid-js';
import type { Camera, Point } from '../../src/features/camera/camera';
import { CameraControls } from '../../src/features/camera/CameraControls';
import { DocumentCamera, useDocumentCamera } from '../../src/features/camera/DocumentCamera';
import { DocumentSpace, ScreenSpace, useSceneSpace } from '../../src/features/camera/SceneSpace';
import type { TextDocument } from '../../src/features/document/document';
import { createDocumentDraw } from '../../src/features/document/rendering/createDocumentDraw';
import { DocumentRendererProvider } from '../../src/features/document/rendering/DocumentRendererProvider';
import { Rectangle } from '../../src/features/graphics/Rectangle';
import { FrameLoop, useFrame } from '../../src/features/scene/FrameLoop';
import { RenderLayer } from '../../src/features/scene/RenderLayer';
import { useViewport, Viewport } from '../../src/features/viewport/Viewport';
import type { ViewerError } from '../../src/shared/errors';
import { GpuCanvasProvider, useGpuCanvas } from '../../src/shared/gpu/GpuCanvasProvider';
import { TypeGPURootProvider } from '../../src/shared/gpu/TypeGPURootProvider';

/** Browser fixture with independently toggled document and graphic components. */
export function mountScene(canvas: HTMLCanvasElement, document: TextDocument) {
  return createRoot((disposeState) => {
    const [showDocument, setShowDocument] = createSignal(false);
    const [showRectangle, setShowRectangle] = createSignal(true);
    const [rectangleVisible, setRectangleVisible] = createSignal(true);
    const [worldVisible, setWorldVisible] = createSignal(false);
    const [annotations, setAnnotations] = createSignal([{ id: 'highlight', x: 0.4, y: 0.4 }]);
    const [maxDpr, setMaxDpr] = createSignal(2);
    const [pageAspect, setPageAspect] = createSignal(document.pages[0]!.width / document.pages[0]!.height);
    let project!: (point: Point) => Point;
    let viewport!: ReturnType<typeof useViewport>;
    let invalidate!: () => void;
    const [order, setOrder] = createSignal(0);
    const [x, setX] = createSignal(360);
    const [color, setColor] = createSignal<[number, number, number, number]>([1, 0, 0, 1]);
    const errors: ViewerError[] = [];
    const stats = { frames: 0, ready: 0, cameraMounts: 0, cameraDisposals: 0, destroyedBuffers: 0 };
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
        <TypeGPURootProvider requiredBufferBytes={document.glyphVertices.byteLength} error={fail}>
          <GpuCanvasProvider canvas={canvas} error={fail}>
            <Viewport maxDpr={maxDpr()}>
              <FrameLoop onError={fail}>
                {(loop) => {
                  invalidate = loop.invalidate;
                  return (
                    <DocumentCamera>
                      <DocumentSpace pageAspect={pageAspect()}>
                        <Probe />
                        <CameraControls pageAspect={document.pages[0]!.width / document.pages[0]!.height} />
                        <Show when={showDocument()}>
                          <DocumentRendererProvider
                            document={document}
                            onReady={() => stats.ready++}
                            error={(error) => {
                              loop.fail(error);
                              return null;
                            }}
                          >
                            {() => {
                              const draw = createDocumentDraw();

                              return <RenderLayer draw={draw} />;
                            }}
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
                        <Rectangle x={20} y={20} width={40} height={40} color={[0, 0, 1, 1]} order={20} />
                      </ScreenSpace>
                    </DocumentCamera>
                  );
                }}
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
        Object.assign(camera!, value);
        invalidate();
      },
      setShowDocument,
      setShowRectangle,
      setOrder,
      setX,
      setColor,
      stats,
      errors,
      camera: () => camera,
      dispose() {
        disposeView();
        disposeState();
      }
    };
  });
}
