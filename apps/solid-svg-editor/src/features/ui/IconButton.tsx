import { Dynamic } from '@solidjs/web';

import { decorativeIconProps, type SvgIcon } from '../../editor/svg-icon';

export function IconButton(props: {
  readonly icon: SvgIcon;
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly active?: boolean;
  readonly testId?: string;
}) {
  return (
    <button
      type="button"
      class={[
        'icon-button inline-grid h-6.5 w-6.5 cursor-pointer place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] p-0 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,var(--panel-2))] disabled:cursor-default disabled:opacity-[0.42] [&.active]:border-[var(--accent)] [&.active]:bg-[color-mix(in_srgb,var(--accent)_22%,var(--panel-2))]',
        { active: Boolean(props.active) }
      ]}
      data-testid={props.testId}
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Dynamic component={props.icon} {...decorativeIconProps} />
    </button>
  );
}
