import type { GizmoPlaneName } from './gizmoGeometry'
/** Only the selected set of workplane handles is rendered and pickable. */
export type WorkplaneGizmoMode = 'translate' | 'rotate'

export type WorkplaneGizmoAxisName = 'X' | 'Y' | 'Z'

export type WorkplaneGizmoHighlight =
  | {
      kind: 'plane'
      plane: GizmoPlaneName
    }
  | {
      kind: 'axis'
      axisName: WorkplaneGizmoAxisName
    }
  | {
      kind: 'rotation'
      axisName: WorkplaneGizmoAxisName
    }
