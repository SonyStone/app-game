import { describe, expect, it } from 'vitest';
import { brushToFormValues } from '../src/features/brush-detail/brush-form-schema';
import { previewAppearance } from '../src/features/brush-detail/preview-appearance';

const preset = () =>
  brushToFormValues({
    name: 'Saved colored Multiply brush',
    settings: {
      toolOptions: { __classId: 'PbTl', 'Md  ': { type: 'BlnM', value: 'Mltp' } }
    }
  });

describe('library appearance without altering the preset', () => {
  it('makes Multiply thumbnails visible without replacing the interactive paint mode or colors', () => {
    const values = preset();
    values.tool.foreground = '#e36b21';
    values.tool.background = '#123456';
    const thumbnail = previewAppearance(values, { thumbnail: true });
    expect(thumbnail.values.tool.mode).toBe('Nrml');
    expect(thumbnail.color).toBe('#ffffff');
    expect(thumbnail.secondaryColor).toBe('#ffffff');
    const interactive = previewAppearance(values, { brushColor: '#dedede' });
    expect(interactive.values.tool.mode).toBe('Mltp');
    expect(interactive.color).toBe('#e36b21');
    expect(interactive.secondaryColor).toBe('#123456');
    expect(interactive.values).toBe(values);
  });
  it('retains retouch/eraser settings and uses white only as the unsaved color fallback', () => {
    const values = preset();
    values.tool.type = 'SmTl';
    values.tool.mode = 'Drkn';
    expect(previewAppearance(values, { thumbnail: true }).values).toBe(values);
    expect(previewAppearance(values, {}).color).toBe('#ffffff');
    expect(previewAppearance(values, { brushColor: '#00ff00' }).color).toBe('#00ff00');
  });
});
