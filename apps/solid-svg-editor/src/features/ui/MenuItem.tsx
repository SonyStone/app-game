import { Show, splitProps, type JSX } from "solid-js";

import type { SvgIcon } from "../../editor/svg-icon";
import { EditorIcon } from "./EditorIcon";

export function MenuButton(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { readonly icon?: SvgIcon }) {
  const [local, buttonProps] = splitProps(props, ["children", "disabled", "icon"]);

  return (
    <button
      {...buttonProps}
      class="flex min-h-7 cursor-pointer items-center gap-2 rounded border-0 bg-transparent px-2 py-0 text-[var(--text)] no-underline hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] [&.disabled]:opacity-[0.48]"
      classList={{ disabled: Boolean(local.disabled) }}
      disabled={local.disabled}
    >
      <Show when={local.icon}>{(Icon) => <EditorIcon icon={Icon()} />}</Show>
      {local.children}
    </button>
  );
}

export function MenuLink(props: JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { readonly icon?: SvgIcon }) {
  const [local, linkProps] = splitProps(props, ["children", "icon"]);

  return (
    <a
      {...linkProps}
      class="flex min-h-7 cursor-pointer items-center gap-2 rounded border-0 bg-transparent px-2 py-0 text-[var(--text)] no-underline hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] [&.disabled]:opacity-[0.48]"
    >
      <Show when={local.icon}>{(Icon) => <EditorIcon icon={Icon()} />}</Show>
      {local.children}
    </a>
  );
}

export function MenuLabel(props: JSX.LabelHTMLAttributes<HTMLLabelElement> & { readonly disabled?: boolean }) {
  const [local, labelProps] = splitProps(props, ["children", "disabled"]);

  return (
    <label
      {...labelProps}
      class="flex min-h-7 cursor-pointer items-center gap-2 rounded border-0 bg-transparent px-2 py-0 text-[var(--text)] no-underline hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] [&.disabled]:opacity-[0.48]"
      classList={{ disabled: Boolean(local.disabled) }}
    >
      {local.children}
    </label>
  );
}
