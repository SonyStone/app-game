import {
  addComponent,
  defineComponent,
  hasComponent,
  registerComponent,
  registerComponents,
  removeComponent
} from './component';
import { TYPES_ENUM } from './constants';
import {
  addEntity,
  entityExists,
  flushRemovedEntities,
  getEntityComponents,
  removeEntity,
  resetGlobals,
  setDefaultSize,
  setRemovedRecycleThreshold
} from './entity';
import {
  Changed,
  Not,
  commitRemovals,
  defineQuery,
  enterQuery,
  exitQuery,
  removeQuery,
  resetChangedQuery
} from './query';
import { DESERIALIZE_MODE, defineDeserializer, defineSerializer } from './serialize';
import { parentArray } from './storage';
import { defineSystem } from './system';
import {
  createWorld,
  deleteWorld,
  enableManualEntityRecycling,
  getAllEntities,
  getWorldComponents,
  resetWorld
} from './world';

export const pipe =
  (...fns) =>
  (input) => {
    let tmp = input;
    for (let i = 0; i < fns.length; i++) {
      const fn = fns[i];
      tmp = fn(tmp);
    }
    return tmp;
  };

export const Types = TYPES_ENUM;

export {
  setDefaultSize,
  setRemovedRecycleThreshold,
  createWorld,
  resetWorld,
  deleteWorld,
  addEntity,
  removeEntity,
  entityExists,
  getWorldComponents,
  enableManualEntityRecycling,
  flushRemovedEntities,
  getAllEntities,
  registerComponent,
  registerComponents,
  defineComponent,
  addComponent,
  removeComponent,
  hasComponent,
  getEntityComponents,
  defineQuery,
  Changed,
  Not,
  enterQuery,
  exitQuery,
  commitRemovals,
  resetChangedQuery,
  removeQuery,
  defineSystem,
  defineSerializer,
  defineDeserializer,
  DESERIALIZE_MODE,
  parentArray,
  resetGlobals
};
