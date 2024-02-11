import { afterEach, describe, expect, it } from 'vitest';
import {
  Entity,
  addEntity,
  flushRemovedEntities,
  getEntityCursor,
  getRemovedEntities,
  removeEntity,
  resetGlobals,
  setRemovedRecycleThreshold
} from './entity';
import { createWorld, enableManualEntityRecycling } from './world';

describe('Entity Integration Tests', () => {
  afterEach(() => {
    resetGlobals();
  });
  it('should add and remove entities', () => {
    const world = createWorld();

    const eid1 = addEntity(world);
    expect(getEntityCursor()).toBe(1);

    const eid2 = addEntity(world);
    expect(getEntityCursor()).toBe(2);

    const eid3 = addEntity(world);
    expect(getEntityCursor()).toBe(3);

    expect(eid1).toBe(0);
    expect(eid2).toBe(1);
    expect(eid3).toBe(2);

    removeEntity(world, eid1);
    removeEntity(world, eid2);
    removeEntity(world, eid3);

    const removed = getRemovedEntities();

    debugger;

    expect(removed.length).toBe(3);
    expect(removed[0]).toBe(0);
    expect(removed[1]).toBe(1);
    expect(removed[2]).toBe(2);
  });
  it('should recycle entity IDs after 1% have been removed by default', () => {
    const world = createWorld();
    const ents = [];

    for (let i = 0; i < 1500; i++) {
      const eid = addEntity(world);
      ents.push(eid);
      expect(getEntityCursor()).toBe(eid + 1);
      expect(eid).toBe(i);
    }

    expect(getEntityCursor()).toBe(1500);

    for (let i = 0; i < 1000; i++) {
      const eid = ents[i];
      removeEntity(world, eid);
    }

    let eid = addEntity(world);
    expect(eid).toBe(1500);

    eid = addEntity(world);
    expect(eid).toBe(1501);

    eid = addEntity(world);
    expect(eid).toBe(1502);

    eid = addEntity(world);
    expect(eid).toBe(1503);

    removeEntity(world, eid);

    eid = addEntity(world);
    expect(eid).toBe(0);
  });
  it('should flush entity IDs', () => {
    const world = createWorld();
    enableManualEntityRecycling(world);
    const ents = [];

    for (let i = 0; i < 1500; i++) {
      const eid = addEntity(world);
      ents.push(eid);
      expect(getEntityCursor()).toBe(eid + 1);
      expect(eid).toBe(i);
    }

    expect(getEntityCursor()).toBe(1500);

    // remove more than 1%
    for (let i = 0; i < 1500; i++) {
      const eid = ents[i];
      removeEntity(world, eid);
    }

    // flush removed ents, making them available again
    flushRemovedEntities(world);

    let eid = addEntity(world);
    expect(eid).toBe(0);

    eid = addEntity(world);
    expect(eid).toBe(1);

    eid = addEntity(world);
    expect(eid).toBe(2);

    eid = addEntity(world);
    expect(eid).toBe(3);

    removeEntity(world, 3 as Entity);

    eid = addEntity(world);
    expect(eid).toBe(4);

    removeEntity(world, 2 as Entity);

    eid = addEntity(world);
    expect(eid).toBe(5);
  });
  it('should be able to configure % of removed entity IDs before recycle', () => {
    const world = createWorld();

    setRemovedRecycleThreshold(0.012);

    for (let i = 0; i < 1500; i++) {
      const eid = addEntity(world);
      expect(getEntityCursor()).toBe(eid + 1);
      expect(eid).toBe(i);
    }

    expect(getEntityCursor()).toBe(1500);

    for (let i = 0 as Entity; i < 1200; i++) {
      removeEntity(world, i);
    }

    let eid = addEntity(world);
    expect(eid).toBe(1500);

    eid = addEntity(world);
    expect(eid).toBe(1501);

    eid = addEntity(world);
    expect(eid).toBe(1502);

    eid = addEntity(world);
    expect(eid).toBe(1503);

    removeEntity(world, eid);

    eid = addEntity(world);
    expect(eid).toBe(0);
  });
});
