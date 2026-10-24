/**
 * Editor tools, in toolbar order, with their keyboard shortcuts and how to use them. Drawing and
 * placing tools hand over to the select tool once their item is made.
 */
export const TOOLS = [
  {
    id: 'select',
    label: 'Select',
    key: 'V',
    hint: 'Click to select, Shift adds · drag a box from empty ground or an unselected road, park or water · drag to move · drag the knob to turn, Shift snaps · drag corners, click edge dots to add one, Alt-click to remove'
  },
  {
    id: 'rectangle',
    label: 'Rectangle',
    key: 'R',
    hint: 'Drag to draw a rectangle of the chosen kind · Shift draws a square'
  },
  {
    id: 'polygon',
    label: 'Polygon',
    key: 'P',
    hint: 'Click corners · click the first corner, double-click or Enter to close · Backspace takes one back · Esc cancels'
  },
  {
    id: 'road',
    label: 'Road',
    key: 'L',
    hint: 'Click points along the road · double-click or Enter to finish · Esc cancels'
  },
  { id: 'crate', label: 'Crate', key: 'C', hint: 'Click to place a crate' },
  {
    id: 'red-spawn',
    label: 'Red spawn',
    key: '1',
    hint: 'Drag a red spawn zone, or click for one of the default size'
  },
  {
    id: 'blue-spawn',
    label: 'Blue spawn',
    key: '2',
    hint: 'Drag a blue spawn zone, or click for one of the default size'
  },
  { id: 'capture', label: 'Capture point', key: 'K', hint: 'Click to place a capture point · drag to set its radius' },
  {
    id: 'hand',
    label: 'Pan',
    key: 'H',
    hint: 'Drag to pan · also middle button or Space + drag anywhere · wheel zooms'
  }
] as const;

/** An editor tool. */
export type Tool = (typeof TOOLS)[number]['id'];
