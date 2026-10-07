import { describe, expect, it } from 'vitest';

import { restoreSettings } from '../src/editor/defaults';
import { compactFormatter, formatAttributeValue, formatNumber, prettyFormatter, serializeRoot } from '../src/formatter';
import { formatPathData, parsePathData, simplifyPathCommands, tryParsePathData } from '../src/path-data';
import { parseSvgMarkup } from '../src/svg-model';

const compactPath = { compressNumbers: true, minimizeSpacing: true, removeSpacingAfterFlags: true, removeConsecutiveCommands: true };

describe('path data output', () => {
  it('writes readable and compact path data like GodSVG', () => {
    const commands = parsePathData('M 10 20 L 30 -0.5 L 0.25 0.5 a 5 5 30 0 1 -10 0 z');

    expect(formatPathData(commands)).toBe('M 10 20 L 30 -0.5 L 0.25 0.5 a 5 5 30 0 1 -10 0 z');
    expect(formatPathData(commands, compactPath)).toBe('M10 20 30-.5.25.5a5 5 30 01-10 0z');
  });

  it('keeps six decimals instead of rounding to three', () => {
    expect(formatPathData(parsePathData('M0.123456789 1.0004'))).toBe('M 0.123457 1.0004');
  });

  it('only accepts path data that parses completely', () => {
    expect(tryParsePathData('M0 0 L10 10')).toHaveLength(2);
    expect(tryParsePathData('M0 0 L10')).toBeUndefined();
    expect(tryParsePathData('')).toEqual([]);
  });
});

describe('path simplification', () => {
  const simplify = (data: string) => formatPathData(simplifyPathCommands(parsePathData(data)));

  it('replaces commands with the shortest exact equivalent', () => {
    expect(simplify('M0 0 L10 0 L10 10 l5 5')).toBe('M 0 0 H 10 V 10 l 5 5');
    expect(simplify('M0 0 Q5 0 10 0 C10 3 10 6 10 10')).toBe('M 0 0 H 10 V 10');
    expect(simplify('M0 0 Q5 5 10 0 Q15 -5 20 0')).toBe('M 0 0 Q 5 5 10 0 T 20 0');
    expect(simplify('M0 0 C0 5 5 5 5 0 C5 -5 10 -5 10 0')).toBe('M 0 0 C 0 5 5 5 5 0 S 10 -5 10 0');
    expect(simplify('M0 0 C20 20 40 20 60 0')).toBe('M 0 0 Q 30 30 60 0');
    expect(simplify('M0 0 A5 5 45 0 1 10 0 A0 3 0 0 1 20 0')).toBe('M 0 0 A 5 5 0 0 1 10 0 H 20');
  });

  it('keeps a curve that a following shorthand depends on', () => {
    expect(simplify('M0 0 Q5 0 10 0 T20 10')).toBe('M 0 0 Q 5 0 10 0 T 20 10');
  });
});

describe('attribute value formatting', () => {
  it('formats numbers with the leading-zero and exponent options', () => {
    expect(formatNumber(0.5, compactFormatter)).toBe('.5');
    expect(formatNumber(5000, compactFormatter)).toBe('5e3');
    expect(formatNumber(0.0001, compactFormatter)).toBe('1e-4');
    expect(formatNumber(0.05, compactFormatter)).toBe('.05');
    expect(formatNumber(5000, prettyFormatter)).toBe('5000');
    expect(formatNumber(-0.5, prettyFormatter)).toBe('-0.5');
  });

  it('rewrites path data and plain numbers, leaving other values as written', () => {
    expect(formatAttributeValue({ name: 'd', value: 'M 0 0 L 0.5 0.5' }, compactFormatter)).toBe('M0 0 .5.5');
    expect(formatAttributeValue({ name: 'd', value: 'M 0 0 L 1' }, compactFormatter)).toBe('M 0 0 L 1');
    expect(formatAttributeValue({ name: 'opacity', value: '0.50' }, compactFormatter)).toBe('.5');
    expect(formatAttributeValue({ name: 'width', value: '10mm' }, compactFormatter)).toBe('10mm');
    expect(formatAttributeValue({ name: 'fill', value: '#FF0000' }, compactFormatter)).toBe('#FF0000');
  });

  it('serializes documents with the formatter applied to attribute values', () => {
    const parsed = parseSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><path d="M 0 0 L 10 0 L 10 10" opacity="0.5"/></svg>');

    if (!parsed.ok) {
      throw new Error(parsed.message);
    }

    expect(serializeRoot(parsed.root, compactFormatter)).toBe('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 10 0 10 10" opacity=".5"/></svg>');
  });
});

describe('restoreSettings', () => {
  it('fills formatter fields added since the settings were saved', () => {
    const restored = restoreSettings(JSON.stringify({ showGrid: false, exportFormatter: { preset: 'compact', removeComments: true } }));

    expect(restored.showGrid).toBe(false);
    expect(restored.exportFormatter).toMatchObject({ removeComments: true, pathdataRemoveSpacingAfterFlags: true, numberUseExponentIfShorter: true });
    expect(restored.formatter.pathdataMinimizeSpacing).toBe(true);
    expect(restoreSettings('not json').formatter).toEqual(prettyFormatter);
  });
});
