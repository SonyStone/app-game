import type { JSX } from '@solidjs/web';
import { Dynamic } from '@solidjs/web';
import { Show, omit } from 'solid-js';

import { decorativeIconProps, type SvgIcon } from '../../editor/svg-icon';

export function PanelButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { readonly icon?: SvgIcon; readonly variant?: 'primary' }
) {
  const buttonProps = omit(props, 'children', 'icon', 'variant');

  return (
    <button
      {...buttonProps}
      class={[
        'inline-flex min-h-6.5 cursor-pointer items-center justify-center gap-1.5 rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] px-2.5 py-0 text-[var(--text)] hover:border-[var(--accent)]',
        {
          'primary-action': props.variant === 'primary',
          '!border-[color-mix(in_srgb,var(--accent)_52%,var(--soft-border))]': props.variant === 'primary'
        }
      ]}
    >
      <Show when={props.icon}>{(Icon) => <Dynamic component={Icon()} {...decorativeIconProps} />}</Show>
      {props.children}
    </button>
  );
}
