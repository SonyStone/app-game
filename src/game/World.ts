abstract class System<T> {}

export default class RenderableSystem extends System<typeof Renderable> {}

function f() {
  return { x: 10, y: 3 };
}
type P = ReturnType<typeof f>;

// const Position = { x: 10, y: 10 }
const Position = {
  position: {
    x: 10,
    y: 10,
  },
};
const Shape = {
  shape: {},
};

const Renderable = { ...Position, ...Shape };

console.log(`Renderable`, Renderable);

interface WorldData {
  systems: any[];
  entities: any[];
}

export class World {
  constructor(options: WorldData) {}

  run() {
    // for (const id in this.entities) {
    //   const entity = this.entities[id];
    //   entity.props.position
    // }
  }
}
