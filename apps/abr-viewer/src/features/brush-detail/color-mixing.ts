import type { ColorMixing } from '@app-game/abr-brush/effects';

/** Runtime preference supplied by the host. Use a reactive getter for value; edits never enter ABR data. */
export type ColorMixingPreference = {
  readonly value: ColorMixing;
  /** Changes the working space for subsequent strokes and refreshes the test preview. */
  onChange: (value: ColorMixing) => void;
};
