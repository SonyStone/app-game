import type { PsdOpenPrompt } from '@app-game/psd/viewer';
import { For, onSettled } from 'solid-js';
import type { PromptAnswer } from './createOpenPrompt';
import styles from './openLikePhotoshop.module.css';

/**
 * A modal alert dialog showing a prompt Photoshop shows before opening `name`, with its verbatim text and its buttons
 * in Photoshop's order. Opens when mounted, with focus on Photoshop's default button, else the first; Escape answers
 * Cancel. Each button passes its answer to `onAnswer`; the caller unmounts the dialog once the answer is applied.
 */
export function OpenPromptDialog(props: {
  prompt: PsdOpenPrompt;
  name: string;
  onAnswer: (answer: PromptAnswer) => void;
}) {
  let dialog!: HTMLDialogElement;
  onSettled(() => {
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('button[data-default]')?.focus();
  });

  return (
    <dialog
      ref={(element) => (dialog = element)}
      class={styles.prompt}
      role="alertdialog"
      aria-labelledby="open-prompt-title"
      aria-describedby="open-prompt-message"
      data-prompt={props.prompt.id}
      onCancel={(event) => {
        event.preventDefault();
        if (props.prompt.buttons.some((button) => button.answer === 'cancel')) {
          props.onAnswer('cancel');
        }
      }}
    >
      <h2 id="open-prompt-title">Photoshop asks before opening {props.name}</h2>
      <p id="open-prompt-message">{props.prompt.message}</p>
      <div class={styles.buttons}>
        <For each={props.prompt.buttons}>
          {(button) => (
            <button
              type="button"
              data-default={button.default ? 'true' : undefined}
              onClick={() => props.onAnswer(button.answer)}
            >
              {button.label}
            </button>
          )}
        </For>
      </div>
    </dialog>
  );
}
