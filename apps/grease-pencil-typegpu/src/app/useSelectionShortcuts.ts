import {
  onCleanup,
  onMount,
  type Accessor,
} from 'solid-js'
import type { StrokeId, StrokePointKey } from '../document'

type UseSelectionShortcutsParams = {
  deleteSelectedPoints: () => void
  deleteSelectedStrokes: () => void
  selectedPointKeys: Accessor<ReadonlySet<StrokePointKey>>
  selectedStrokeIds: Accessor<ReadonlySet<StrokeId>>
}

export function useSelectionShortcuts(params: UseSelectionShortcutsParams) {
  onMount(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInputTarget(event.target)) return
      if (event.key !== 'Backspace' && event.key !== 'Delete') return
      if (
        params.selectedPointKeys().size === 0 &&
        params.selectedStrokeIds().size === 0
      ) {
        return
      }

      event.preventDefault()
      if (params.selectedPointKeys().size > 0) params.deleteSelectedPoints()
      else params.deleteSelectedStrokes()
    }

    window.addEventListener('keydown', handleKeyDown)

    onCleanup(() => {
      window.removeEventListener('keydown', handleKeyDown)
    })
  })
}

function isTextInputTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}
