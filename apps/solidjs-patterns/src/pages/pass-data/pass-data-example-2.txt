function Component(props) {
  return <a ref={props.ref}>Link</a>;
}

<Component
  ref={(ref) => {
    ref.href = "https://solidjs.com";
  }}
/>;