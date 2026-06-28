import type {
  DrawingWorkplane,
  RenderLayer,
  Stroke,
  StrokeId,
} from '../document'
import {
  buildDrawingGeometry,
  buildCommittedDrawingGeometry,
  buildDynamicDrawingGeometry,
  type StrokePointOverlay,
} from './meshBuilder'
import type { Vec3 } from './vector'

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
  selectedStrokeIds: ReadonlySet<StrokeId> = new Set<StrokeId>(),
  pointOverlays: readonly StrokePointOverlay[] = [],
): RendererScene {
  return {
    ...scene,
    layers,
    workplane,
    selectedStrokeIds: new Set(selectedStrokeIds),
    pointOverlays: [...pointOverlays],
  }
}

export function updateRendererDraftStroke(
  scene: RendererScene,
  draftStroke?: Stroke,
): RendererScene {
  return {
    ...scene,
    draftStroke,
  }
}

export function buildRendererSceneCommittedGeometry(scene: RendererScene) {
  return buildCommittedDrawingGeometry({
    layers: scene.layers,
    workplane: scene.workplane,
    selectedStrokeIds: scene.selectedStrokeIds,
  })
}

export function buildRendererSceneDynamicGeometry(
  scene: RendererScene,
  billboardNormal: Vec3,
  cameraTarget: Vec3,
  cameraDistance: number,
) {
  return buildDynamicDrawingGeometry({
    layers: scene.layers,
    workplane: scene.workplane,
    billboardNormal,
    cameraDistance,
    cameraTarget,
    draftStroke: scene.draftStroke,
    pointOverlays: scene.pointOverlays,
  })
}

export function buildRendererSceneGeometry(
  scene: RendererScene,
  billboardNormal: Vec3,
  cameraTarget: Vec3,
  cameraDistance: number,
) {
  return buildDrawingGeometry({
    layers: scene.layers,
    workplane: scene.workplane,
    billboardNormal,
    cameraDistance,
    cameraTarget,
    draftStroke: scene.draftStroke,
    selectedStrokeIds: scene.selectedStrokeIds,
    pointOverlays: scene.pointOverlays,
  })
}
