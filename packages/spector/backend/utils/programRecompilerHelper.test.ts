import { describe, expect, it, vi } from 'vitest';
import { ProgramRecompilerHelper } from './programRecompilerHelper';

describe('program recompilation completion', () => {
  it('reports unsupported programs instead of leaving callers waiting', () => {
    const onError = vi.fn();
    const onCompiled = vi.fn();
    ProgramRecompilerHelper.rebuildProgram({} as WebGLProgram, '', '', onCompiled, onError);
    expect(onError).toHaveBeenCalledWith('This program does not support live shader recompilation.');
    expect(onCompiled).not.toHaveBeenCalled();
  });
});
