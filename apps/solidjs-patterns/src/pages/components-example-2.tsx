import { splitProps } from 'solid-js';

type InputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Input(props: InputProps): JSX.Element {
  // Split out 'label' — forward rest to <input>
  const [local, rest] = splitProps(props, ['label']);

  return (
    <div>
      {local.label && <label>{local.label}</label>}
      <input {...rest} />
    </div>
  );
}