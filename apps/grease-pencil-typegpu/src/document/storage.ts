import type { Vec3, Vec4 } from '../render/math'
import { createInitialDocument } from './factory'
import { copyVec3, copyVec4 } from './geometry'
import { createDefaultMaterials } from './materials'
import { DOCUMENT_STORAGE_KEY } from './model'
import { normalizeOnionSkinSettings } from './onionSkin'
import { sanitizeFrameNumber, sortFrames } from './structure'
import { normalizeWorkplane } from './workplane'
import type {
  Drawing,
  DrawingWorkplane,
  GreaseDocument,
  GreaseLayer,
  GreaseMaterial,
  LayerFrame,
  LayerFrameType,
  MaterialFillStyle,
  MaterialGradientType,
  MaterialId,
  MaterialStrokeMode,
  OnionSkinSettings,
  Stroke,
  StrokeCapStyle,
  StrokeJoinStyle,
  StrokePoint,
} from './model'

type StoredStrokePoint = Omit<StrokePoint, 'radius' | 'opacity' | 'vertexColor'> & {
  radius?: number
  opacity?: number
  vertexColor?: Vec4
}

type StoredStroke = Omit<Stroke, 'materialId' | 'closed' | 'points'> & {
  materialId?: MaterialId
  closed?: boolean
  points: StoredStrokePoint[]
}

type StoredDrawing = Omit<Drawing, 'strokes'> & {
  strokes: StoredStroke[]
}

type StoredGreaseMaterial = Omit<
  GreaseMaterial,
  'capStyle' | 'joinStyle' | 'strokeMode' | 'fillStyle' | 'gradientType' | 'mixColor'
> & {
  capStyle?: StrokeCapStyle
  joinStyle?: StrokeJoinStyle
  strokeMode?: MaterialStrokeMode
  fillStyle?: MaterialFillStyle
  gradientType?: MaterialGradientType
  mixColor?: Vec4
}

type StoredGreaseDocument = Omit<
  GreaseDocument,
  'activeMaterialId' | 'workplane' | 'onionSkin' | 'drawings' | 'materials'
> & {
  activeMaterialId?: MaterialId
  workplane?: DrawingWorkplane
  onionSkin?: OnionSkinSettings
  drawings: StoredDrawing[]
  materials?: StoredGreaseMaterial[]
}

export function loadDocumentFromStorage(): GreaseDocument | undefined {
  try {
    const serialized = localStorage.getItem(DOCUMENT_STORAGE_KEY)
    if (!serialized) return undefined

    const parsed = JSON.parse(serialized) as unknown
    if (!isStoredGreaseDocument(parsed)) return undefined

    return normalizeDocument(parsed)
  }
  catch {
    return undefined
  }
}

export function saveDocumentToStorage(document: GreaseDocument) {
  try {
    localStorage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(document))
  }
  catch {
    // Storage is a convenience; drawing should keep working if it is blocked.
  }
}

function normalizeDocument(document: StoredGreaseDocument): GreaseDocument {
  if (document.layers.length > 0) {
    const materials = normalizeMaterials(document.materials)
    const activeMaterial =
      materials.find((material) => material.id === document.activeMaterialId) ??
      materials[0]
    const activeLayer =
      document.layers.find((layer) => layer.id === document.activeLayerId) ??
      document.layers[document.layers.length - 1]

    return {
      ...document,
      currentFrame: sanitizeFrameNumber(document.currentFrame),
      activeLayerId: activeLayer?.id ?? document.activeLayerId,
      activeMaterialId: activeMaterial.id,
      workplane: normalizeWorkplane(document.workplane),
      onionSkin: normalizeOnionSkinSettings(document.onionSkin),
      layers: document.layers.map((layer) => ({
        ...layer,
        opacity: clamp01(layer.opacity),
        frames: sortFrames(layer.frames),
      })),
      drawings: document.drawings.map((drawing) =>
        normalizeDrawing(drawing, activeMaterial.id),
      ),
      materials,
    }
  }

  return createInitialDocument()
}

function copyStrokePoint(
  point: StoredStrokePoint,
  fallbackStrokeRadius = 0.045,
  fallbackVertexColor: Vec4 = [0, 0, 0, 1],
): StrokePoint {
  return {
    position: copyVec3(point.position),
    pressure: point.pressure,
    radius: pointRadiusFromStoredPoint(point, fallbackStrokeRadius),
    opacity: clamp01(point.opacity ?? 1),
    vertexColor: normalizePointVertexColor(point.vertexColor, fallbackVertexColor),
    time: point.time,
  }
}

