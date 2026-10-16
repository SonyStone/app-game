import { describe, expect, it } from 'vitest';
import { parseColor } from './colorNames';
import { describeIntent, parseCommand, type CommandContext, type Intent } from './commands';

const context: CommandContext = {
  presets: [
    { id: 'builtin:soft-round', name: 'Soft round' },
    { id: 'user:1', name: 'Dry ink' }
  ],
  layers: [{ name: 'Layer 1' }, { name: 'Sky' }, { name: 'Layer 3' }]
};

/** The single intent `text` parses to. */
function one(text: string): Intent | undefined {
  const intents = parseCommand(text, context);
  expect(intents?.length ?? 1).toBe(1);
  return intents?.[0];
}

describe('parseCommand', () => {
  it('reads brush sizes with or without a keyword and unit', () => {
    expect(one('size 24')).toEqual({ type: 'size', px: 24 });
    expect(one('Size 24px')).toEqual({ type: 'size', px: 24 });
    expect(one('brush 12.5')).toEqual({ type: 'size', px: 12.5 });
    expect(one('40 px')).toEqual({ type: 'size', px: 40 });
    expect(one('8')).toEqual({ type: 'size', px: 8 });
    expect(one('set the size to twenty four')).toEqual({ type: 'size', px: 24 });
  });

  it('reads relative sizes', () => {
    expect(one('bigger')).toEqual({ type: 'scale-size', factor: 1.25 });
    expect(one('smaller')).toEqual({ type: 'scale-size', factor: 0.8 });
    expect(one('much bigger')).toEqual({ type: 'scale-size', factor: 2 });
    expect(one('make it a bit smaller')).toEqual({ type: 'scale-size', factor: 1 / 1.1 });
    expect(one('x3')).toEqual({ type: 'scale-size', factor: 3 });
    expect(one('half size')).toEqual({ type: 'scale-size', factor: 0.5 });
  });

  it('reads opacity, flow and hardness as fractions', () => {
    expect(one('opacity 50')).toEqual({ type: 'brush-value', key: 'opacity', value: 0.5 });
    expect(one('opacity 40%')).toEqual({ type: 'brush-value', key: 'opacity', value: 0.4 });
    expect(one('opacity 0.25')).toEqual({ type: 'brush-value', key: 'opacity', value: 0.25 });
    expect(one('75%')).toEqual({ type: 'brush-value', key: 'opacity', value: 0.75 });
    expect(one('flow 30')).toEqual({ type: 'brush-value', key: 'flow', value: 0.3 });
    expect(one('hardness 150')).toEqual({ type: 'brush-value', key: 'hardness', value: 1 });
    expect(one('opacity 0')).toEqual({ type: 'brush-value', key: 'opacity', value: 0.01 });
  });

  it('reads colors by name, shade and code', () => {
    expect(one('red')).toEqual({ type: 'color', hex: '#ff0000', name: 'red' });
    expect(one('#ff8800')).toEqual({ type: 'color', hex: '#ff8800', name: '#ff8800' });
    expect(one('#F80')).toEqual({ type: 'color', hex: '#ff8800', name: '#ff8800' });
    expect(one('dark blue')).toEqual({ type: 'color', hex: '#00008b', name: 'dark blue' });
    expect(one('color light grey')).toMatchObject({ type: 'color', hex: '#c0c0c0' });
    expect(one('paint teal')).toMatchObject({ type: 'color', hex: '#008080' });
    expect(one('change the color to orange')).toMatchObject({ type: 'color', hex: '#ff8800' });
  });

  it('reads tools and color commands', () => {
    expect(one('eraser')).toEqual({ type: 'tool', tool: 'eraser' });
    expect(one('switch to brush')).toEqual({ type: 'tool', tool: 'brush' });
    expect(one('lasso')).toEqual({ type: 'selection-tool', tool: 'lasso' });
    expect(one('magic wand')).toEqual({ type: 'selection-tool', tool: 'wand' });
    expect(one('rectangle select')).toEqual({ type: 'selection-tool', tool: 'rectangle' });
    expect(one('bucket')).toEqual({ type: 'tool', tool: 'fill' });
    expect(one('eyedropper')).toEqual({ type: 'colors', action: 'pick' });
    expect(one('swap colors')).toEqual({ type: 'colors', action: 'swap' });
    expect(one('transform')).toEqual({ type: 'transform' });
  });

  it('reads layer commands, by number or by name', () => {
    expect(one('new layer')).toEqual({ type: 'layer', action: 'add' });
    expect(one('add a new layer')).toEqual({ type: 'layer', action: 'add' });
    expect(one('hide layer 2')).toEqual({ type: 'layer-flag', flag: 'visible', value: false, layer: 2 });
    expect(one('show layer 2')).toEqual({ type: 'layer-flag', flag: 'visible', value: true, layer: 2 });
    expect(one('hide')).toEqual({ type: 'layer-flag', flag: 'visible', value: false });
    expect(one('hide sky')).toEqual({ type: 'layer-flag', flag: 'visible', value: false, layer: 2 });
    expect(one('layer 3 opacity 40')).toEqual({ type: 'layer-opacity', value: 0.4, layer: 3 });
    expect(one('layer opacity 60%')).toEqual({ type: 'layer-opacity', value: 0.6 });
    expect(one('layer 2')).toEqual({ type: 'layer', action: 'select', layer: 2 });
    expect(one('go to layer 1')).toEqual({ type: 'layer', action: 'select', layer: 1 });
    expect(one('sky')).toEqual({ type: 'layer', action: 'select', layer: 2 });
    expect(one('layer 2 multiply')).toEqual({ type: 'layer-blend', blend: 'multiply', layer: 2 });
    expect(one('delete layer')).toEqual({ type: 'layer', action: 'delete' });
    expect(one('duplicate')).toEqual({ type: 'layer', action: 'duplicate' });
    expect(one('merge down')).toEqual({ type: 'layer', action: 'merge-down' });
    expect(one('layer up')).toEqual({ type: 'layer', action: 'up' });
    expect(one('rename layer 2 to Far Hills')).toEqual({ type: 'layer-rename', name: 'Far Hills', layer: 2 });
    expect(one('alpha lock')).toEqual({ type: 'layer-flag', flag: 'alphaLock', value: true });
    expect(one('unclip layer 3')).toEqual({ type: 'layer-flag', flag: 'clipping', value: false, layer: 3 });
    expect(parseCommand('layer 0', context)).toBeUndefined();
  });

  it('reads selection commands', () => {
    expect(one('select all')).toEqual({ type: 'selection', action: 'all' });
    expect(one('deselect')).toEqual({ type: 'selection', action: 'none' });
    expect(one('invert selection')).toEqual({ type: 'selection', action: 'invert' });
    expect(one('copy')).toEqual({ type: 'selection', action: 'copy' });
    expect(one('delete')).toEqual({ type: 'selection', action: 'delete' });
    expect(one('feather 12')).toEqual({ type: 'feather', px: 12 });
    expect(one('fill selection')).toEqual({ type: 'selection', action: 'fill' });
  });

  it('reads view commands', () => {
    expect(one('zoom 200')).toEqual({ type: 'zoom', percent: 200 });
    expect(one('zoom 50%')).toEqual({ type: 'zoom', percent: 50 });
    expect(one('zoom 99999')).toEqual({ type: 'zoom', percent: 3200 });
    expect(one('zoom in')).toEqual({ type: 'zoom-by', factor: 1.25 });
    expect(one('rotate 0')).toEqual({ type: 'rotate', degrees: 0 });
    expect(one('rotate 270')).toEqual({ type: 'rotate', degrees: -90 });
    expect(one('rotate -15°')).toEqual({ type: 'rotate', degrees: -15 });
    expect(one('rotate left')).toEqual({ type: 'rotate', degrees: -15, relative: true });
    expect(one('reset rotation')).toEqual({ type: 'rotate', degrees: 0 });
    expect(one('mirror')).toEqual({ type: 'view', action: 'mirror' });
    expect(one('reset view')).toEqual({ type: 'view', action: 'reset' });
    expect(one('fullscreen')).toEqual({ type: 'view', action: 'fullscreen' });
  });

  it('reads the session windows', () => {
    expect(one('palette')).toEqual({ type: 'window', window: 'palette' });
    expect(one('open the mixing palette')).toEqual({ type: 'window', window: 'palette' });
    expect(one('mix paint')).toEqual({ type: 'window', window: 'palette' });
    expect(one('palm rejection')).toEqual({ type: 'window', window: 'pen' });
    expect(one('pen settings')).toEqual({ type: 'window', window: 'pen' });
  });

  it('reads symmetry with segment counts kept in range', () => {
    expect(one('symmetry radial 8')).toEqual({ type: 'symmetry', mode: 'radial', segments: 8 });
    expect(one('symmetry off')).toEqual({ type: 'symmetry', mode: 'off' });
    expect(one('symmetry')).toEqual({ type: 'symmetry', mode: 'vertical' });
    expect(one('symmetry 5')).toEqual({ type: 'symmetry', mode: 'radial', segments: 5 });
    expect(one('radial')).toEqual({ type: 'symmetry', mode: 'radial', segments: 6 });
    expect(one('mandala 20')).toEqual({ type: 'symmetry', mode: 'mandala', segments: 10 });
    expect(one('symmetry quadrant')).toEqual({ type: 'symmetry', mode: 'dual' });
    expect(one('symmetry four way')).toEqual({ type: 'symmetry', mode: 'dual' });
    expect(one('8 way symmetry')).toEqual({ type: 'symmetry', mode: 'radial', segments: 8 });
  });

  it('reads history and file commands', () => {
    expect(one('undo')).toEqual({ type: 'history', action: 'undo', count: 1 });
    expect(one('undo 5')).toEqual({ type: 'history', action: 'undo', count: 5 });
    expect(one('Redo three times')).toEqual({ type: 'history', action: 'redo', count: 3 });
    expect(one('export png')).toEqual({ type: 'file', action: 'png' });
    expect(one('save as psd')).toEqual({ type: 'file', action: 'psd' });
    expect(one('save')).toEqual({ type: 'file', action: 'download' });
    expect(one('import brushes')).toEqual({ type: 'file', action: 'abr' });
    expect(one('open')).toEqual({ type: 'file', action: 'open' });
  });

  it('reads presets by exact name', () => {
    expect(one('soft round')).toEqual({ type: 'preset', id: 'builtin:soft-round', name: 'Soft round' });
    expect(one('Brush dry ink')).toEqual({ type: 'preset', id: 'user:1', name: 'Dry ink' });
  });

  it('reads several clauses in order and refuses a partly understood command', () => {
    expect(parseCommand('dark blue, size 12', context)).toEqual([
      { type: 'color', hex: '#00008b', name: 'dark blue' },
      { type: 'size', px: 12 }
    ]);
    expect(parseCommand('new layer and then multiply', context)).toEqual([
      { type: 'layer', action: 'add' },
      { type: 'layer-blend', blend: 'multiply' }
    ]);
    expect(parseCommand('red and banana', context)).toBeUndefined();
    expect(parseCommand('banana', context)).toBeUndefined();
    expect(parseCommand('   ', context)).toBeUndefined();
  });

  it('understands spoken filler and a closing full stop', () => {
    expect(one('Please undo.')).toEqual({ type: 'history', action: 'undo', count: 1 });
    expect(one('OK, eraser')).toEqual({ type: 'tool', tool: 'eraser' });
  });
});

