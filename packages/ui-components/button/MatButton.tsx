import { Component, mergeProps } from 'solid-js';
import { JSX } from 'solid-js/jsx-runtime';
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
  const rest = mergeProps(
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
