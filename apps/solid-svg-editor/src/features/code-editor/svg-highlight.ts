import { isAttributeRecognized, isRecognizedElement } from '../../svg-db';

/** Token kinds of GodSVG's SVG highlighter. */
export type HighlightKind =
  | 'symbol'
  | 'element'
  | 'unknown-element'
  | 'attribute'
  | 'unknown-attribute'
  | 'string'
  | 'comment'
  | 'text'
  | 'entity'
  | 'cdata'
  | 'error'
  | 'plain';

export type HighlightToken = { readonly kind: HighlightKind; readonly text: string };

/** GodSVG's default highlighter colors; unrecognized elements and attributes are 30% fainter. */
export const highlightColors = {
  symbol: '#abc9ff',
  element: '#ff8ccc',
  'unknown-element': '#ff8cccb3',
  attribute: '#bce0ff',
  'unknown-attribute': '#bce0ffb3',
  string: '#a1ffe0',
  comment: '#d4d6d980',
  text: '#ffffb3cc',
  entity: '#f2ba91dd',
  cdata: '#bfac73dd',
  error: '#ff5555',
  plain: 'inherit'
} as const satisfies Record<HighlightKind, string>;

/**
 * Splits SVG markup into colored tokens like GodSVG's highlighter. It never fails: the tokens always cover the whole
 * text, and markup that cannot be read (an unclosed tag, a stray character in a tag) is marked as an error up to the
 * next `>`.
 */
export function highlightSvg(source: string): readonly HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const push = (kind: HighlightKind, text: string) => {
    if (text !== '') {
      tokens.push({ kind, text });
    }
  };
  let index = 0;

  while (index < source.length) {
    const rest = source.slice(index);
    const block =
      rest.startsWith('<!--') ? { end: '-->', kind: 'comment' as const }
      : rest.startsWith('<![CDATA[') ? { end: ']]>', kind: 'cdata' as const }
      : rest.startsWith('<?') ? { end: '?>', kind: 'comment' as const }
      : rest.startsWith('<!') ? { end: '>', kind: 'comment' as const }
      : undefined;

    if (block) {
      const close = source.indexOf(block.end, index + 2);
      const end = close === -1 ? source.length : close + block.end.length;
      push(close === -1 ? 'error' : block.kind, source.slice(index, end));
      index = end;
    } else if (rest.startsWith('<')) {
      index = readTag(source, index, push);
    } else {
      const next = source.indexOf('<', index);
      const end = next === -1 ? source.length : next;
      pushText(source.slice(index, end), push);
      index = end;
    }
  }

  return tokens;
}

/** Writes tokens as HTML spans for a highlight layer; all text is escaped. */
export function highlightHtml(tokens: readonly HighlightToken[]): string {
  return tokens
    .map((token) =>
      token.kind === 'plain' ? escapeHtml(token.text) : `<span style="color:${highlightColors[token.kind]}">${escapeHtml(token.text)}</span>`
    )
    .join('');
}

function readTag(source: string, start: number, push: (kind: HighlightKind, text: string) => void): number {
  const closing = source.startsWith('</', start);
  let index = start + (closing ? 2 : 1);
  push('symbol', source.slice(start, index));

  const name = /^[^\s/>]*/.exec(source.slice(index))?.[0] ?? '';
  push(isRecognizedElement(name) || name === 'svg' ? 'element' : 'unknown-element', name);
  index += name.length;

  while (index < source.length) {
    const rest = source.slice(index);
    const space = /^\s+/.exec(rest)?.[0];

    if (space) {
      push('plain', space);
      index += space.length;
      continue;
    }

    const end = rest.startsWith('/>') ? '/>' : rest.startsWith('>') ? '>' : undefined;

    if (end) {
      push('symbol', end);
      return index + end.length;
    }

    const attribute = closing ? undefined : /^([^\s=/>"']+)(\s*)(=)(\s*)("[^"]*"|'[^']*')/.exec(rest);

    if (!attribute) {
      // Unreadable tag content: mark it as an error up to the next `>`.
      const close = source.indexOf('>', index);
      const stop = close === -1 ? source.length : close;
      push('error', source.slice(index, stop));
      index = stop;
      continue;
    }

    const [whole, attributeName = '', before = '', equals = '', after = '', value = ''] = attribute;
    push(isAttributeRecognized(name, attributeName) ? 'attribute' : 'unknown-attribute', attributeName);
    push('plain', before);
    push('symbol', equals);
    push('plain', after);
    push('string', value);
    index += whole.length;
  }

  return index;
}

function pushText(text: string, push: (kind: HighlightKind, text: string) => void): void {
  let index = 0;

  for (const match of text.matchAll(/&(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z][\w.-]*);/g)) {
    pushPlainOrText(text.slice(index, match.index), push);
    push('entity', match[0]);
    index = match.index + match[0].length;
  }

  pushPlainOrText(text.slice(index), push);
}

/** Whitespace between tags stays uncolored; other text gets the text color. */
function pushPlainOrText(text: string, push: (kind: HighlightKind, text: string) => void): void {
  push(text.trim() === '' ? 'plain' : 'text', text);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
