import { WebGlObjects } from '../webGlObjects/baseWebGlObject';
import { BaseCommand } from './baseCommand';

export class GetParameter extends BaseCommand {
  static readonly commandName = 'getParameter';

  protected get spiedCommandName(): string {
    return GetParameter.commandName;
  }

  protected stringifyResult(result: any): string {
    if (!result) {
      return 'null';
    }

    const tag = WebGlObjects.getWebGlObjectTag(result);
    if (tag) {
      return tag.displayText;
    }

    return result;
  }
}
