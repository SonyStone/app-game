/**
 * Order notes into order defined by starting key in settings.
 * @param {array} notes_to_order Notes to be ordered.
 * @return {array} ordered_notes Ordered notes.
 */
export const orderNotes = (notes_to_order: string[], startNote: string): string[] => {
  let i;
  let keyOffset = 0;
  const number_of_notes_to_order = notes_to_order.length;
  const ordered_notes = [];

  for (i = 0; i < number_of_notes_to_order; i++) {
    if (startNote.charAt(0) === notes_to_order[i]) {
      keyOffset = i;
      break;
    }
  }

  for (i = 0; i < number_of_notes_to_order; i++) {
    if (i + keyOffset > number_of_notes_to_order - 1) {
      ordered_notes[i] = notes_to_order[i + keyOffset - number_of_notes_to_order];
    } else {
      ordered_notes[i] = notes_to_order[i + keyOffset];
    }
  }

  return ordered_notes;
};
