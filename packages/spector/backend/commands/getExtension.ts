import { BaseCommand } from './baseCommand';

export class GetExtension extends BaseCommand {
  static readonly commandName = 'getExtension';

  protected get spiedCommandName(): string {
    return GetExtension.commandName;
  }

  protected stringifyResult(result: any): string {
    return result ? 'true' : 'false';
  }
}
