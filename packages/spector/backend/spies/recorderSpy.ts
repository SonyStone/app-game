import { ICapture } from '../../shared/capture/capture';
import { IRecorder } from '../recorders/baseRecorder';
import { BufferRecorder } from '../recorders/bufferRecorder';
import { ProgramRecorder } from '../recorders/programRecorder';
import { RenderBufferRecorder } from '../recorders/renderBufferRecorder';
import { Texture2DRecorder } from '../recorders/texture2DRecorder';
import { Texture3DRecorder } from '../recorders/texture3DRecorder';
import { IContextInformation } from '../types/contextInformation';
import { FunctionCallbacks, IFunctionInformation } from '../types/functionInformation';

export class RecorderSpy {
  private readonly recorders: IRecorder[];
  private readonly onCommandCallbacks: FunctionCallbacks;

  constructor(readonly contextInformation: IContextInformation) {
    this.onCommandCallbacks = {};
    this.recorders = [];
    this.initRecorders();
  }

  recordCommand(functionInformation: IFunctionInformation): void {
    const callbacks = this.onCommandCallbacks[functionInformation.name];
    if (callbacks) {
      for (const callback of callbacks) {
        callback(functionInformation);
      }
    }
  }

  startCapture(): void {
    for (const recorder of this.recorders) {
      recorder.startCapture();
    }
  }

  stopCapture(): void {
    for (const recorder of this.recorders) {
      recorder.stopCapture();
    }
  }

  appendRecordedInformation(capture: ICapture): void {
    for (const recorder of this.recorders) {
      recorder.appendRecordedInformation(capture);
    }
  }

  private initRecorders(): void {
    this.recorders.push(
      new BufferRecorder(this.contextInformation),
      new RenderBufferRecorder(this.contextInformation),
      new Texture2DRecorder(this.contextInformation),
      new Texture3DRecorder(this.contextInformation),
      new ProgramRecorder(this.contextInformation)
    );

    for (const recorder of this.recorders) {
      recorder.registerCallbacks(this.onCommandCallbacks);
    }
  }
}
