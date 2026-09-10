import ArrowUpRightIcon from './icons/arrow-up-right.svg';
import styles from './AuthorCredit.module.css';

/** Credits the original concept and opens the supplied source post in a new tab. */
export function AuthorCredit() {
  return (
    <a
      class={styles.authorCredit}
      href="https://x.com/slavakornilov/status/2096724597080989846"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Original design by Slava Kornilov. View the original post on X, opens in a new tab."
    >
      <span class={styles.creditAuthor}>
        <span class={styles.creditLabel}>Original design</span>
        <span class={styles.creditName}>Slava Kornilov</span>
      </span>
      <span class={styles.creditSource}>View original on X</span>
      <span class={styles.creditArrow}>
        <ArrowUpRightIcon class={styles.icon} aria-hidden="true" />
      </span>
    </a>
  );
}
