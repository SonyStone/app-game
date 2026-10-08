import type { JSX } from '@solidjs/web';
import type { Studio } from '../../kit/createStudio';
import styles from './Deck.module.css';

/**
 * The five cards of the hand, in the order they are dealt and numbered (keys 1–5). Each has a suit, its glyph in the
 * corner index and as the faint watermark, and an accent, used sparingly: the suit pip and selected items.
 */
export const deck = [
  { id: 'navigate', title: 'Navigate', short: 'NAV', accent: '#6aa6dc' },
  { id: 'tools', title: 'Tools', short: 'TLS', accent: '#d8aa4c' },
  { id: 'brush', title: 'Brush', short: 'BRS', accent: '#e27b5a' },
  { id: 'color', title: 'Color', short: 'CLR', accent: '#c47ccc' },
  { id: 'layers', title: 'Layers', short: 'LYR', accent: '#72b88d' }
] as const;

/** A card of the deck. */
export type DeckCard = (typeof deck)[number];

export type CardId = DeckCard['id'];

/** The card's number in the hand, 0–4. */
export function cardIndex(id: CardId) {
  return deck.findIndex((card) => card.id === id);
}

/** A card's suit glyph, filled with the current color; sized by the CSS `width` and `height` of `class`. */
export function Suit(props: { card: CardId; class?: string }) {
  return (
    <svg class={props.class} viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true">
      <path d={suits[props.card]} />
    </svg>
  );
}

/**
 * The playing-card corner index: the suit pip over the card's short label. `turned` shows it as the bottom-right
 * index, rotated 180°.
 */
export function CornerIndex(props: { card: DeckCard; class?: string; turned?: boolean }) {
  return (
    <span
      class={[styles.index, props.class, { [styles.turned!]: props.turned === true }]}
      style={{ color: props.card.accent }}
    >
      <Suit card={props.card.id} class={styles.indexPip} />
      <b>{props.card.short}</b>
    </span>
  );
}

/** An active card's top strip: the corner index, the title, a live summary and the card's key. */
export function CardHead(props: { card: DeckCard; studio: Studio }) {
  return (
    <header class={styles.head}>
      <CornerIndex card={props.card} />
      <h3 class={styles.title}>{props.card.title}</h3>
      <span class={styles.summary}>{cardSummary(props.card.id, props.studio)}</span>
      <Kbd>{cardIndex(props.card.id) + 1}</Kbd>
    </header>
  );
}

/** An active card's bottom strip: how to switch cards, and the turned corner index. */
export function CardFoot(props: { card: DeckCard }) {
  return (
    <footer class={styles.foot}>
      <span class={styles.footHints}>
        <Kbd>←</Kbd>
        <Kbd>→</Kbd> cards · <Kbd>Tab</Kbd> hand · swipe down to put back
      </span>
      <CornerIndex card={props.card} turned />
    </footer>
  );
}

/** A small key cap, for shortcut hints. */
export function Kbd(props: { children: JSX.Element; class?: string }) {
  return <kbd class={[styles.kbd, props.class]}>{props.children}</kbd>;
}

/** One line about the card's current state, for its header: zoom and angle, the tool, the brush, the color… */
export function cardSummary(id: CardId, studio: Studio) {
  switch (id) {
    case 'navigate':
      return `${Math.round(studio.view().scale * 100)}% · ${signedAngle(studio.view().angle)}°`;
    case 'tools':
      return studio.toolInfo().label;
    case 'brush': {
      const size = studio.number('size');
      return size > 0 ? `${studio.toolInfo().label} · ${formatSize(size)} px` : studio.toolInfo().label;
    }
    case 'color':
      return studio.color().toUpperCase();
    case 'layers':
      return `${studio.layers().length} layers`;
  }
}

/** A view angle as −180…180, rounded, for readouts. */
export function signedAngle(degrees: number) {
  const turned = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return Math.round(turned === -180 ? 180 : turned);
}

/** A brush size as editors print it: one decimal below 10. */
export function formatSize(size: number) {
  return size < 10 ? `${Math.round(size * 10) / 10}` : `${Math.round(size)}`;
}

/**
 * Suit glyphs on a 24 × 24 grid: a compass star (Navigate), a hex nut (Tools), an ink drop (Brush), three
 * overlapping lights (Color) and a stack of sheets (Layers).
 */
const suits: Record<CardId, string> = {
  navigate:
    'M12 .8 14.6 9.4 23.2 12 14.6 14.6 12 23.2 9.4 14.6.8 12 9.4 9.4ZM12 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z',
  tools: 'M12 1.2 21.4 6.6V17.4L12 22.8 2.6 17.4V6.6ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  brush: 'M12 1C12 1 4 10.2 4 15.4a8 8 0 0 0 16 0C20 10.2 12 1 12 1ZM8.6 14.2c-.6 2.6.8 4.8 3 5.4-3.4.4-5-2.6-3-5.4Z',
  color:
    'M12 1.6a6.4 6.4 0 1 1 0 12.8 6.4 6.4 0 0 1 0-12.8ZM7.4 9.6a6.4 6.4 0 1 1 0 12.8 6.4 6.4 0 0 1 0-12.8ZM16.6 9.6a6.4 6.4 0 1 1 0 12.8 6.4 6.4 0 0 1 0-12.8Z',
  layers:
    'M12 1.5 22.5 7 12 12.5 1.5 7ZM3.6 10.9 12 15.3l8.4-4.4 2.1 1.1L12 17.5 1.5 12ZM3.6 15.9 12 20.3l8.4-4.4 2.1 1.1L12 22.5 1.5 17Z'
};
