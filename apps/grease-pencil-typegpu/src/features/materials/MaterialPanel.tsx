import { For } from 'solid-js'
import {
  materialFillStyles,
  materialGradientTypes,
  materialStrokeModes,
  strokeCapStyles,
  strokeJoinStyles,
  type GreaseMaterial,
  type MaterialFillStyle,
  type MaterialGradientType,
  type MaterialId,
  type MaterialStrokeMode,
  type StrokeCapStyle,
  type StrokeJoinStyle,
} from '../../document'
import type { Vec4 } from '../../render/math'
import {
  colorOptions,
  sameRgb,
  vec4ToCss,
  withAlpha,
} from '../shared/color'

const capStyleLabels = {
  round: 'Round',
  flat: 'Flat',
  square: 'Square',
} satisfies Record<StrokeCapStyle, string>

const joinStyleLabels = {
  round: 'Round',
  bevel: 'Bevel',
  miter: 'Miter',
} satisfies Record<StrokeJoinStyle, string>

const materialStrokeModeLabels = {
  line: 'Line',
  dot: 'Dots',
  square: 'Squares',
} satisfies Record<MaterialStrokeMode, string>

const materialFillStyleLabels = {
  solid: 'Solid',
  gradient: 'Gradient',
} satisfies Record<MaterialFillStyle, string>

const materialGradientTypeLabels = {
  linear: 'Linear',
  radial: 'Radial',
} satisfies Record<MaterialGradientType, string>

type MaterialPanelProps = {
  activeMaterial: GreaseMaterial
  activeMaterialId: MaterialId
  materials: readonly GreaseMaterial[]
  onSelectMaterial: (materialId: MaterialId) => void
  onSetUseStroke: (useStroke: boolean) => void
  onSetUseFill: (useFill: boolean) => void
  onSetStrokeMode: (strokeMode: MaterialStrokeMode) => void
  onSetCapStyle: (capStyle: StrokeCapStyle) => void
  onSetJoinStyle: (joinStyle: StrokeJoinStyle) => void
  onSetFillStyle: (fillStyle: MaterialFillStyle) => void
  onSetGradientType: (gradientType: MaterialGradientType) => void
  onSetFillColor: (fillColor: Vec4) => void
  onSetMixColor: (mixColor: Vec4) => void
}

