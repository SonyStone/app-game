import {
  type GreaseMaterial,
  type MaterialFillStyle,
  type MaterialGradientType,
  type MaterialId,
  type MaterialStrokeMode,
  type StrokeCapStyle,
  type StrokeJoinStyle,
} from '../../document'
import type { Vec4 } from '../../shared/vector'
import { MaterialColorStrip } from './MaterialColorStrip'
import { MaterialFillControls } from './MaterialFillControls'
import { MaterialList } from './MaterialList'
import { MaterialStrokeControls } from './MaterialStrokeControls'
import { MaterialToggles } from './MaterialToggles'

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
        <MaterialList
          activeMaterialId={props.activeMaterialId}
          materials={props.materials}
          onSelectMaterial={props.onSelectMaterial}
        />

        <MaterialToggles
          useFill={props.activeMaterial.useFill}
          useStroke={props.activeMaterial.useStroke}
          onSetUseFill={props.onSetUseFill}
          onSetUseStroke={props.onSetUseStroke}
        />

        <MaterialStrokeControls
          capStyle={props.activeMaterial.capStyle}
          joinStyle={props.activeMaterial.joinStyle}
          strokeMode={props.activeMaterial.strokeMode}
          onSetCapStyle={props.onSetCapStyle}
          onSetJoinStyle={props.onSetJoinStyle}
          onSetStrokeMode={props.onSetStrokeMode}
        />

        <MaterialFillControls
          fillStyle={props.activeMaterial.fillStyle}
          gradientType={props.activeMaterial.gradientType}
          onSetFillStyle={props.onSetFillStyle}
          onSetGradientType={props.onSetGradientType}
        />

        <MaterialColorStrip
          activeColor={props.activeMaterial.fillColor}
          alpha={0.38}
          label="Fill Color"
          onSelectColor={props.onSetFillColor}
        />

        <MaterialColorStrip
          activeColor={props.activeMaterial.mixColor}
          alpha={0.42}
          label="Mix Color"
          onSelectColor={props.onSetMixColor}
        />
      </div>
    </section>
  )
}
