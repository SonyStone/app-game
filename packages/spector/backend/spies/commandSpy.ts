import { createMethodInterceptor, type InterceptedMethod } from '@app-game/webgl-debug';
import { ICommandCapture } from '../../shared/capture/commandCapture';
import { Time } from '../../shared/utils/time';
import { MultiDrawArraysInstancedBaseInstanceWEBGL } from '../commands/MultiDrawArraysInstancedBaseInstanceWEBGL';
import { MultiDrawElementsInstancedBaseVertexBaseInstanceWEBGL } from '../commands/MultiDrawElementsInstancedBaseVertexBaseInstanceWEBGL';
import { BaseCommand } from '../commands/baseCommand';
import { BindAttribLocation } from '../commands/bindAttribLocation';
import { BlitFrameBuffer } from '../commands/blitFrameBuffer';
import { Clear } from '../commands/clear';
import { DefaultCommand } from '../commands/defaultCommand';
import { DisableVertexAttribArray } from '../commands/disableVertexAttribArray';
import { DrawArrays } from '../commands/drawArrays';
import { DrawArraysInstanced } from '../commands/drawArraysInstanced';
import { DrawArraysInstancedAngle } from '../commands/drawArraysInstancedAngle';
import { DrawElements } from '../commands/drawElements';
import { DrawElementsInstanced } from '../commands/drawElementsInstanced';
import { DrawElementsInstancedAngle } from '../commands/drawElementsInstancedAngle';
import { DrawRangeElements } from '../commands/drawRangeElements';
import { EnableVertexAttribArray } from '../commands/enableVertexAttribArray';
import { GetActiveAttrib } from '../commands/getActiveAttrib';
import { GetActiveUniform } from '../commands/getActiveUniform';
import { GetExtension } from '../commands/getExtension';
import { GetParameter } from '../commands/getParameter';
import { GetShaderPrecisionFormat } from '../commands/getShaderPrecisionFormat';
import { GetTransformFeedbackVarying } from '../commands/getTransformFeedbackVarying';
import { Scissor } from '../commands/scissor';
import { StencilFunc } from '../commands/stencilFunc';
import { StencilFuncSeparate } from '../commands/stencilFuncSeparate';
import { StencilMask } from '../commands/stencilMask';
import { StencilMaskSeparate } from '../commands/stencilMaskSeparate';
import { VertexAttribPointer } from '../commands/vertexAttribPointer';
import { Viewport } from '../commands/viewport';
import { IContextInformation } from '../types/contextInformation';
import { IFunctionInformation } from '../types/functionInformation';
import { OriginFunctionHelper } from '../utils/originFunctionHelper';

export type CommandSpyCallback = (command: CommandSpy, functionInformation: IFunctionInformation) => void;

export interface ICommandSpyOptions extends IContextInformation {
  readonly spiedCommandName: string;
  readonly spiedCommandRunningContext: any;
  readonly callback: CommandSpyCallback;
}

export class CommandSpy {
  private static customCommandsConstructors: { [commandName: string]: (options: IContextInformation) => BaseCommand };

  readonly spiedCommandName: string;

  private readonly spiedCommand: any;
  private readonly spiedCommandRunningContext: any;
  private readonly callback: CommandSpyCallback;
  private readonly commandOptions: IContextInformation;

  private command!: BaseCommand;
  private overloadedCommand: any;

  constructor(options: ICommandSpyOptions) {
    this.spiedCommandName = options.spiedCommandName;
    this.spiedCommandRunningContext = options.spiedCommandRunningContext;
    this.spiedCommand = this.spiedCommandRunningContext[this.spiedCommandName];
    OriginFunctionHelper.storeOriginFunction(this.spiedCommandRunningContext, this.spiedCommandName);
    this.callback = options.callback;

    this.commandOptions = {
      context: options.context,
      contextVersion: options.contextVersion,
      extensions: options.extensions,
      toggleCapture: options.toggleCapture
    };

    this.initCustomCommands();

    this.initCommand();
  }

  spy(): void {
    this.spiedCommandRunningContext[this.spiedCommandName] = this.overloadedCommand;
  }

  unSpy(): void {
    this.spiedCommandRunningContext[this.spiedCommandName] = this.spiedCommand;
  }

  createCapture(functionInformation: IFunctionInformation, commandCaptureId: number, marker: string): ICommandCapture {
    return this.command.createCapture(functionInformation, commandCaptureId, marker);
  }

