export {
  DOCUMENT_STORAGE_KEY,
  materialFillStyles,
  materialGradientTypes,
  materialStrokeModes,
  strokeCapStyles,
  strokeJoinStyles,
} from './document/model'
export type {
  Axis,
  DocumentId,
  Drawing,
  DrawingId,
  DrawingWorkplane,
  FrameId,
  GreaseDocument,
  GreaseLayer,
  GreaseMaterial,
  LayerFrame,
  LayerFrameType,
  LayerId,
  MaterialGradientType,
  MaterialFillStyle,
  MaterialId,
  MaterialStrokeMode,
  OnionSkinSettings,
  RenderLayer,
  Stroke,
  StrokeCapStyle,
  StrokeId,
  StrokeJoinStyle,
  StrokePoint,
  StrokePointKey,
} from './document/model'
export { createStrokePointKey } from './document/ids'
export { createInitialDocument } from './document/factory'
export {
  getActiveMaterial,
  setActiveMaterial,
  setActiveMaterialCapStyle,
  setActiveMaterialFillColor,
  setActiveMaterialFillStyle,
  setActiveMaterialGradientType,
  setActiveMaterialJoinStyle,
  setActiveMaterialMixColor,
  setActiveMaterialStrokeColor,
  setActiveMaterialStrokeMode,
  setActiveMaterialStrokeRadius,
  setActiveMaterialUseFill,
  setActiveMaterialUseStroke,
} from './document/materials'
export {
  addLayer,
  deleteActiveFrame,
  duplicateHeldFrame,
  insertBlankFrame,
  moveLayerTowardBottom,
  moveLayerTowardTop,
  removeLayer,
  setActiveLayer,
  setCurrentFrame,
  setLayerOpacity,
  toggleLayerLock,
  toggleLayerVisibility,
} from './document/layers'
export {
  setOnionSkinEnabled,
  setOnionSkinNextFrames,
  setOnionSkinOpacity,
  setOnionSkinPreviousFrames,
} from './document/onionSkin'
export {
  countDocumentPoints,
  countDocumentStrokes,
  countLayerVisibleStrokes,
  getActiveLayer,
  getDrawingById,
  getLayerDrawingAtFrame,
  getLayerExactFrame,
  getLayerFrameAt,
  getRenderLayers,
} from './document/selectors'
export {
  appendStrokeToLayerFrame,
  clearActiveDrawing,
  createStroke,
  deletePointsFromActiveDrawing,
  deleteStrokesFromActiveDrawing,
  eraseStrokeSegmentFromActiveDrawing,
  translatePointsInActiveDrawing,
  translateStrokesInActiveDrawing,
  undoActiveDrawing,
} from './document/strokes'
export {
  resetWorkplane,
  setWorkplaneOrigin,
  setWorkplaneOriginVector,
  setWorkplaneRotation,
  setWorkplaneScale,
} from './document/workplane'
export {
  loadDocumentFromStorage,
  saveDocumentToStorage,
} from './document/storage'
