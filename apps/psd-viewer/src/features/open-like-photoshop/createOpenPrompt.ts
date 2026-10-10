import type { PsdOpenAnswers, PsdOpenPrompt } from '@app-game/psd/viewer';
import type { Accessor } from 'solid-js';
import type { PsdSource } from '../document';
import type { OpenedPsd, PsdResultOf } from '../psd-worker';

/**
 * Photoshop's prompts while opening. `prompt` is the prompt the open source's answers leave unanswered, `undefined`
 * otherwise. `answer` reopens the source with the chosen button's answer added to its answers, so the document opens
 * as Photoshop opens it after that answer; Cancel ends in Photoshop's refusal, which `opened` reports as a failure.
 */
export function createOpenPrompt(
  source: Accessor<PsdSource | undefined>,
  opened: Accessor<PsdResultOf<OpenedPsd> | undefined>,
  open: (source: PsdSource) => void
) {
  const prompt = (): PsdOpenPrompt | undefined => {
    const result = opened();
    return result && !result.ok && result.error.kind === 'needsAnswer' ? result.error.prompt : undefined;
  };

  /** Reopens the current source with `choice`, one of `asked`'s buttons' answers. */
  const answer = (asked: PsdOpenPrompt, choice: PromptAnswer) => {
    const current = source();
    if (!current) {
      return;
    }

    // A button's answer belongs to its prompt's key, which TypeScript cannot pair through the computed key.
    const answers = { ...current.answers, [asked.id]: choice } as PsdOpenAnswers;
    open({ ...current, answers });
  };

  return { prompt, answer };
}

/** The answer of one of a prompt's buttons. */
export type PromptAnswer = PsdOpenPrompt['buttons'][number]['answer'];
