import { Graphics } from "pixi.js";

export const createEllipse = () =>
  new Graphics().beginFill(0x778679).drawEllipse(0, 0, 640, 640).endFill();
