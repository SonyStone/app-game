export {
  createDrawing,
  createLayer,
  createLayerFrame,
} from './documentFactories'
export {
  pruneUnusedDrawings,
} from './drawingCleanup'
export {
  DEFAULT_FRAME_NUMBER,
  sanitizeFrameNumber,
  sortFrames,
} from './frameNumbers'
export {
  ensureLayerFrame,
} from './layerFrameMutations'
export {
  swapLayers,
} from './layerOrder'
export {
  replaceDrawing,
  replaceLayer,
} from './documentReplace'
export {
  copyDrawingWithNewId,
  copyStroke,
} from './strokeClone'
