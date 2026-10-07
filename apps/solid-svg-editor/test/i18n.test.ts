import { describe, expect, it } from 'vitest';

import { restoreSettings } from '../src/editor/defaults';
import { availableLocales, formatMessage, loadCatalog, localeDisplayName, resolveLocale } from '../src/i18n/locales';
import { parsePo } from '../src/i18n/po';

describe('parsePo', () => {
  it('reads multi-line and escaped strings, skipping the header, untranslated and fuzzy entries', () => {
    const catalog = parsePo(
      [
        'msgid ""',
        'msgstr ""',
        '"Language: ru\\n"',
        '',
        '#: src/a.gd',
        'msgid "Quit"',
        'msgstr "Выйти"',
        '',
        'msgid ""',
        '"Attribute \\"{name}\\" "',
        '"is invalid."',
        'msgstr "Атрибут \\"{name}\\"\\nневерен."',
        '',
        'msgid "Untranslated"',
        'msgstr ""',
        '',
        '#, fuzzy',
        'msgid "Guess"',
        'msgstr "Догадка"',
        '',
        '#~ msgid "Obsolete"',
        '#~ msgstr "Устарело"'
      ].join('\n')
    );

    expect(catalog.translations.get('Quit')).toBe('Выйти');
    expect(catalog.translations.get('Attribute "{name}" is invalid.')).toBe('Атрибут "{name}"\nневерен.');
    expect(catalog.translations.has('Untranslated')).toBe(false);
    expect(catalog.translations.has('Guess')).toBe(false);
    expect(catalog.translations.has('Obsolete')).toBe(false);
    expect(catalog.messageCount).toBe(4);
    expect(catalog.translatedCount).toBe(2);
  });
});

describe('locales', () => {
  it("lists GodSVG's translations with English first and Lolcat last", () => {
    expect(availableLocales[0]).toBe('en');
    expect(availableLocales.at(-1)).toBe('lolcat');
    expect(availableLocales).toContain('ru');
    expect(availableLocales).toContain('pt_BR');
  });

  it('loads a real catalog', async () => {
    const catalog = await loadCatalog('ru');

    expect(catalog.translations.get('Settings')).toBe('Настройки');
    expect(catalog.translatedCount).toBeGreaterThan(300);
    await expect(loadCatalog('xx')).rejects.toThrow();
  });

  it("names locales like GodSVG's language menu", () => {
    expect(localeDisplayName('ru')).toBe('Russian (RU)');
    expect(localeDisplayName('pt_BR')).toBe('Brazilian Portuguese (pt-BR)');
  });

  it('fills placeholders and resolves stored or browser languages', () => {
    expect(formatMessage('Save {file_name}? {missing}', { file_name: 'a.svg' })).toBe('Save a.svg? {missing}');
    expect(resolveLocale('pt-BR')).toBe('pt_BR');
    expect(resolveLocale('ru-RU')).toBe('ru');
    expect(resolveLocale('ja')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
    expect(restoreSettings(JSON.stringify({ language: 'de' })).language).toBe('de');
    expect(restoreSettings(JSON.stringify({ language: 'klingon' })).language).toBe('en');
    expect(restoreSettings('{}').language).toBe('en');
  });
});
