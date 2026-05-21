const resolved = children(() => props.children);

type ResolvedJSXElement = number | boolean | Node | string | null | undefined;

function Example(props) {
  const content = children(() => props.children);

  return <div>{content()}</div>;
}