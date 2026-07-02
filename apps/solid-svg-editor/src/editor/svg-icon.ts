import type { Component, ComponentProps } from "solid-js";

export type SvgIcon = Component<ComponentProps<"svg">>;

export const decorativeIconProps = {
  "aria-hidden": "true",
  focusable: "false"
} as const;
