// ✅ Internal component — inline props
function Avatar(props: { name: string; size?: number }): JSX.Element {
  return <img src={avatar(props.name)} width={props.size ?? 32} />;
}

// ✅ Exported component — separate type
export type ButtonProps = {
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  children: JSX.Element;
  onClick?: () => void;
};

export function Button(props: ButtonProps): JSX.Element {
  return (
    <button disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  );
}