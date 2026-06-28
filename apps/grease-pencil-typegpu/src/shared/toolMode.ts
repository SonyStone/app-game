export type ToolMode = 'draw' | 'fill' | 'select' | 'edit' | 'erase' | 'orbit' | 'pan'

export type ToolModeOption = {
  mode: ToolMode
  label: string
  title: string
}

export const toolModeOptions = [
  { mode: 'draw', label: 'Draw', title: 'Draw' },
  { mode: 'fill', label: 'Fill', title: 'Draw closed filled shapes' },
  { mode: 'select', label: 'Select', title: 'Select and move strokes' },
  { mode: 'edit', label: 'Edit', title: 'Edit stroke points' },
  { mode: 'erase', label: 'Erase', title: 'Erase strokes' },
  { mode: 'orbit', label: 'Orbit', title: 'Orbit' },
  { mode: 'pan', label: 'Pan', title: 'Pan' },
] as const satisfies readonly ToolModeOption[]
