export type WorkplaneGizmoAxisName = 'X' | 'Y' | 'Z'

export type WorkplaneGizmoHighlight =
  | {
      kind: 'plane'
    }
  | {
      kind: 'axis'
      axisName: WorkplaneGizmoAxisName
    }
  | {
      kind: 'rotation'
      axisName: WorkplaneGizmoAxisName
    }
