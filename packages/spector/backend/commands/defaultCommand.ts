import { CommandCaptureStatus, ICommandCapture } from '../../shared/capture/commandCapture';
import { IContextInformation } from '../types/contextInformation';
import { BaseCommand } from './baseCommand';

const deprecatedCommands = ['lineWidth'];

export class DefaultCommand extends BaseCommand {
  protected get spiedCommandName(): string {
    return this.internalSpiedCommandName;
  }

  private readonly isDeprecated: boolean;
  private readonly internalSpiedCommandName: string;

  constructor(options: IContextInformation, commandName: string) {
    super(options);

    this.internalSpiedCommandName = commandName;
    this.isDeprecated = deprecatedCommands.indexOf(this.spiedCommandName) > -1;
  }

  transformCapture(commandCapture: ICommandCapture): void {
    if (this.isDeprecated) {
      commandCapture.status = CommandCaptureStatus.Deprecated;
    }
  }
}
