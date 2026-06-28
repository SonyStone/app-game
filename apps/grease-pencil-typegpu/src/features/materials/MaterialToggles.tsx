type MaterialTogglesProps = {
  useStroke: boolean
  useFill: boolean
  onSetUseStroke: (useStroke: boolean) => void
  onSetUseFill: (useFill: boolean) => void
}

export function MaterialToggles(props: MaterialTogglesProps) {
  return (
    <div class="material-toggles">
      <label class="toggle-control">
        <input
          name="material-use-stroke"
          type="checkbox"
          checked={props.useStroke}
          onChange={(event) => props.onSetUseStroke(event.currentTarget.checked)}
        />
        Stroke
      </label>
      <label class="toggle-control">
        <input
          name="material-use-fill"
          type="checkbox"
          checked={props.useFill}
          onChange={(event) => props.onSetUseFill(event.currentTarget.checked)}
        />
        Fill
      </label>
    </div>
  )
}
