import { App } from './app';
import { Update } from './schedules';

export function frameCountPlugin(app: App) {
  app.initResource(FrameCount);
  app.addSystems(Update, updateFrameCount);
}

export class FrameCount {
  frameCount = 0;
}

export function updateFrameCount(frameCount: FrameCount) {
  frameCount.frameCount = frameCount.frameCount + 1;
}
