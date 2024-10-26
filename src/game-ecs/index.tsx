import { World } from './World';

class Store {
  entities = [
    {
      props: {
        position: { x: 3, y: 3 },
        shape: 'box',
      },
    },
    {
      props: {
        position: { x: 3, y: 3 },
        shape: 'box',
      },
    },
  ];

  run() {
    for (const id in this.entities) {
      const entity = this.entities[id];
      entity.props.position;
    }
  }
}

// const Renderable = { ...Position, ...Shape }

interface Entity {
  [key: string]: any;
}

interface Point {
  x: number;
  y: number;
}

interface Position {
  position: Point;
}

interface Shape {
  shape: string;
}

export default function Main() {
  const entites: Entity = [
    {
      position: { x: 3, y: 3 },
    },
    {},
    {},
  ];

  const wd = new World({
    systems: [],
    entities: [
      {
        name: 'Human',
        props: {
          position: { x: 10, y: 10 },
        },
      },
      {
        name: 'Sheep',
        props: {
          position: { x: 1, y: 20 },
        },
      },
      {
        name: 'Plant',
        props: {
          position: { x: 3, y: 14 },
        },
      },
      {
        name: 'tree',
        props: {
          position: { x: 30, y: 10 },
        },
      },
    ],
  });

  return <></>;
}
