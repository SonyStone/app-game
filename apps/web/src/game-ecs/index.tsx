import { For } from 'solid-js';

import { World } from './World';

/** Shows the entities currently represented by the unfinished ECS prototype. */
export default function Main() {
  const entities = [
    { name: 'Human', position: { x: 10, y: 10 } },
    { name: 'Sheep', position: { x: 1, y: 20 } },
    { name: 'Plant', position: { x: 3, y: 14 } },
    { name: 'Tree', position: { x: 30, y: 10 } }
  ];

  new World({
    systems: [],
    entities: entities.map(({ name, position }) => ({ name, props: { position } }))
  });

  return (
    <main class="p-6">
      <h1 class="mb-2 text-2xl font-bold">Game ECS</h1>
      <p class="mb-4">Work in progress: the prototype world currently contains these entities.</p>
      <ul class="list-disc pl-6">
        <For each={entities}>
          {(entity) => (
            <li>
              {entity.name}: ({entity.position.x}, {entity.position.y})
            </li>
          )}
        </For>
      </ul>
    </main>
  );
}
