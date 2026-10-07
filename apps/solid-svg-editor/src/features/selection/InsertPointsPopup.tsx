import { onSettled } from 'solid-js';

import { useI18n } from '../../i18n/I18nProvider';

/** GodSVG's "Insert multiple after" prompt: how many points to insert (1–999, default 2); Enter confirms, Escape cancels. */
export function InsertPointsPopup(props: { readonly insert: (count: number) => void; readonly cancel: () => void }) {
  const { t } = useI18n();
  let input: HTMLInputElement | undefined;

  onSettled(() => {
    input?.focus();
    input?.select();
  });

  const commit = () => {
    const count = Math.round(Number(input?.value));

    if (Number.isFinite(count) && count >= 1) {
      props.insert(Math.min(999, count));
    } else {
      props.cancel();
    }
  };

  return (
    <label class="flex items-center gap-1.5 text-[11px]" data-testid="insert-points-popup">
      {t('Points to insert')}:
      <input
        ref={(element) => (input = element)}
        type="number"
        min="1"
        max="999"
        value="2"
        class="h-5.5 w-14 rounded border border-[var(--soft-border)] bg-[#080b12] px-1 in-[.theme-light]:bg-[#f8fbff]"
        data-testid="insert-points-count"
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            props.cancel();
          }
        }}
      />
    </label>
  );
}
