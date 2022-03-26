import { World } from './game/World';

export default function TestEcs() {
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
