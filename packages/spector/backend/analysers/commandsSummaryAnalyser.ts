import { IAnalysis } from '../../shared/capture/analysis';
import { ICapture } from '../../shared/capture/capture';
import { drawCommands } from '../utils/drawCommands';
import { BaseAnalyser } from './baseAnalyser';

export class CommandsSummaryAnalyser extends BaseAnalyser {
  static readonly analyserName = 'CommandsSummary';

  protected get analyserName(): string {
    return CommandsSummaryAnalyser.analyserName;
  }

  protected appendToAnalysis(capture: ICapture, analysis: IAnalysis): void {
    if (!capture.commands) {
      return;
    }

    analysis.total = capture.commands.length;
    analysis.draw = 0;
    analysis.clear = 0;

    for (const command of capture.commands) {
      if (command.name === 'clear') {
        analysis.clear++;
      } else if (drawCommands.indexOf(command.name) > -1) {
        analysis.draw++;
      }
    }
  }
}
