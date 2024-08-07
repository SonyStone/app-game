export const createKeys = (props: {
  startOctave: number;
  whiteNotes: string[];
  notesWithSharps: string[];
  totalWhiteKeys: number;
  whiteKeyWidth: number;
}) => {
  let i = 0;
  let key;
  const keys = [];
  let note_counter = 0;
  let octave_counter = props.startOctave;
  const total_white_keys = props.totalWhiteKeys;

  for (i = 0; i < total_white_keys; i++) {
    if (i % props.whiteNotes.length === 0) {
      note_counter = 0;
    }

    const bizarre_note_counter = props.whiteNotes[note_counter];

    if (bizarre_note_counter === 'C' && i !== 0) {
      octave_counter++;
    }

    key = {
      colour: 'white',
      octave: octave_counter,
      width: props.whiteKeyWidth,
      id: props.whiteNotes[note_counter] + octave_counter,
      noteNumber: i
    };

    keys.push(key);

    if (i !== total_white_keys - 1) {
      props.notesWithSharps.forEach(function (note, index) {
        if (note === props.whiteNotes[note_counter]) {
          key = {
            colour: 'black',
            octave: octave_counter,
            width: props.whiteKeyWidth / 2,
            id: props.whiteNotes[note_counter] + '#' + octave_counter,
            noteNumber: i
          };

          keys.push(key);
        }
      });
    }
    note_counter++;
  }

  return keys;
};