export function MaterialPanel(props: MaterialPanelProps) {
  return (
    <section class="material-panel">
      <div class="panel-header">
        <span>Materials</span>
        <span class="panel-subtle">{props.activeMaterial.name}</span>
      </div>

      <div class="material-controls">
        <div class="material-list">
          <For each={props.materials}>
            {(material) => (
              <button
                class={`material-chip ${
                  material.id === props.activeMaterialId ? 'material-chip-active' : ''
                }`}
                type="button"
                onClick={() => props.onSelectMaterial(material.id)}
              >
                <span
                  class="material-swatch"
                  style={{ 'background-color': vec4ToCss(material.strokeColor) }}
                />
                <span class="material-name">{material.name}</span>
              </button>
            )}
          </For>
        </div>

        <div class="material-toggles">
          <label class="toggle-control">
            <input
              name="material-use-stroke"
              type="checkbox"
              checked={props.activeMaterial.useStroke}
              onChange={(event) =>
                props.onSetUseStroke(event.currentTarget.checked)
              }
            />
            Stroke
          </label>
          <label class="toggle-control">
            <input
              name="material-use-fill"
              type="checkbox"
              checked={props.activeMaterial.useFill}
              onChange={(event) => props.onSetUseFill(event.currentTarget.checked)}
            />
            Fill
          </label>
        </div>

        <div class="material-style-row">
          <label class="select-control">
            Mode
            <select
              name="material-stroke-mode"
              value={props.activeMaterial.strokeMode}
              onChange={(event) =>
                props.onSetStrokeMode(readMaterialStrokeMode(event.currentTarget.value))
              }
            >
              <For each={materialStrokeModes}>
                {(strokeMode) => (
                  <option value={strokeMode}>
                    {materialStrokeModeLabels[strokeMode]}
                  </option>
                )}
              </For>
            </select>
          </label>

          <label class="select-control">
            Cap
            <select
              name="material-cap-style"
              value={props.activeMaterial.capStyle}
              onChange={(event) =>
                props.onSetCapStyle(readStrokeCapStyle(event.currentTarget.value))
              }
            >
              <For each={strokeCapStyles}>
                {(capStyle) => (
                  <option value={capStyle}>{capStyleLabels[capStyle]}</option>
                )}
              </For>
            </select>
          </label>

          <label class="select-control">
            Join
            <select
              name="material-join-style"
              value={props.activeMaterial.joinStyle}
              onChange={(event) =>
                props.onSetJoinStyle(readStrokeJoinStyle(event.currentTarget.value))
              }
            >
              <For each={strokeJoinStyles}>
                {(joinStyle) => (
                  <option value={joinStyle}>{joinStyleLabels[joinStyle]}</option>
                )}
              </For>
            </select>
          </label>
        </div>

        <div class="material-fill-row">
          <label class="select-control">
            Fill
            <select
              name="material-fill-style"
              value={props.activeMaterial.fillStyle}
              onChange={(event) =>
                props.onSetFillStyle(readMaterialFillStyle(event.currentTarget.value))
              }
            >
              <For each={materialFillStyles}>
                {(fillStyle) => (
                  <option value={fillStyle}>
                    {materialFillStyleLabels[fillStyle]}
                  </option>
                )}
              </For>
            </select>
          </label>

          <label class="select-control">
            Gradient
            <select
              name="material-gradient-type"
              value={props.activeMaterial.gradientType}
              disabled={props.activeMaterial.fillStyle !== 'gradient'}
              onChange={(event) =>
                props.onSetGradientType(
                  readMaterialGradientType(event.currentTarget.value),
                )
              }
            >
              <For each={materialGradientTypes}>
                {(gradientType) => (
                  <option value={gradientType}>
                    {materialGradientTypeLabels[gradientType]}
                  </option>
                )}
              </For>
            </select>
          </label>
        </div>

        <div class="control-group-label">Fill Color</div>
        <div class="fill-color-strip">
          <For each={colorOptions}>
            {(color) => (
              <button
                class={`color-swatch ${
                  sameRgb(props.activeMaterial.fillColor, color.value)
                    ? 'color-swatch-active'
                    : ''
                }`}
                style={{ 'background-color': color.swatch }}
                type="button"
                title={color.name}
                onClick={() => props.onSetFillColor(withAlpha(color.value, 0.38))}
              />
            )}
          </For>
        </div>

        <div class="control-group-label">Mix Color</div>
        <div class="fill-color-strip">
          <For each={colorOptions}>
            {(color) => (
              <button
                class={`color-swatch ${
                  sameRgb(props.activeMaterial.mixColor, color.value)
                    ? 'color-swatch-active'
                    : ''
                }`}
                style={{ 'background-color': color.swatch }}
                type="button"
                title={color.name}
                onClick={() => props.onSetMixColor(withAlpha(color.value, 0.42))}
              />
            )}
          </For>
        </div>
      </div>
    </section>
  )
}

function readStrokeCapStyle(value: string): StrokeCapStyle {
  return strokeCapStyles.find((capStyle) => capStyle === value) ?? 'round'
}

function readStrokeJoinStyle(value: string): StrokeJoinStyle {
  return strokeJoinStyles.find((joinStyle) => joinStyle === value) ?? 'round'
}

function readMaterialStrokeMode(value: string): MaterialStrokeMode {
  return materialStrokeModes.find((strokeMode) => strokeMode === value) ?? 'line'
}

function readMaterialFillStyle(value: string): MaterialFillStyle {
  return materialFillStyles.find((fillStyle) => fillStyle === value) ?? 'solid'
}

function readMaterialGradientType(value: string): MaterialGradientType {
  return materialGradientTypes.find((gradientType) => gradientType === value) ?? 'linear'
}
