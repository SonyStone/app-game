import { expect, it, vi } from 'vitest';
import { App, noResourcesError } from './app';
import { Startup, Update } from './schedules';

it('should add system', () => {
  const app = new App();

  const system = vi.fn(() => 0);

  app.addSystems(Startup, system);
  app.update();
  expect(system).toHaveBeenCalled();
});

it.todo('should remove system', () => {
  const app = new App();
});

it.todo('should add resource', () => {
  class Resource {
    value = 0;
  }

  const app = new App();
  app.initResource(Resource);
  const resource = app.world.resources(Resource);

  expect(resource).toBeTruthy();
});

it.todo('should update resource', () => {
  class Resource {
    value = 0;
  }

  const system = vi.fn((resource: Resource) => (resource.value += 1));

  const app = new App();
  app.initResource(Resource);
  app.addSystems(Update, system);
  app.update();

  const resource = app.world.resources(Resource);

  expect(system).toHaveBeenCalled();
  expect(resource.value).toBe(1);
});

it.todo('should remove resource', () => {
  const app = new App();
});

it.todo('should add entity', () => {});

it('should throw exeption', () => {
  class Value {
    v = 0;
  }

  const app = new App();

  expect(() => app.world.resources(Value)).toThrowError(
    noResourcesError(Value)
  );
});
