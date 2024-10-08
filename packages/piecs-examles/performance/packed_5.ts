import { World, createEntitySystem } from '@packages/piecs';

export default function createPacked5(count: number) {
  const world = new World();

  const A = {
    id: world.createComponentId(),
    arr: new Uint32Array(count).fill(1)
  };
  const B = {
    id: world.createComponentId(),
    arr: new Uint32Array(count).fill(1)
  };
  const C = {
    id: world.createComponentId(),
    arr: new Uint32Array(count).fill(1)
  };
  const D = {
    id: world.createComponentId(),
    arr: new Uint32Array(count).fill(1)
  };
  const E = {
    id: world.createComponentId(),
    arr: new Uint32Array(count).fill(1)
  };

  const p = world.prefabricate([A, B, C, D, E]);

  world
    .registerSystem(
      createEntitySystem(
        function systemAp5(entities) {
          for (let i = 0, l = entities.length; i < l; i++) {
            A.arr[entities[i]] *= 2;
          }
        },
        (q) => q.prefabricated(p)
      )
    )
    .registerSystem(
      createEntitySystem(
        function systemBp5(entities) {
          for (let i = 0, l = entities.length; i < l; i++) {
            B.arr[entities[i]] *= 2;
          }
        },
        (q) => q.prefabricated(p)
      )
    )
    .registerSystem(
      createEntitySystem(
        function systemCp5(entities) {
          for (let i = 0, l = entities.length; i < l; i++) {
            C.arr[entities[i]] *= 2;
          }
        },
        (q) => q.prefabricated(p)
      )
    )
    .registerSystem(
      createEntitySystem(
        function systemDp5(entities) {
          for (let i = 0, l = entities.length; i < l; i++) {
            D.arr[entities[i]] *= 2;
          }
        },
        (q) => q.prefabricated(p)
      )
    )
    .registerSystem(
      createEntitySystem(
        function systemEp5(entities) {
          for (let i = 0, l = entities.length; i < l; i++) {
            E.arr[entities[i]] *= 2;
          }
        },
        (q) => q.prefabricated(p)
      )
    )
    .initialize();

  for (let i = 0; i < count; i++) {
    world.createEntity(p);
  }

  return function packed5() {
    world.update();
  };
}
