<Button as="a" href="/docs">
  Docs
</Button>;

function Button(props) {
  const [local, others] = splitProps(props, ["as"]);

  return <Dynamic component={local.as ?? "button"} {...others} />;
}