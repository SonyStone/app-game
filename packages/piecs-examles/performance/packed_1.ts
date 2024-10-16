import { World, createEntitySystem } from '@packages/piecs';

export default function createPacked1(count: number) {
  const world = new World();
  const A = {
    id: world.createComponentId(),
    arr: new Uint32Array(count).fill(1)
  };
  const B = world.createComponentId();
  const C = world.createComponentId();
  const D = world.createComponentId();
  const E = world.createComponentId();

  const p = world.prefabricate([A.id, B, C, D, E]);

  world
    .registerSystem(
      createEntitySystem(
        function systemAp1(entities) {
          for (let i = 0, l = entities.length; i < l; i++) {
            A.arr[entities[i]] *= 2;
          }
        },
        (q) => q.prefabricated(p)
      )
    )
    .initialize();

  for (let i = 0; i < count; i++) {
    world.createEntity(p);
  }

  return function packed1() {
    world.update();
  };
}
