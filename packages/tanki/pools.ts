import { ObjectPoolFactory } from "@pixi-essentials/object-pool";
import { Point } from "pixi.js";

export const point = ObjectPoolFactory.build(Point);
point.reserve(1000);
point.startGC();
