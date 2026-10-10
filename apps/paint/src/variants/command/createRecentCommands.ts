import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { intentKey, type Intent } from './commands';

/**
 * Commands run from the palette, newest first and without repeats, kept in `localStorage` so that the palette offers
 * them again after a reload. Help and returning to the playground are not remembered. Storage failures keep the list
 * until the page closes.
 */
export function createRecentCommands() {
  const [commands, setCommands, latestCommands] = createImmediateSignal(read());

  return {
    /** Up to `limit` commands, each the intents one palette row ran. */
    commands,
    remember(intents: readonly Intent[]) {
      if (
        intents.length === 0 ||
        intents.some(
          (intent) => intent.type === 'app' && intent.action !== 'hand-left' && intent.action !== 'hand-right'
        )
      ) {
        return;
      }

      const key = keyOf(intents);
      const next = [[...intents], ...latestCommands().filter((command) => keyOf(command) !== key)].slice(0, limit);
      setCommands(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Recents are a convenience; keep the in-memory list.
      }
    }
  };
}

function keyOf(intents: readonly Intent[]) {
  return intents.map(intentKey).join('|');
}

/** Stored commands; entries that are not lists of intent objects are dropped. */
function read(): Intent[][] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (!Array.isArray(stored)) {
      return [];
    }

    return stored
      .filter(
        (command): command is Intent[] =>
          Array.isArray(command) &&
          command.length > 0 &&
          command.every((intent) => typeof intent === 'object' && intent !== null && typeof intent.type === 'string')
      )
      .slice(0, limit);
  } catch {
    return [];
  }
}

const storageKey = 'paint.command.recent';
const limit = 8;
