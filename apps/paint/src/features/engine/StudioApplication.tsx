import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { studioProcessors } from '@app-game/paint-core/strokeProcessors';
import { createTileStore } from '@app-game/paint-core/tileStore';
import { abrBrush } from '@app-game/paint-core/composition/abrBrushEngine';
import { createAbrProcessor } from '@app-game/paint-core/composition/abrStrokeProcessor';
import { createBrushResources } from '@app-game/abr-paint/resources';
import {
  BrushEngines,
  BrushResources,
  createPaintApplication,
  Document,
  PaintRuntime,
  Renderer,
  Storage,
  StrokeProcessor,
  type RuntimeBinding
} from '@app-game/paint-core/composition/PaintApplication';
import { roundBrush } from '@app-game/paint-core/composition/roundBrushEngine';
import { texturedBrush } from '@app-game/paint-core/composition/texturedBrushEngine';

/** The Studio recipe is shared by Vite's worker bundle and the local lazy-loaded endpoint. */
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
                <PaintRuntime {...props} />
              </BrushResources>
            </BrushEngines>
          </StrokeProcessor>
        </Renderer>
      </Storage>
    </Document>
  );
}

/** Starts the production recipe; transport details and canvas ownership are supplied by the caller. */
export function createStudioRuntime(post: RuntimeBinding['post'], close: RuntimeBinding['close']) {
  return createPaintApplication((binding) => <StudioApplication {...binding} />, post, close);
}
