import { fillArray } from "./utils/fill-array";

type ExecutionQueue = [(...args: any) => void, any[]];

export class World {
  matches: ((entity: any) => readonly [number, number, boolean] | undefined)[] =
    [];

  executionQueues: ExecutionQueue[] = [];
  swapQueues: ExecutionQueue[] = [];

  addEntity(entity: any) {
    for (const match of this.matches) {
      const matchData = match(entity);
      if (matchData) {
        const [systemIndex, argIndex, single] = matchData;
        const systemArgs = this.executionQueues[systemIndex][1];

        if (single) {
          systemArgs[argIndex] = entity;
        } else {
          systemArgs[argIndex].push(entity);
        }
      }
    }

    return this;
  }

  addSystem<T>(
    system: (...args: any) => void,
    systemMatchs: ((component: any) => boolean)[]
  ) {
    const systemArgs = fillArray<any>(system.length);
    const systemIndex = this.executionQueues.push([system, systemArgs]) - 1;
    for (let i = 0; i < systemMatchs.length; i++) {
      const systemMatch = systemMatchs[i];
      const argIndex = i;
      this.matches.push((entity: T) =>
        systemMatch(entity)
          ? ([systemIndex, argIndex, !!(systemMatch as any).single] as const)
          : undefined
      );
    }

    return this;
  }

  run() {
    this.swapQueues = [];
    while (this.executionQueues.length) {
      const [task, queue] = this.executionQueues.pop()!;
      task(...queue);
      this.swapQueues.push([task, queue]);
    }
    this.executionQueues = this.swapQueues;
  }
}

export const single = (fn: (...args: any) => boolean) => {
  (fn as any).single = true;
  return fn;
};

export const not = (prop: string) => (e: Object) => !e.hasOwnProperty(prop);

export const withProps =
  (...props: (string | ((e: Object) => boolean))[]) =>
  (e: Object) =>
    props.every((prop) =>
      typeof prop === "string" ? e.hasOwnProperty(prop) : prop(e)
    );

const TAG = Symbol("name");

export const tag = <T extends Object>(name: string, obj: T) => {
  return Object.assign(obj, {
    [TAG]: name,
  });
};

export const withSymbol = <T extends Object>(symbol: symbol, obj: T) => {
  return Object.assign(obj, {
    [symbol]: true,
  });
};

export const hasSymbol = (symbol: symbol) => (obj: Object) =>
  Reflect.has(obj, symbol);

export const containTag = (obj: any, name: string): boolean => {
  return obj[TAG] === name;
};
