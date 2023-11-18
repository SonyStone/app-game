import { System } from './types';

export type ScheduleLabel = symbol;

export const Startup: ScheduleLabel = Symbol('startup');
export const Update: ScheduleLabel = Symbol('Update');
export const Last: ScheduleLabel = Symbol('Last');

export class Schedule {
  private systems: System[] = [];

  addSystem(system: System, systemMatchs?: any[]) {
    this.systems.push(system);
    return this;
  }

  run() {
    for (let index = 0; index < this.systems.length; index++) {
      this.systems[index]();
    }
  }
}
