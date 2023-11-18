import { Last, Schedule, ScheduleLabel, Startup, Update } from './schedules';
import { Constructor, System } from './types';

interface Entity {}
interface ComponentInfo {}

class Components {
  components: ComponentInfo[] = [];
  indices = new Map<Constructor<any>, number>();
  resourceIndices = new Map<Constructor<any>, number>();

  getResourceId(resource: Constructor<any>) {
    return this.resourceIndices.get(resource);
  }
}

export class World {
  entities: Entity[] = [];
  components = new Components();
  tables = [];

  resources: { [key: string | symbol]: any } = {
    commands: Commands,
  };

  schedules = {
    [Startup]: new Schedule(),
    [Update]: new Schedule(),
    [Last]: new Schedule(),
  };

  spawn(...value: any[]) {}
}

/**
 * A {@link Command} queue to perform impactful changes to the {@link World}.
 */
export class Commands {
  spawn(...value: any[]) {}

  insertResource(key: Symbol | string, resource: any) {}
}

export function inSet(set: any, ...systems: System[]): System[] {
  return systems;
}

export class App {
  world = new World();

  addPlugins(): this {
    return this;
  }

  addPlugin(plugin: (app: App) => void): this {
    plugin(this);
    return this;
  }

  addSystems(schedule: ScheduleLabel, ...systems: System[] | System[][]): this {
    for (const system of systems.flat()) {
      this.world.schedules[schedule].addSystem(system);
    }
    return this;
  }

  configureSets(schedule: ScheduleLabel, ...sets: any[]): this {
    this.world.schedules[schedule];

    return this;
  }

  initResource<T extends object>(resources: T): this {
    this.world.resources = Object.assign(this.world.resources, resources);
    return this;
  }

  setRunner(fn: any) {}

  run(): void {}

  update(): void {
    this.world.schedules[Update].run();
    this.world.schedules[Last].run();
  }
}

export function corePlugins(app: App) {
  // app.addPlugin()
}

export function defaultPlugins(app: App) {
  // app.addPlugin();
}

export function noResourcesError(
  resource: Constructor<any> | Symbol | string | Function
) {
  return new Error(
    `Requested resource ${resource} does not exist in the "World". ` +
      `Did you forget to add it using "app.insertResource" / "app.initResource"? ` +
      `Resources are also implicitly added via "app.addEvent", ` +
      `and can be added by plugins.`
  );
}
