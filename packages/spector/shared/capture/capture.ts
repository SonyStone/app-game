import { IAnalysis } from './analysis';
import { ICanvasCapture } from './canvasCapture';
import { ICommandCapture, State } from './commandCapture';
import { IContextCapture } from './contextCapture';

export interface ICapture {
  canvas: ICanvasCapture;
  context: IContextCapture;
  initState: State;
  commands: ICommandCapture[];
  endState: State;
  startTime: number;
  listenCommandsStartTime: number;
  listenCommandsEndTime: number;
  endTime: number;
  analyses: IAnalysis[];
  frameMemory: { [objectName: string]: number };
  memory: { [objectName: string]: { [second: number]: number } };
}