describe('describeIntent', () => {
  it('says what a command does, naming layers', () => {
    const describe = (text: string) => parseCommand(text, context)!.map((intent) => describeIntent(intent, context));
    expect(describe('size 24')).toEqual(['Brush 24 px']);
    expect(describe('opacity 50')).toEqual(['Opacity 50%']);
    expect(describe('dark blue')).toEqual(['Color dark blue']);
    expect(describe('#ff8800')).toEqual(['Color #ff8800']);
    expect(describe('hide layer 2')).toEqual(['Hide Sky']);
    expect(describe('hide layer 9')).toEqual(['Hide layer 9']);
    expect(describe('layer 3 opacity 40')).toEqual(['Layer 3 opacity 40%']);
    expect(describe('zoom 200')).toEqual(['Zoom 200%']);
    expect(describe('rotate 0')).toEqual(['Rotate to 0°']);
    expect(describe('symmetry radial 8')).toEqual(['Symmetry radial · 8']);
    expect(describe('undo 5')).toEqual(['Undo ×5']);
    expect(describe('bigger')).toEqual(['Bigger brush']);
    expect(describe('export png')).toEqual(['Export PNG']);
  });
});

describe('parseColor', () => {
  it('reads codes and refuses plain numbers', () => {
    expect(parseColor('ff8800')).toEqual({ hex: '#ff8800', name: '#ff8800' });
    expect(parseColor('123456')).toBeUndefined();
    expect(parseColor('#123456')?.hex).toBe('#123456');
    expect(parseColor('rgb 255 136 0')?.hex).toBe('#ff8800');
    expect(parseColor('rgb 300 0 0')).toBeUndefined();
  });

  it('shades names without a CSS entry of their own', () => {
    expect(parseColor('dark red')?.hex).toBe('#8b0000');
    expect(parseColor('dark teal')?.hex).toBe('#004d4d');
    expect(parseColor('pale pink')?.hex).toBe(parseColor('pale pink')?.hex);
    expect(parseColor('light purple')?.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(parseColor('dark banana')).toBeUndefined();
  });
});
