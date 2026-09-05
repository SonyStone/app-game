import { describe, expect, it, vi } from 'vitest'
import type { DrawingWorkplane } from '../../document'
import type { InteractionViewport } from './viewportPort'
import { hitTestWorkplaneGizmo } from './workplaneGizmoInteraction'

const workplane: DrawingWorkplane = { origin: [0, 0, 0], rotation: [0, 0, 0], gridScale: 1 }
const renderer: InteractionViewport = {
  projectToScreen: ([x, y]) => ({ x: x * 100, y: y * 100, depth: 0.5 }),
  worldUnitsPerPixel: () => 0.01,
  transformTouch: vi.fn(),
  offsetFromWorkplane: (position) => position,
  orbit: vi.fn(),
  pan: vi.fn(),
  setWorkplaneGizmoHighlight: vi.fn(),
  screenToWorld: () => undefined,
  zoom: vi.fn()
}

describe('workplane gizmo mode picking', () => {
  it('does not capture a hidden translation handle in rotation mode', () => {
    expect(hitTestWorkplaneGizmo(renderer, workplane, 90, 0, 'translate', [0, 0, 10])?.kind).toBe('axis')
    expect(hitTestWorkplaneGizmo(renderer, workplane, 90, 0, 'rotate', [0, 0, 10])).toBeUndefined()
  })

  it('does not capture a hidden rotation ring in translation mode', () => {
    expect(hitTestWorkplaneGizmo(renderer, workplane, 50, 50, 'rotate', [0, 0, 10])?.kind).toBe('rotation')
    expect(hitTestWorkplaneGizmo(renderer, workplane, 50, 50, 'translate', [0, 0, 10])).toBeUndefined()
  })

  it('selects only the XY square and leaves the center empty', () => {
    expect(hitTestWorkplaneGizmo(renderer, workplane, 35, 35, 'translate', [0, 0, 10])).toMatchObject({ kind: 'plane', plane: 'XY', normal: [0, 0, 1] })
    expect(hitTestWorkplaneGizmo(renderer, workplane, 10, 0, 'translate', [0, 0, 10])).toBeUndefined()
  })

  it('resolves overlapping rings and axes exclusively to the selected action', () => {
    expect(hitTestWorkplaneGizmo(renderer, workplane, 70, 0, 'translate', [0, 0, 10])?.kind).toBe('axis')
    expect(hitTestWorkplaneGizmo(renderer, workplane, 70, 0, 'rotate', [0, 0, 10])?.kind).toBe('rotation')
    expect(hitTestWorkplaneGizmo(renderer, workplane, 0, 0, 'translate', [0, 0, 10])?.kind).toBeUndefined()
    expect(hitTestWorkplaneGizmo(renderer, workplane, 0, 0, 'rotate', [0, 0, 10])?.kind).toBeUndefined()
  })
})
