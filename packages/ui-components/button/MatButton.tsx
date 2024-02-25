import { JSX } from 'solid-js/jsx-runtime';
import { Ripple } from '../ripple/Ripple';
import s from './MatButton.module.scss';

interface Props extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'contained' | 'outlined' | 'text';
  color?: 'primary' | 'secondary';
}

export default function MatButton({
  children,
  color = 'primary',
  variant = 'contained',
  type = 'button',
  ...props
}: Props): JSX.Element {
  return (
    <button class={s.button + ' ' + s[color] + ' ' + s[variant] + ' ' + (props?.class ?? '')} type={type} {...props}>
      {children}
      <Ripple></Ripple>
    </button>
  );
}
