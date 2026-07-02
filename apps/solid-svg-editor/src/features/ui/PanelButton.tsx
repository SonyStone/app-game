import { Show, splitProps, type JSX } from "solid-js";

import type { SvgIcon } from "../../editor/svg-icon";
import { EditorIcon } from "./EditorIcon";

export function PanelButton(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { readonly icon?: SvgIcon; readonly variant?: "primary" }) {
  const [local, buttonProps] = splitProps(props, ["children", "icon", "variant"]);

  return (
    <button
      {...buttonProps}
      class="inline-flex min-h-6.5 cursor-pointer items-center justify-center gap-1.5 rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] px-2.5 py-0 text-[var(--text)] hover:border-[var(--accent)]"
      classList={{
        "primary-action": local.variant === "primary",
        "!border-[color-mix(in_srgb,var(--accent)_52%,var(--soft-border))]": local.variant === "primary"
      }}
    >
      <Show when={local.icon}>{(Icon) => <EditorIcon icon={Icon()} />}</Show>
      {local.children}
    </button>
  );
}
