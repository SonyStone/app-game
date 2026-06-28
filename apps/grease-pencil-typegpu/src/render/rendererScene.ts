import type {
  DrawingWorkplane,
  RenderLayer,
  Stroke,
  StrokeId,
} from '../document'
import {
  buildDrawingVertices,
  type StrokePointOverlay,
} from './meshBuilder'

export type { StrokePointOverlay } from './meshBuilder'

const DEFAULT_WORKPLANE: DrawingWorkplane = {
  origin: [0, 0, 0],
  rotation: [0, 0, 0],
  gridScale: 1,
}

export type RendererScene = {
  layers: RenderLayer[]
  workplane: DrawingWorkplane
  draftStroke?: Stroke
  selectedStrokeIds: ReadonlySet<StrokeId>
  pointOverlays: readonly StrokePointOverlay[]
}

export function createRendererScene(): RendererScene {
  return {
    layers: [],
    workplane: DEFAULT_WORKPLANE,
    selectedStrokeIds: new Set<StrokeId>(),
    pointOverlays: [],
  }
}

export function updateRendererScene(
  scene: RendererScene,
  layers: RenderLayer[],
  workplane: DrawingWorkplane,
  draftStroke?: Stroke,
  selectedStrokeIds: ReadonlySet<StrokeId> = new Set<StrokeId>(),
  pointOverlays: readonly StrokePointOverlay[] = [],
): RendererScene {
  return {
    ...scene,
    layers,
    workplane,
    draftStroke,
    selectedStrokeIds: new Set(selectedStrokeIds),
    pointOverlays: [...pointOverlays],
  }
}

export function buildRendererSceneVertices(scene: RendererScene) {
  return buildDrawingVertices({
    layers: scene.layers,
    workplane: scene.workplane,
    draftStroke: scene.draftStroke,
    selectedStrokeIds: scene.selectedStrokeIds,
    pointOverlays: scene.pointOverlays,
  })
}
