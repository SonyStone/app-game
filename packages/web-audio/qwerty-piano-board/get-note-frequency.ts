/**
 * Get frequency of a given note.
 * @param  {string} note Musical note to convert into hertz.
 * @return {number} Frequency of note in hertz.
 */
export const getFrequencyOfNote = (note: string): number => {
  const notes = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
  let key_number = 0;
  let octave = 0;

  if (note.length === 3) {
    octave = parseInt(note.charAt(2));
  } else {
    octave = parseInt(note.charAt(1));
  }

  key_number = notes.indexOf(note.slice(0, -1));

  if (key_number < 3) {
    key_number = key_number + 12 + (octave - 1) * 12 + 1;
  } else {
    key_number = key_number + (octave - 1) * 12 + 1;
  }

  return 440 * Math.pow(2, (key_number - 49) / 12);
};
