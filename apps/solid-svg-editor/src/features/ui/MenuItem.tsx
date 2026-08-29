import type { JSX } from '@solidjs/web';
import { Dynamic } from '@solidjs/web';
import { Show, omit } from 'solid-js';

import { decorativeIconProps, type SvgIcon } from '../../editor/svg-icon';

export function MenuButton(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { readonly icon?: SvgIcon }) {
  const buttonProps = omit(props, 'children', 'disabled', 'icon');

  return (
    <button
      {...buttonProps}
      class={[
        'flex min-h-7 cursor-pointer items-center gap-2 rounded border-0 bg-transparent px-2 py-0 text-[var(--text)] no-underline hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] [&.disabled]:opacity-[0.48]',
        { disabled: Boolean(props.disabled) }
      ]}
      disabled={props.disabled}
    >
      <Show when={props.icon}>{(Icon) => <Dynamic class="h-4 w-4" component={Icon()} {...decorativeIconProps} />}</Show>
      {props.children}
    </button>
  );
}

export function MenuLink(props: JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { readonly icon?: SvgIcon }) {
  const linkProps = omit(props, 'children', 'icon');

  return (
    <a
      {...linkProps}
      class="flex min-h-7 cursor-pointer items-center gap-2 rounded border-0 bg-transparent px-2 py-0 text-[var(--text)] no-underline hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] [&.disabled]:opacity-[0.48]"
    >
      <Show when={props.icon}>{(Icon) => <Dynamic component={Icon()} {...decorativeIconProps} />}</Show>
      {props.children}
    </a>
  );
}

export function MenuLabel(props: JSX.LabelHTMLAttributes<HTMLLabelElement> & { readonly disabled?: boolean }) {
  const labelProps = omit(props, 'children', 'disabled');

  return (
    <label
      {...labelProps}
      class={[
        'flex min-h-7 cursor-pointer items-center gap-2 rounded border-0 bg-transparent px-2 py-0 text-[var(--text)] no-underline hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] [&.disabled]:opacity-[0.48]',
        { disabled: Boolean(props.disabled) }
      ]}
    >
      {props.children}
    </label>
  );
}
