import { Icon } from './Icon';
import RecordIcon from './icons/record.svg';
import styles from './ExplorationBoard.module.css';

/** Extra fullscreen studies use the same square grid and the folder's live palette. */
export function ExplorationBoard(props: { colors: readonly string[]; onPalette: () => void }) {
  return (
    <section class={styles.boardExploration} aria-label="Creative studies">
      <h2 class={styles.explorationTitle}>
        Ideas take
        <br />
        shape.
      </h2>
      <div class={styles.explorationEdition}>
        <span>03</span>
        <span>
          FIELD NOTES
          <br />
          Always in progress
        </span>
      </div>
      <button class={styles.shapeStudy} onClick={props.onPalette} aria-label="Change study palette">
        <span class={`${styles.studyDisc} ${styles.studyDiscOne}`} style={{ background: props.colors[0] }} />
        <span class={`${styles.studyDisc} ${styles.studyDiscTwo}`} style={{ background: props.colors[1] }} />
        <span class={`${styles.studyDisc} ${styles.studyDiscThree}`} />
        <span class={styles.studyCaption}>Color relationships</span>
        <Icon name="arrowUpRight" />
      </button>
      <div class={styles.typeStudy}>
        <span class={styles.typeSpecimen}>Aa</span>
        <span class={styles.typeCaption}>Form. Rhythm. Repeat.</span>
        <span class={styles.typeScale}>01 — 09</span>
      </div>
      <h3 class={styles.notesTitle}>
        <span style={{ background: props.colors[2] }} />
        Things to try
      </h3>
      <ol class={styles.studyNotes}>
        <li>
          <span>01</span>Start with a shape.
          <Icon name="arrowRight" />
        </li>
        <li>
          <span>02</span>Find another angle.
          <Icon name="arrowUpRight" />
        </li>
        <li>
          <span>03</span>Leave room to play.
          <Icon name="plus" />
        </li>
      </ol>
      <div class={styles.studyMessage}>
        <span>
          Make something
          <br />
          unexpected.
        </span>
        <Icon name="arrowUpRight" />
      </div>
      <div class={styles.studyBottom}>
        <span class={styles.studyBottomNumber}>04</span>
        <span>
          MORE TO COME
          <br />
          <span>Keep the good bits.</span>
        </span>
        <RecordIcon aria-hidden="true" />
      </div>
    </section>
  );
}