  private initCommand(): void {
    // tslint:disable-next-line:prefer-conditional-expression
    if (CommandSpy.customCommandsConstructors[this.spiedCommandName]) {
      this.command = CommandSpy.customCommandsConstructors[this.spiedCommandName](this.commandOptions);
    } else {
      this.command = new DefaultCommand(this.commandOptions, this.spiedCommandName);
    }

    this.overloadedCommand = this.getSpy();
  }

  private getSpy(): any {
    const invokeOriginal: InterceptedMethod = (...arguments_: unknown[]) =>
      OriginFunctionHelper.executeOriginFunction(
        this.spiedCommandRunningContext,
        this.spiedCommandName,
        arguments_ as unknown as IArguments
      );

    return createMethodInterceptor(this.spiedCommandRunningContext, this.spiedCommandName, invokeOriginal, {
      now: () => Time.now,
      onCall: (call) => {
        if (call.status === 'threw') return;
        this.callback(this, {
          name: this.spiedCommandName,
          arguments: call.arguments as unknown as IArguments,
          result: call.result,
          startTime: call.startTime,
          endTime: call.endTime
        });
      }
    });
  }

  private initCustomCommands(): void {
    if (CommandSpy.customCommandsConstructors) {
      return;
    }

    CommandSpy.customCommandsConstructors = {
      [BindAttribLocation.commandName]: (options: IContextInformation) => new BindAttribLocation(options),
      [BlitFrameBuffer.commandName]: (options: IContextInformation) => new BlitFrameBuffer(options),
      [Clear.commandName]: (options: IContextInformation) => new Clear(options),
      [DisableVertexAttribArray.commandName]: (options: IContextInformation) => new DisableVertexAttribArray(options),
      [DrawArrays.commandName]: (options: IContextInformation) => new DrawArrays(options),
      [DrawArraysInstanced.commandName]: (options: IContextInformation) => new DrawArraysInstanced(options),
      [DrawArraysInstancedAngle.commandName]: (options: IContextInformation) => new DrawArraysInstancedAngle(options),
      [DrawElements.commandName]: (options: IContextInformation) => new DrawElements(options),
      [DrawElementsInstanced.commandName]: (options: IContextInformation) => new DrawElementsInstanced(options),
      [DrawElementsInstancedAngle.commandName]: (options: IContextInformation) =>
        new DrawElementsInstancedAngle(options),
      [DrawRangeElements.commandName]: (options: IContextInformation) => new DrawRangeElements(options),
      [GetActiveAttrib.commandName]: (options: IContextInformation) => new GetActiveAttrib(options),
      [GetActiveUniform.commandName]: (options: IContextInformation) => new GetActiveUniform(options),
      [GetExtension.commandName]: (options: IContextInformation) => new GetExtension(options),
      [GetParameter.commandName]: (options: IContextInformation) => new GetParameter(options),
      [GetShaderPrecisionFormat.commandName]: (options: IContextInformation) => new GetShaderPrecisionFormat(options),
      [GetTransformFeedbackVarying.commandName]: (options: IContextInformation) =>
        new GetTransformFeedbackVarying(options),
      [MultiDrawArraysInstancedBaseInstanceWEBGL.commandName]: (options: IContextInformation) =>
        new MultiDrawArraysInstancedBaseInstanceWEBGL(options),
      [MultiDrawElementsInstancedBaseVertexBaseInstanceWEBGL.commandName]: (options: IContextInformation) =>
        new MultiDrawElementsInstancedBaseVertexBaseInstanceWEBGL(options),
      [Scissor.commandName]: (options: IContextInformation) => new Scissor(options),
      [StencilMask.commandName]: (options: IContextInformation) => new StencilMask(options),
      [StencilMaskSeparate.commandName]: (options: IContextInformation) => new StencilMaskSeparate(options),
      [StencilFunc.commandName]: (options: IContextInformation) => new StencilFunc(options),
      [StencilFuncSeparate.commandName]: (options: IContextInformation) => new StencilFuncSeparate(options),
      [VertexAttribPointer.commandName]: (options: IContextInformation) => new VertexAttribPointer(options),
      [Viewport.commandName]: (options: IContextInformation) => new Viewport(options),
      [EnableVertexAttribArray.commandName]: (options: IContextInformation) => new EnableVertexAttribArray(options)
    };
  }
}
