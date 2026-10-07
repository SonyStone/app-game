import { describe, expect, it } from 'vitest';

import { colorToHex, formatColor } from '../src/editor/colors';
import { restoreSettings } from '../src/editor/defaults';
import { formatTransformFunctions, parseTransformFunctions } from '../src/editor/transform-list';
import { compactFormatter, formatAttributeValue, prettyFormatter } from '../src/formatter';

const compactColors = { useNamedColors: 'when-shorter', primarySyntax: 'three-or-six-digit-hex', capitalHex: false } as const;

describe('colors', () => {
  it('normalizes hex, rgb(), hsl(), and keywords to #rrggbb', () => {
    expect(colorToHex('#F00')).toBe('#ff0000');
    expect(colorToHex('rgb(255, 0, 128)')).toBe('#ff0080');
    expect(colorToHex('rgb(100%, 50%, 0%)')).toBe('#ff8000');
    expect(colorToHex('hsl(120, 100%, 25%)')).toBe('#008000');
    expect(colorToHex('rebeccapurple')).toBeUndefined();
    expect(colorToHex('aqua')).toBe('#00ffff');
    expect(colorToHex('#12345')).toBeUndefined();
  });

  it('writes colors in the configured syntax, preferring shorter keywords', () => {
    expect(formatColor('#FF0000', compactColors)).toBe('red');
    expect(formatColor('#ffffff', compactColors)).toBe('#fff');
    expect(formatColor('rgb(18, 52, 86)', compactColors)).toBe('#123456');
    expect(formatColor('cyan', compactColors)).toBe('#0ff');
    expect(formatColor('#ff0000', { ...compactColors, useNamedColors: 'never', capitalHex: true })).toBe('#F00');
    expect(formatColor('#808080', { ...compactColors, useNamedColors: 'always' })).toBe('gray');
    expect(formatColor('#ffffff', { ...compactColors, primarySyntax: 'rgb', useNamedColors: 'never' })).toBe('rgb(255, 255, 255)');
  });

  it('keeps none, currentColor, url references, and unknown text', () => {
    expect(formatColor(' none ', compactColors)).toBe('none');
    expect(formatColor('currentColor', compactColors)).toBe('currentColor');
    expect(formatColor('url( #grad )', compactColors)).toBe('url(#grad)');
    expect(formatColor('var(--x)', compactColors)).toBe('var(--x)');
  });
});

describe('transform lists', () => {
  const compact = { compressNumbers: true, minimizeSpacing: true, removeUnnecessaryParams: true };
  const verbose = { compressNumbers: false, minimizeSpacing: false, removeUnnecessaryParams: false };
  const format = (value: string, options = compact) => {
    const functions = parseTransformFunctions(value);
    return functions ? formatTransformFunctions(functions, options) : undefined;
  };

  it('fills defaults and drops them again when allowed', () => {
    expect(format('translate(5) rotate(45) scale(2)', verbose)).toBe('translate(5 0) rotate(45 0 0) scale(2 2)');
    expect(format('translate(5, 0) rotate(45 0 0) scale(2 2)')).toBe('translate(5) rotate(45) scale(2)');
    expect(format('matrix(1,0,0,1,0.5,-0.5)')).toBe('matrix(1 0 0 1 .5-.5)');
  });

  it('reads its own compact output and rejects malformed lists', () => {
    expect(format('translate(5-3)')).toBe('translate(5-3)');
    expect(format('matrix(1 0 0 1)')).toBeUndefined();
    expect(format('translate(1,,2)')).toBeUndefined();
    expect(format('rotate(45) bogus(1)')).toBeUndefined();
    expect(format('')).toBe('');
  });
});

describe('formatter integration', () => {
  it('formats color and transform attributes per formatter', () => {
    expect(formatAttributeValue({ name: 'fill', value: '#FF0000' }, compactFormatter)).toBe('red');
    expect(formatAttributeValue({ name: 'fill', value: '#ff0000' }, prettyFormatter)).toBe('red');
    expect(formatAttributeValue({ name: 'stroke', value: '#123456' }, prettyFormatter)).toBe('#123456');
    expect(formatAttributeValue({ name: 'transform', value: 'translate(10, 0)' }, compactFormatter)).toBe('translate(10)');
    expect(formatAttributeValue({ name: 'transform', value: 'translate(10)' }, prettyFormatter)).toBe('translate(10 0)');
    expect(formatAttributeValue({ name: 'transform', value: 'translate(10' }, compactFormatter)).toBe('translate(10');
  });

  it('fills color and transform settings for formatters saved before they existed', () => {
    const restored = restoreSettings(JSON.stringify({ exportFormatter: { preset: 'compact' } }));

    expect(restored.exportFormatter).toMatchObject({ colorUseNamedColors: 'when-shorter', transformListMinimizeSpacing: true });
  });
});
