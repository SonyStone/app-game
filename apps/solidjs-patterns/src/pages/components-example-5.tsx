import { type Component, type JSX } from 'solid-js';

type ListProps<T> = {
  items: T[];
  renderItem: (item: T, index: () => number) => JSX.Element;
  fallback?: JSX.Element;
};

function List<T>(props: ListProps<T>): JSX.Element {
  return (
    <For each={props.items} fallback={props.fallback ?? <p>No items</p>}>
      {props.renderItem}
    </For>
  );
}

// Usage
<List
  items={users}
  renderItem={(user) => <UserCard name={user.name} />}
/>