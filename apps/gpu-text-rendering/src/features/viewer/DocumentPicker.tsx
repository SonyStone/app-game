import { Button } from '@app-game/components/ui/button';
import folder from '@tabler/icons/outline/folder-open.svg?url';
import s from './viewer.module.scss';

/** Opens a native PDF/GDOC picker and resets its input so the same file can be opened again. */
export function DocumentPicker(props: {
  /** Accessible name of the picker button and hidden file input. */
  label: string;
  /** Tooltip describing accepted formats. */
  hint: string;
  /** Runs only after a file is selected; cancelling the dialog leaves the current session intact. */
  onOpen: (file: File) => void;
}) {
  let input: HTMLInputElement | undefined;
  return (
    <>
      <input
        ref={input}
        hidden
        type="file"
        accept=".pdf,.gdoc,application/pdf"
        aria-label={props.label}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            props.onOpen(file);
          }
          event.currentTarget.value = '';
        }}
      />
      <Button
        class={s.iconButton}
        variant="ghost"
        size="icon"
        aria-label={props.label}
        title={props.hint}
        onClick={() => input?.click()}
      >
        <img src={folder} alt="" />
      </Button>
    </>
  );
}