function pointRadiusFromStoredPoint(
  point: StoredStrokePoint,
  fallbackStrokeRadius: number,
) {
  return sanitizePointRadius(point.radius ?? fallbackStrokeRadius * point.pressure)
}

function normalizePointVertexColor(
  vertexColor: Vec4 | undefined,
  fallbackVertexColor: Vec4,
) {
  return copyVec4(vertexColor ?? fallbackVertexColor)
}

function normalizeMaterials(
  materials: StoredGreaseMaterial[] | undefined,
): [GreaseMaterial, ...GreaseMaterial[]] {
  const defaults = createDefaultMaterials()
  if (!materials || materials.length === 0) return defaults

  const normalized = materials
    .filter(isGreaseMaterial)
    .map((material) => ({
      ...material,
      strokeColor: copyVec4(material.strokeColor),
      fillColor: copyVec4(material.fillColor),
      mixColor: copyVec4(material.mixColor ?? material.fillColor),
      strokeRadius: sanitizeStrokeRadius(material.strokeRadius),
      capStyle: normalizeStrokeCapStyle(material.capStyle),
      joinStyle: normalizeStrokeJoinStyle(material.joinStyle),
      strokeMode: normalizeMaterialStrokeMode(material.strokeMode),
      fillStyle: normalizeMaterialFillStyle(material.fillStyle),
      gradientType: normalizeMaterialGradientType(material.gradientType),
    }))

  const firstMaterial = normalized[0]
  if (!firstMaterial) return defaults

  return [firstMaterial, ...normalized.slice(1)]
}

function normalizeDrawing(
  drawing: StoredDrawing,
  fallbackMaterialId: MaterialId,
): Drawing {
  return {
    id: drawing.id,
    strokes: drawing.strokes.map((stroke) =>
      normalizeStroke(stroke, fallbackMaterialId),
    ),
  }
}

function normalizeStroke(
  stroke: StoredStroke,
  fallbackMaterialId: MaterialId,
): Stroke {
  const radius = sanitizeStrokeRadius(stroke.radius)
  const color = copyVec4(stroke.color)
  return {
    id: stroke.id,
    materialId: stroke.materialId ?? fallbackMaterialId,
    color,
    radius,
    closed: stroke.closed ?? false,
    points: stroke.points.map((point) => copyStrokePoint(point, radius, color)),
  }
}

function sanitizeStrokeRadius(value: number) {
  if (!Number.isFinite(value)) return 0.045
  return Math.max(0.002, Math.min(0.4, value))
}

function sanitizePointRadius(value: number) {
  return sanitizeStrokeRadius(value)
}

function normalizeStrokeCapStyle(
  value: StrokeCapStyle | undefined,
): StrokeCapStyle {
  return value && isStrokeCapStyle(value) ? value : 'round'
}

function normalizeStrokeJoinStyle(
  value: StrokeJoinStyle | undefined,
): StrokeJoinStyle {
  return value && isStrokeJoinStyle(value) ? value : 'round'
}

function normalizeMaterialStrokeMode(
  value: MaterialStrokeMode | undefined,
): MaterialStrokeMode {
  return value && isMaterialStrokeMode(value) ? value : 'line'
}

function normalizeMaterialFillStyle(
  value: MaterialFillStyle | undefined,
): MaterialFillStyle {
  return value && isMaterialFillStyle(value) ? value : 'solid'
}

function normalizeMaterialGradientType(
  value: MaterialGradientType | undefined,
): MaterialGradientType {
  return value && isMaterialGradientType(value) ? value : 'linear'
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 1
  return clamp(value, 0, 1)
}

function isStoredGreaseDocument(value: unknown): value is StoredGreaseDocument {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.currentFrame === 'number' &&
    typeof value.activeLayerId === 'string' &&
    (!('activeMaterialId' in value) || typeof value.activeMaterialId === 'string') &&
    (!('workplane' in value) || isDrawingWorkplane(value.workplane)) &&
    (!('onionSkin' in value) || isOnionSkinSettings(value.onionSkin)) &&
    Array.isArray(value.layers) &&
    value.layers.every(isGreaseLayer) &&
    Array.isArray(value.drawings) &&
    value.drawings.every(isDrawing) &&
    (!('materials' in value) ||
      (Array.isArray(value.materials) && value.materials.every(isGreaseMaterial)))
  )
}

