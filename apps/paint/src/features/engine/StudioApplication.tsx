import { createBrushResources } from '@app-game/abr-paint/resources';
import { abrBrush } from '@app-game/paint-core/composition/abrBrushEngine';
import { createAbrProcessor } from '@app-game/paint-core/composition/abrStrokeProcessor';
import {
  BrushEngines,
  BrushResources,
  createPaintApplication,
  Document,
  DocumentFeatures,
  PaintRuntime,
  Renderer,
  Storage,
  StrokeProcessor,
  type RuntimeBinding
} from '@app-game/paint-core/composition/PaintApplication';
import { placeImageEdit } from '@app-game/paint-core/composition/placeImageEdit';
import { roundBrush } from '@app-game/paint-core/composition/roundBrushEngine';
import { symmetryFeature } from '@app-game/paint-core/composition/symmetryFeature';
import { texturedBrush } from '@app-game/paint-core/composition/texturedBrushEngine';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { studioProcessors } from '@app-game/paint-core/strokeProcessors';
import { createTileStore } from '@app-game/paint-core/tileStore';
import { fillEdit } from '../fill/fillEdit';
import { framesFeature } from '../frames/framesFeature';
import { transformEdit } from '../transform/transformEdit';

/**
 * Starts the Studio engine: mounts the recipe under its own Solid root and returns the command runtime. `post`
 * delivers events to the editor and `close` ends the execution realm after a graceful `dispose`; both are supplied by
 * the worker entry or the main-thread transport, which also own the canvas.
 */
export function createStudioRuntime(post: RuntimeBinding['post'], close: RuntimeBinding['close']) {
  return createPaintApplication((binding) => <StudioApplication {...binding} />, post, close);
}

/**
 * The Studio recipe: paged document, IndexedDB tiles, the WebGPU renderer, stroke processors, brush engines and the
 * feature modules: paint symmetry, frames, image placement, the bucket fill and the transform.
 */
export function StudioApplication(props: RuntimeBinding) {
  return (
    <Document document={() => createDocument({ paged: true })}>
      <Storage storage={createTileStore}>
        <Renderer renderer={createPaintRenderer}>
          <StrokeProcessor
            processors={{ ...studioProcessors, abr: createAbrProcessor }}
            selectProcessor={(brush) =>
              brush.engine?.id === 'abr' && brush.stroke.mode !== 'none' ? 'abr' : brush.stroke.mode
            }
          >
            <BrushEngines
              engines={{
                [roundBrush.id]: roundBrush.engine,
                eraser: roundBrush.engine,
                [texturedBrush.id]: texturedBrush.engine,
                [abrBrush.id]: abrBrush.engine
              }}
              selectEngine={(brush) => (brush.tool === 'eraser' ? 'eraser' : 'round')}
            >
              <BrushResources resources={createBrushResources}>
                <DocumentFeatures
                  features={[symmetryFeature, framesFeature]}
                  edits={[placeImageEdit, fillEdit, transformEdit]}
                >
                  <PaintRuntime {...props} />
                </DocumentFeatures>
              </BrushResources>
            </BrushEngines>
          </StrokeProcessor>
        </Renderer>
      </Storage>
    </Document>
  );
}
