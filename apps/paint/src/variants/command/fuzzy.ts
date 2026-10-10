/**
 * Ranks `items` against a search `query`, best first, dropping those that do not match; items that score the same keep
 * their order. Every word of the query must match the item's `title` or its `keywords`, either as a substring or as
 * letters in order (`nwl` finds "New layer"). Matches at the start of the title or of a word rank higher, and the
 * title counts more than the keywords. When no item matches every word, as with a misheard spoken command, items
 * matching some of the words are ranked instead. An empty query keeps every item in order.
 */
export function rankByQuery<T extends { title: string; keywords?: string }>(query: string, items: readonly T[]): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [...items];
  }

  const rank = (some: boolean) =>
    items
      .map((item, index) => ({ item, index, score: itemScore(words, item, some) }))
      .filter((entry): entry is { item: T; index: number; score: number } => entry.score !== undefined)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map(({ item }) => item);
  const all = rank(false);
  return all.length > 0 || words.length === 1 ? all : rank(true);
}

/**
 * How well one query `word` matches `text`, higher is better, or `undefined` when its letters do not appear in order.
 * A substring scores more than scattered letters, and more again at the start of the text or of a word. Scattered
 * letters count only when most of them start words or follow each other.
 */
export function fuzzyScore(word: string, text: string): number | undefined {
  const haystack = text.toLowerCase();
  const at = haystack.indexOf(word);
  if (at >= 0) {
    const start = at === 0 ? 40 : isWordStart(haystack, at) ? 25 : 0;
    // Shorter texts match more exactly.
    return 100 + start + word.length * 4 - haystack.length * 0.2;
  }

  let score = 0;
  let from = 0;
  let previous = -2;
  for (const letter of word) {
    const found = haystack.indexOf(letter, from);
    if (found < 0) {
      return undefined;
    }

    score += found === previous + 1 ? 6 : isWordStart(haystack, found) ? 5 : 1;
    previous = found;
    from = found + 1;
  }

  // Letters scattered mid-word match almost anything in a long text; most must start words or follow each other.
  return score < word.length * 3 ? undefined : score - haystack.length * 0.2;
}

/**
 * The item's score for the query words, each from its title or, weighted lower, its keywords; `undefined` when a word
 * does not match, or with `some` when none does.
 */
function itemScore(words: string[], item: { title: string; keywords?: string }, some: boolean) {
  let total = 0;
  let matched = 0;
  for (const word of words) {
    const title = fuzzyScore(word, item.title);
    const keywords = item.keywords === undefined ? undefined : fuzzyScore(word, item.keywords);
    const best = Math.max(title ?? -Infinity, keywords === undefined ? -Infinity : keywords * 0.8);
    if (best === -Infinity) {
      if (!some) {
        return undefined;
      }

      continue;
    }

    matched++;
    total += best;
  }

  return matched > 0 ? total : undefined;
}

function isWordStart(text: string, index: number) {
  return index === 0 || /[\s\-_./·(]/.test(text.charAt(index - 1));
}
