type EditCommandBarProps = {
  canDeleteSelection: boolean
  onDeleteSelection: () => void
  onUndo: () => void
  onClear: () => void
}

export function EditCommandBar(props: EditCommandBarProps) {
  return (
    <>
      <button
        class="command-button ml-auto"
        type="button"
        disabled={!props.canDeleteSelection}
        onClick={props.onDeleteSelection}
      >
        Delete Sel
      </button>
      <button class="command-button" type="button" onClick={props.onUndo}>
        Undo
      </button>
      <button class="command-button" type="button" onClick={props.onClear}>
        Clear
      </button>
    </>
  )
}
