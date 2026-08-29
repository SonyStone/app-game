import { JSX } from '@solidjs/web/jsx-runtime';
import { Component, merge } from 'solid-js';
import { Ripple } from '../ripple/Ripple';
import s from './MatButton.module.scss';

export default function MatButton(
  props: Partial<{
    as: Component<JSX.ButtonHTMLAttributes<HTMLButtonElement>>;
    variant: 'contained' | 'outlined' | 'text';
    color: 'primary' | 'secondary';
  }> &
    JSX.ButtonHTMLAttributes<HTMLButtonElement>
): JSX.Element {
  const rest = merge(
    {
      as: (props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}></button>,
      color: 'primary',
      variant: 'contained',
      type: 'button'
    } as const,
    props
  );

  return (
    <rest.as class={s.button + ' ' + s[rest.color] + ' ' + s[rest.variant] + ' ' + (rest?.class ?? '')} {...rest}>
      {rest.children}
      <Ripple />
    </rest.as>
  );
}
