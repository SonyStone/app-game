import { IAnalysis } from '../../shared/capture/analysis';
import { ICapture } from '../../shared/capture/capture';
import { IContextInformation } from '../types/contextInformation';

export abstract class BaseAnalyser {
  protected abstract get analyserName(): string;

  constructor(protected readonly options: IContextInformation) {}

  appendAnalysis(capture: ICapture): void {
    capture.analyses = capture.analyses || [];
    const analysis = this.getAnalysis(capture);
    capture.analyses.push(analysis);
  }

  getAnalysis(capture: ICapture): IAnalysis {
    const analysis: IAnalysis = {
      analyserName: this.analyserName
    };
    this.appendToAnalysis(capture, analysis);
    return analysis;
  }

  protected abstract appendToAnalysis(capture: ICapture, analysis: IAnalysis): void;
}
