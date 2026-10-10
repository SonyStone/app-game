import { createBrushResources } from '@app-game/abr-paint/resources';
import type { StorageFactory } from '@app-game/paint-core/composition/contracts';
import { createMemoryStorage } from '@app-game/paint-core/composition/memoryStorage';
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
import { symmetryFeature } from '@app-game/paint-core/composition/symmetryFeature';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { createTileStore } from '@app-game/paint-core/tileStore';
import { fillEdit } from '../fill/fillEdit';
import { framesFeature } from '../frames/framesFeature';
import { gradientEdit } from '../gradient/gradientEdit';
import { localUndoEdit } from '../local-undo/localUndoEdit';
import { selectionEdit } from '../selection/selectionEdit';
import { transformEdit } from '../transform/transformEdit';
import { studioBrushRecipe } from './studioBrushes';

/**
 * Starts the Studio engine: mounts the recipe under its own Solid root and returns the command runtime. `post`
 * delivers events to the editor and `close` ends the execution realm after a graceful `dispose`; both are supplied by
 * the worker entry or the main-thread transport, which also own the canvas.
 */
export function createStudioRuntime(post: RuntimeBinding['post'], close: RuntimeBinding['close']) {
  return createPaintApplication((binding) => <StudioApplication {...binding} />, post, close);
}

/** A live viewer's drawing (storage `live:…`) stays in memory; every other drawing is kept in IndexedDB. */
const liveViewerStorage = createMemoryStorage();
const studioStorage: StorageFactory = (name) =>
  name.startsWith('live:') ? liveViewerStorage(name) : createTileStore(name);

/**
 * The Studio recipe: paged document, IndexedDB tiles, the WebGPU renderer, stroke processors, brush engines and the
 * feature modules: paint symmetry, frames, image placement, the bucket fill, the gradient, the transform and the local
 * undo.
 */
export function StudioApplication(props: RuntimeBinding) {
  return (
    <Document document={() => createDocument({ paged: true })}>
      <Storage storage={studioStorage}>
        <Renderer renderer={createPaintRenderer}>
          <StrokeProcessor
            processors={studioBrushRecipe.processors}
            selectProcessor={studioBrushRecipe.selectProcessor}
          >
            <BrushEngines engines={studioBrushRecipe.engines} selectEngine={studioBrushRecipe.selectEngine}>
              <BrushResources resources={createBrushResources}>
                <DocumentFeatures
                  features={[symmetryFeature, framesFeature]}
                  edits={[placeImageEdit, selectionEdit, fillEdit, gradientEdit, transformEdit, localUndoEdit]}
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
