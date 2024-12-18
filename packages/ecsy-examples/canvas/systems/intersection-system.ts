import { Entity, ObjectPool, Read, System, SystemData } from '@packages/ecsy';

import { Circle, Intersecting, Position } from '../components';
import { Intersection } from '../utils';

export class IntersectionSystem implements System {
  intersectionPool = new ObjectPool<Intersection>(Intersection);

  run(entities: [Circle, Position, Entity, Intersecting][]) {
    for (let i = 0; i < entities.length; i++) {
      const circle = entities[i][0];
      const position = entities[i][1];
      const entity = entities[i][2];

      if (entity.hasComponent(Intersecting)) {
        const intersecting = entity.getComponent(Intersecting);
        while (intersecting.points.length > 0) {
          const point = intersecting.points.pop()!;
          this.intersectionPool.release(point);
        }
      }

      for (let j = i + 1; j < entities.length; j++) {
        const circleB = entities[j][0];
        const positionB = entities[j][1];

        const intersection = this.intersectionPool.aquire();
        const intersect = intersection.intersect(circle, position, circleB, positionB);

        if (intersect !== false) {
          let intersectComponent: Intersecting;
          if (!entity.hasComponent(Intersecting)) {
            entity.addComponent(Intersecting);
          }
          intersectComponent = entity.getMutableComponent(Intersecting);
          intersectComponent.points.push(intersect);
        } else {
          this.intersectionPool.release(intersection);
        }
      }

      if (entity.hasComponent(Intersecting) && entity.getComponent(Intersecting).points.length === 0) {
        entity.removeComponent(Intersecting);
      }
    }
  }

  stop() {
    // super.stop();
    // Clean up interesection when stopping
    // const entities = this.queries.entities.results;
    // for (const entity of entities) {
    //   if (entity.hasComponent(Intersecting)) {
    //     entity.getMutableComponent(Intersecting).points.length = 0;
    //   }
    // }
  }
}

SystemData(IntersectionSystem, [Read(Circle), Read(Position), Read(Entity)]);
