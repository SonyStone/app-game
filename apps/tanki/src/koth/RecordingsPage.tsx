import { createSignal, For } from 'solid-js';
import { useKothI18n } from './i18n/i18n';
import { listRecordings, loadRecording, readRecordingFile, type OpenResult, type SavedRecording } from './openRecording';
import './poster.css';
import { Section } from './PosterParts';
import { RECORDING_EXTENSION } from './recordingFile';

/**
 * The pause menu's page of recordings, to watch one: the match being played, from its start; the
 * recordings saved on the dev server, newest first; and a file from the disk, as a tester's.
 * A file dropped onto the game opens too (see `KothRoute`).
 *
 * @param onOpen - Receives a recording opened, and whether it is one of the dev server's folder,
 *   which its name opens again.
 * @param onWatchThis - Called to watch the match being played.
 */
export function RecordingsPage(props: { onOpen: (opened: Extract<OpenResult, { kind: 'opened' }>, saved: boolean) => void; onWatchThis: () => void }) {
  const { t } = useKothI18n();
  const [saved, setSaved] = createSignal<SavedRecording[]>();
  const [status, setStatus] = createSignal<string>();
  let input: HTMLInputElement | undefined;

  listRecordings().then(setSaved);

  return (
    <div class="flex flex-col gap-[7px] px-[18px] pt-3.5 pb-4">
      <Section number="01" title={t('menu.match')} />
      <button class="tk-action tk-primary" onClick={() => props.onWatchThis()}>
        <span class="tk-action-text">
          <span class="tk-action-label">{t('replay.watch')}</span>
          <span class="tk-action-hint">{t('replay.watchHint')}</span>
        </span>
      </button>
      <Section number="02" title={t('replay.recordings')}>
        <button class="tk-small-button" onClick={() => input?.click()}>
          {t('replay.fromFile')}
        </button>
      </Section>
      <input
        ref={(element) => (input = element)}
        type="file"
        accept={`${RECORDING_EXTENSION},.json`}
        class="hidden"
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';

          if (file) {
            open(await readRecordingFile(file), false);
          }
        }}
      />
      <div class="tk-recordings">
        <For each={saved() ?? []} fallback={<div class="tk-note px-1.5 py-1">{import.meta.env.DEV ? t('replay.none') : t('replay.dropHint')}</div>}>
          {(recording) => (
            <button
              class="tk-recording"
              onClick={async () => {
                setStatus(t('replay.opening'));
                open(await loadRecording(recording.name), true);
              }}
            >
              <span>{recording.name.slice(0, -RECORDING_EXTENSION.length)}</span>
              <span class="tk-note">{Math.round(recording.size / 1024)} KB</span>
            </button>
          )}
        </For>
      </div>
      <div class="tk-note">{status() ?? t('replay.dropHint')}</div>
    </div>
  );

  function open(result: OpenResult, fromFolder: boolean) {
    if (result.kind === 'opened') {
      props.onOpen(result, fromFolder);
    } else {
      setStatus(t('replay.failed', result.reason));
    }
  }
}
