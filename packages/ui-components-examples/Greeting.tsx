export default function Greeting(props: { greeting?: string, name?: string }) {

  console.log(`Greeting rebuild?`, props);

  return <h3>{props.greeting || "Hi"} {props.name || "John"}</h3>
}