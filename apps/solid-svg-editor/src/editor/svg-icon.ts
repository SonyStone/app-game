import type { ComponentProps } from '@solidjs/web';
import type { Component } from 'solid-js';

export type SvgIcon = Component<ComponentProps<'svg'>>;

export const decorativeIconProps = {
  'aria-hidden': 'true',
  focusable: 'false'
} as const;
