/** A parsed gettext catalog: translations by msgid, and how much of the catalog is translated. */
export type PoCatalog = {
  readonly translations: ReadonlyMap<string, string>;
  /** Messages in the file, not counting the header. */
  readonly messageCount: number;
  /** Messages with a usable translation (not empty, not marked fuzzy). */
  readonly translatedCount: number;
};

/**
 * Parses a gettext PO file such as GodSVG's translations. Handles multi-line strings and C escapes; entries that are
 * untranslated or marked `#, fuzzy` are counted but left out, as gettext and Godot do. Contexts and plural forms are
 * not supported (GodSVG uses neither).
 */
export function parsePo(text: string): PoCatalog {
  const translations = new Map<string, string>();
  let messageCount = 0;

  for (const entry of text.split(/\r?\n\s*\r?\n/)) {
    const lines = entry.split(/\r?\n/).map((line) => line.trim());
    const msgid = poField(lines, 'msgid');
    const msgstr = poField(lines, 'msgstr');

    if (!msgid) {
      continue;
    }

    messageCount += 1;
    const fuzzy = lines.some((line) => line.startsWith('#,') && line.includes('fuzzy'));

    if (msgstr && !fuzzy) {
      translations.set(msgid, msgstr);
    }
  }

  return { translations, messageCount, translatedCount: translations.size };
}

/** The value of a keyword and its continuation lines, or `undefined` if the entry lacks it. */
function poField(lines: readonly string[], keyword: string): string | undefined {
  const start = lines.findIndex((line) => line.startsWith(`${keyword} "`));

  if (start === -1) {
    return undefined;
  }

  let value = unquote(lines[start]?.slice(keyword.length + 1) ?? '');

  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('"')) {
      break;
    }

    value += unquote(line);
  }

  return value;
}

function unquote(quoted: string): string {
  return quoted.slice(1, -1).replace(/\\(.)/g, (_, char: string) => escapes[char] ?? char);
}

const escapes: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r' };
