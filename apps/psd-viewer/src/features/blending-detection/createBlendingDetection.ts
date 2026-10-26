import type { PsdRenderSettings } from '@app-game/psd/viewer';
import { createMemo, createSignal, isPending, untrack, type Accessor } from 'solid-js';
import type { OpenedPsd, PsdClient, PsdResultOf } from '../psd-worker';

/**
 * Chooses Photoshop's blending preferences per document, which files do not record: when a document opens, the
 * worker renders it with "Blend RGB Colors Using Gamma 1.0" off and on, and for documents with type layers also with
 * "Blend Text Colors Using Gamma" toggled; the settings whose render matches Photoshop's merged image more closely
 * apply to that document. `settings` are the stored preferences; the returned `settings` are the ones to render with,
 * applied after the initial preview has been presented and detection settles. A value passed to `choose`
 * overrides the detection of that setting until another document opens; `undefined` returns to it. Where the detection
 * cannot decide (no merged image, no render, or both settings equally close), the stored preference applies.
 * `detected` names the settings currently taken from the detection.
 *
 * The detection renders with the settings and visibility current when the document opens; the worker keeps those
 * renders, so the first render of the document costs no extra composite.
 */
export function createBlendingDetection(
  client: PsdClient,
  opened: Accessor<PsdResultOf<OpenedPsd> | undefined>,
  settings: Accessor<PsdRenderSettings>,
  visibility: Accessor<[number, boolean][]>,
  ready: Accessor<boolean>
) {
  const detection = createMemo(() => {
    const document = opened();
    return document?.ok && ready()
      ? client.detectBlending(document.value.document, untrack(settings), untrack(visibility))
      : undefined;
  });
  const [chosen, setChosen] = createSignal<BlendingChoice>(() => {
    opened();
    return {};
  });
  const detected = createMemo(() => {
    const result = detection();
    const value = result?.ok ? result.value : undefined;
    const current = chosen();
    return {
      linearBlending: current.linearBlending === undefined ? (value?.linearBlending ?? null) : null,
      textGamma: current.textGamma === undefined ? (value?.textGamma ?? null) : null
    };
  });
  const effective = createMemo<PsdRenderSettings>(() => {
    const current = settings();
    const choice = chosen();
    const found = detected();
    const linearBlending = choice.linearBlending ?? found.linearBlending ?? current.linearBlending;
    const textGamma =
      choice.textGamma !== undefined
        ? choice.textGamma
        : found.textGamma === null
          ? current.textGamma
          : found.textGamma
            ? (current.textGamma ?? photoshopTextGamma)
            : null;
    return linearBlending === current.linearBlending && textGamma === current.textGamma
      ? current
      : { ...current, linearBlending, textGamma };
  });

  /** Overrides the detection of the settings `patch` names for the open document; `undefined` fields return to it. */
  function choose(patch: BlendingChoice) {
    setChosen((current) => ({ ...current, ...patch }));
  }

  const settled = () => ready() && !isPending(detection);

  return { settings: effective, detection, detected, choose, settled };
}

/** Explicit choices of the detected settings for the open document; an absent field follows the detection. */
export type BlendingChoice = { linearBlending?: boolean; textGamma?: number | null };

/** Photoshop's default "Blend Text Colors Using Gamma" value. */
const photoshopTextGamma = 1.45;
