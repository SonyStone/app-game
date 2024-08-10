import { For } from 'solid-js';

export const RadioSelect = (props: { options: { name: string; onSelect(): void }[] }) => {
  return (
    <fieldset>
      <legend>Select layer:</legend>

      <For each={props.options}>
        {({ name, onSelect }) => (
          <div class="flex gap-1">
            <input
              type="radio"
              id={name}
              name="layer"
              value={name}
              onChange={(e) => {
                onSelect();
              }}
            />
            <label for={name}>{name}</label>
          </div>
        )}
      </For>
    </fieldset>
  );
};
