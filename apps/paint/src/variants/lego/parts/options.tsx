import { cellRange } from '../options';
import { defineValuePart } from './values';

/** The kind of the grid size's part, which shows only on the Options sheet. */
export const gridSizeKind = 'value:grid-size';

/**
 * The grid's cell edge as a value part: a slider with its value chip and keypad, in pixels within `cellRange`. It
 * reads the cell in use, the host's or the device's default until the user chooses one, and writes the user's choice,
 * which the whole editor follows at once (see `createLegoOptions`). It stays out of the box.
 */
export const gridSizePart = defineValuePart({
  id: 'grid-size',
  group: 'interface',
  label: 'Grid size',
  short: 'Grid',
  unit: 'px',
  min: cellRange.min,
  step: cellRange.step,
  studioOnly: true,
  max: () => cellRange.max,
  read: (services) => services.options.cell(),
  write: (services, value) => services.options.setCell(value),
  colored: false
});