function isDrawingWorkplane(value: unknown): value is DrawingWorkplane {
  if (!isRecord(value)) return false
  return (
    isVec3(value.origin) &&
    isVec3(value.rotation) &&
    typeof value.gridScale === 'number'
  )
}

function isOnionSkinSettings(value: unknown): value is OnionSkinSettings {
  if (!isRecord(value)) return false
  return (
    typeof value.enabled === 'boolean' &&
    typeof value.previousFrames === 'number' &&
    typeof value.nextFrames === 'number' &&
    typeof value.opacity === 'number' &&
    isVec4(value.previousColor) &&
    isVec4(value.nextColor)
  )
}

function isGreaseLayer(value: unknown): value is GreaseLayer {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.visible === 'boolean' &&
    typeof value.locked === 'boolean' &&
    typeof value.opacity === 'number' &&
    Array.isArray(value.frames) &&
    value.frames.every(isLayerFrame)
  )
}

function isGreaseMaterial(value: unknown): value is StoredGreaseMaterial {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isVec4(value.strokeColor) &&
    isVec4(value.fillColor) &&
    (!('mixColor' in value) || isVec4(value.mixColor)) &&
    typeof value.strokeRadius === 'number' &&
    typeof value.useStroke === 'boolean' &&
    typeof value.useFill === 'boolean' &&
    (!('capStyle' in value) || isStrokeCapStyle(value.capStyle)) &&
    (!('joinStyle' in value) || isStrokeJoinStyle(value.joinStyle)) &&
    (!('strokeMode' in value) || isMaterialStrokeMode(value.strokeMode)) &&
    (!('fillStyle' in value) || isMaterialFillStyle(value.fillStyle)) &&
    (!('gradientType' in value) || isMaterialGradientType(value.gradientType))
  )
}

function isStrokeCapStyle(value: unknown): value is StrokeCapStyle {
  switch (value) {
    case 'round':
    case 'flat':
    case 'square':
      return true
    default:
      return false
  }
}

function isStrokeJoinStyle(value: unknown): value is StrokeJoinStyle {
  switch (value) {
    case 'round':
    case 'bevel':
    case 'miter':
      return true
    default:
      return false
  }
}

function isMaterialStrokeMode(value: unknown): value is MaterialStrokeMode {
  switch (value) {
    case 'line':
    case 'dot':
    case 'square':
      return true
    default:
      return false
  }
}

function isMaterialFillStyle(value: unknown): value is MaterialFillStyle {
  switch (value) {
    case 'solid':
    case 'gradient':
      return true
    default:
      return false
  }
}

function isMaterialGradientType(value: unknown): value is MaterialGradientType {
  switch (value) {
    case 'linear':
    case 'radial':
      return true
    default:
      return false
  }
}

function isLayerFrame(value: unknown): value is LayerFrame {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.frameNumber === 'number' &&
    typeof value.drawingId === 'string' &&
    isLayerFrameType(value.type)
  )
}

function isDrawing(value: unknown): value is StoredDrawing {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    Array.isArray(value.strokes) &&
    value.strokes.every(isStroke)
  )
}

function isStroke(value: unknown): value is StoredStroke {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    (!('materialId' in value) || typeof value.materialId === 'string') &&
    isVec4(value.color) &&
    typeof value.radius === 'number' &&
    (!('closed' in value) || typeof value.closed === 'boolean') &&
    Array.isArray(value.points) &&
    value.points.every(isStrokePoint)
  )
}

function isStrokePoint(value: unknown): value is StoredStrokePoint {
  if (!isRecord(value)) return false
  return (
    isVec3(value.position) &&
    typeof value.pressure === 'number' &&
    (!('radius' in value) || typeof value.radius === 'number') &&
    (!('opacity' in value) || typeof value.opacity === 'number') &&
    (!('vertexColor' in value) || isVec4(value.vertexColor)) &&
    typeof value.time === 'number'
  )
}

function isLayerFrameType(value: unknown): value is LayerFrameType {
  return (
    value === 'keyframe' ||
    value === 'breakdown' ||
    value === 'extreme' ||
    value === 'jitter' ||
    value === 'moving-hold'
  )
}

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === 'number')
  )
}

function isVec4(value: unknown): value is Vec4 {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => typeof item === 'number')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
