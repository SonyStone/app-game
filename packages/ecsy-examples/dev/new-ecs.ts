import { Query } from '@packages/ecsy/query';

const VELOCITY = {
  factory() {
    return [0, 0];
  }
};

class Vector2 {
  x = 0;
  y = 0;

  reset() {
    this.x = this.y = 0;
  }
}

class Velocity extends Vector2 {}
class Position extends Vector2 {}

class Query {
  static from(values: any) {
    return new Query();
  }

  constructor() {}

  filter(): this {
    return this;
  }
}

export function newEcs() {
  const query = Query.from([Velocity, Position]).filter();
}
