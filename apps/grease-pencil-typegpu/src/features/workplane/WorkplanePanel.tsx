import { For } from 'solid-js'
import type {
  Axis,
  DrawingGrid,
  DrawingWorkplane,
  WorkplaneId,
} from '../../document'

const workplaneAxes = ['x', 'y', 'z'] as const satisfies readonly Axis[]

type WorkplanePanelProps = {
  activeWorkplaneId: WorkplaneId
  workplane: DrawingWorkplane
  workplanes: readonly DrawingGrid[]
  onAddWorkplane: () => void
  onRemoveActiveWorkplane: () => void
  onReset: () => void
  onSetActiveWorkplane: (workplaneId: WorkplaneId) => void
  onSetOrigin: (axis: Axis, value: number) => void
  onSetRotation: (axis: Axis, value: number) => void
  onSetScale: (value: number) => void
}

export function WorkplanePanel(props: WorkplanePanelProps) {
  return (
    <section class="workplane-panel">
      <div class="panel-header">
        <span>Drawing Grid</span>
        <div class="workplane-header-actions">
          <button class="command-button" type="button" onClick={props.onReset}>
            Reset
          </button>
          <button
            class="command-button"
            type="button"
            onClick={props.onAddWorkplane}
          >
            +
          </button>
          <button
            class="command-button"
            type="button"
            disabled={props.workplanes.length <= 1}
            onClick={props.onRemoveActiveWorkplane}
          >
            Del
          </button>
        </div>
      </div>

      <div class="workplane-grid-list">
        <For each={props.workplanes}>
          {(grid) => (
            <button
              class={`workplane-grid-button ${
                grid.id === props.activeWorkplaneId
                  ? 'workplane-grid-button-active'
                  : ''
              }`}
              type="button"
              onClick={() => props.onSetActiveWorkplane(grid.id)}
            >
              {grid.name}
            </button>
          )}
        </For>
      </div>

      <div class="workplane-controls">
        <div class="control-group-label">Position</div>
        <For each={workplaneAxes}>
          {(axis) => (
            <label class="number-control">
              {axis.toUpperCase()}
              <input
                name={`grid-origin-${axis}`}
                type="number"
                step="0.1"
                value={formatScalar(axisValue(props.workplane.origin, axis))}
                onInput={(event) =>
                  props.onSetOrigin(axis, event.currentTarget.valueAsNumber)
                }
              />
            </label>
          )}
        </For>

        <div class="control-group-label">Rotation</div>
        <For each={workplaneAxes}>
          {(axis) => (
            <label class="number-control">
              {axis.toUpperCase()}
              <input
                name={`grid-rotation-${axis}`}
                type="number"
                step="5"
                value={formatDegrees(axisValue(props.workplane.rotation, axis))}
                onInput={(event) =>
                  props.onSetRotation(
                    axis,
                    degreesToRadians(event.currentTarget.valueAsNumber),
                  )
                }
              />
            </label>
          )}
        </For>

        <label class="number-control number-control-wide">
          Scale
          <input
            name="grid-scale"
            type="number"
            min="0.1"
            max="10"
            step="0.1"
            value={formatScalar(props.workplane.gridScale)}
            onInput={(event) => props.onSetScale(event.currentTarget.valueAsNumber)}
          />
        </label>
      </div>
    </section>
  )
}

function axisValue(value: [number, number, number], axis: Axis) {
  switch (axis) {
    case 'x':
      return value[0]
    case 'y':
      return value[1]
    case 'z':
      return value[2]
    default: {
      const exhaustive: never = axis
      return exhaustive
    }
  }
}

function formatScalar(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0
}

function formatDegrees(value: number) {
  return Number.isFinite(value) ? Number(((value * 180) / Math.PI).toFixed(1)) : 0
}

function degreesToRadians(value: number) {
  return Number.isFinite(value) ? (value * Math.PI) / 180 : 0
}
