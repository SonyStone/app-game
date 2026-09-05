import { describe, expect, it } from 'vitest';
import { CommandCaptureStatus, type ICommandCapture } from '../shared/capture/commandCapture';
import {
  capturedValueMatches,
  createVisualCheckpoints,
  filterCommands,
  normalizeVisualState,
  readShaderProgram
} from './capture-model';

describe('Solid capture model', () => {
  it('filters commands by name, marker, and log text', () => {
    const commands = [
      command({ id: 1, name: 'drawArrays', marker: 'shadow' }),
      command({ id: 2, name: 'LOG', text: 'opaque pass' })
    ];

    expect(filterCommands(commands, 'draw')).toEqual([commands[0]]);
    expect(filterCommands(commands, 'shadow')).toEqual([commands[0]]);
    expect(filterCommands(commands, 'opaque')).toEqual([commands[1]]);
    expect(filterCommands(commands, 'dr')).toEqual(commands);
  });

  it('builds ordered visual checkpoints and normalizes framebuffer attachments', () => {
    const initialVisualState = {
      Attachments: [{ src: 'data:image/png;base64,initial', attachmentName: 'COLOR_ATTACHMENT0' }]
    };
    const drawVisualState = {
      FrameBuffer: { __SPECTOR_Object_TAG: { id: 4, displayText: 'WebGLFramebuffer - ID: 4' } },
      Attachments: [{ src: 'data:image/png;base64,draw' }]
    };
    const commands = [
      command({ id: 1, name: 'clear' }),
      command({ id: 2, name: 'drawArrays', VisualState: drawVisualState })
    ];

    const checkpoints = createVisualCheckpoints({ VisualState: initialVisualState }, commands);

    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[1]?.commandIndex).toBe(1);
    expect(normalizeVisualState(checkpoints[1]?.state).framebufferLabel).toBe('WebGLFramebuffer - ID: 4');
  });

  it('extracts shader programs from draw-call commands', () => {
    const shaderCommand = command({
      id: 8,
      name: 'drawElements',
      DrawCall: {
        shaders: [
          { name: 'Vertex', source: 'void main() {}', translatedSource: 'vertex translated' },
          { name: 'Fragment', source: 'void main() {}', translatedSource: 'fragment translated' }
        ],
        programStatus: {
          RECOMPILABLE: true,
          program: { __SPECTOR_Object_TAG: { id: 12 } }
        }
      }
    });

    expect(readShaderProgram(shaderCommand)).toMatchObject({
      programId: 12,
      editable: true,
      vertex: { name: 'Vertex' },
      fragment: { name: 'Fragment' }
    });
  });

  it('searches nested captured state without looping over cycles', () => {
    const state: Record<string, unknown> = { blend: { enabled: true } };
    state.loop = state;

    expect(capturedValueMatches(state, 'enabled')).toBe(true);
    expect(capturedValueMatches(state, 'missing')).toBe(false);
  });
});

function command(overrides: Partial<ICommandCapture>): ICommandCapture {
  return {
    id: 0,
    startTime: 0,
    commandEndTime: 1,
    endTime: 1,
    name: 'viewport',
    commandArguments: emptyArguments(),
    result: undefined,
    stackTrace: [],
    status: CommandCaptureStatus.Valid,
    text: 'viewport: 0, 0, 640, 480',
    marker: '',
    ...overrides
  };
}

function emptyArguments(): IArguments {
  return arguments;
}
