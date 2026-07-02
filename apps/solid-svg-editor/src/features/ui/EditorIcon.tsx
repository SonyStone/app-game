import { decorativeIconProps, type SvgIcon } from "../../editor/svg-icon";

export function EditorIcon(props: { readonly icon: SvgIcon; readonly class?: string }) {
  const Icon = props.icon;

  return (
    <Icon
      {...decorativeIconProps}
      class={
        props.class
          ? `block shrink-0 ${props.class}`
          : "block h-4 w-4 shrink-0 [filter:brightness(0)_invert(92%)_sepia(10%)_saturate(778%)_hue-rotate(181deg)_brightness(102%)_contrast(95%)]"
      }
    />
  );
}
