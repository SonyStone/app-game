import { render } from '@solidjs/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ICapture } from '../shared/capture/capture';
import { CommandCaptureStatus } from '../shared/capture/commandCapture';
import type { ShaderEditor } from './shader-editor';
import { SpectorResultView } from './spector-result-view';

vi.mock('./shader-editor', () => ({
  ShaderEditor: (props: Parameters<typeof ShaderEditor>[0]) => (
    <button
      onClick={() =>
        void props.onCompile?.({ programId: props.program.programId, vertex: 'edited', fragment: 'fragment' })
      }
    >
      Compile {props.program.vertex.name}
    </button>
  )
}));

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

describe('capture-aware shader editing', () => {
  it('compiles against the selected history entry and closes stale editors when switching captures', async () => {
    const older = capture('older', 1);
    const newer = capture('newer', 2);
    const onCompile = vi.fn(async () => {});
    const host = document.createElement('div');
    document.body.append(host);
    dispose = render(() => <SpectorResultView captures={[newer, older]} onCompileProgram={onCompile} />, host);
    await nextTask();
    click('newer');
    await vi.waitFor(() => expect(find('Compile newer')).toBeDefined());
    click('Captures');
    await nextTask();
    host.querySelectorAll<HTMLElement>('[role="button"]')[1]?.click();
    await nextTask();
    expect(find('Compile newer')).toBeUndefined();
    click('older');
    await vi.waitFor(() => expect(find('Compile older')).toBeDefined());
    click('Compile older');
    expect(onCompile).toHaveBeenCalledWith({ programId: 1, vertex: 'edited', fragment: 'fragment' }, older);

    function find(text: string) {
      return [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === text);
    }
    function click(text: string) {
      const button = find(text);
      expect(button).toBeDefined();
      button!.click();
    }
  });
});

function capture(name: string, id: number): ICapture {
  return {
    canvas: { width: 1, height: 1, clientWidth: 1, clientHeight: 1, browserAgent: 'test' },
    context: { version: 2, contextAttributes: {}, capabilities: {}, extensions: {}, compressedTextures: {} },
    initState: {},
    endState: {},
    startTime: id * 1000,
    listenCommandsStartTime: 0,
    listenCommandsEndTime: 0,
    endTime: 0,
    analyses: [],
    frameMemory: {},
    memory: {},
    commands: [
      {
        id,
        startTime: 0,
        commandEndTime: 0,
        endTime: 0,
        name: 'drawElements',
        marker: '',
        commandArguments: [] as unknown as IArguments,
        result: undefined,
        stackTrace: [],
        status: CommandCaptureStatus.Valid,
        text: 'drawElements',
        DrawCall: {
          shaders: [
            { name, source: 'vertex' },
            { name: 'fragment', source: 'fragment' }
          ],
          programStatus: { RECOMPILABLE: true, program: { __SPECTOR_Object_TAG: { id } } }
        }
      }
    ]
  };
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
