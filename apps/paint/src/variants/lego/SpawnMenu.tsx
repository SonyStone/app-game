import { createEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createSignal, For, Show } from 'solid-js';
import { besideRect, type Point } from './board';
import type { createKits, Kit } from './kits';
import type { LegoServices } from './LegoServices';
import styles from './LegoStudio.module.css';
import { KitTile, partFamilies, PartTile } from './PartsTray';

/**
 * The menu a long press on the bare drawing or on a panel's free cells opens right under the finger, after Blender's
 * Shift+A pie: the families of parts in a ring around the press, and the parts of the chosen one in a card beside
 * it. While the press is still held, sliding toward a family chooses it, as in a marking menu; a tap chooses one too.
 * A tap on a part puts it where the menu was opened, a drag carries it off like one taken from the box.
 *
 * A press outside the menu or Escape closes it.
 */
export function SpawnMenu(props: {
  /** Where the press was, in the editor's pixels. */
  at: Point;
  /** The pointer of the press that opened the menu while it is still down. */
  held?: number;
  /** The editor's size, which the card stays inside. */
  view: { width: number; height: number };
  /** Hides the menu while a part taken from it is carried. */
  hidden: boolean;
  presets: LegoServices['presets']['all'];
  kits: ReturnType<typeof createKits>;
  /** Lifts a new part of `kind`, or a copy of `kit`, from the press `event`. */
  onLift: (event: PointerEvent, kind: string) => void;
  onLiftKit: (event: PointerEvent, kit: Kit) => void;
  onClose: () => void;
}) {
  const [root, setRoot] = createSignal<HTMLElement>();
  const [card, setCard] = createSignal<HTMLElement>();
  const cardSize = createElementSize(card);
  const [chosen, setChosen] = createSignal<string>();
  const [holding, setHolding] = createSignal(props.held !== undefined);
  const families = () => [
    ...partFamilies(props.presets).filter((family) => family.kinds.length > 0),
    { id: kitsTitle, title: kitsTitle, kinds: [] }
  ];
  const family = () => families().find((candidate) => candidate.title === chosen());

  // While the opening press is held, its direction from the center chooses a family.
  createEventListener(window, 'pointermove', (event) => {
    if (!holding() || event.pointerId !== props.held) {
      return;
    }

    const x = event.clientX - props.at.x;
    const y = event.clientY - props.at.y;
    if (Math.hypot(x, y) < markDistance) {
      return;
    }

    const step = (Math.PI * 2) / families().length;
    const turn = (Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2 + step / 2) % (Math.PI * 2);
    setChosen(families()[Math.floor(turn / step)]?.title);
  });
  createEventListener(window, ['pointerup', 'pointercancel'], (event) => {
    if (event.pointerId === props.held) {
      setHolding(false);
    }
  });
  createEventListener(
    window,
    'pointerdown',
    (event) => {
      if (!(event.target instanceof Node && root()?.contains(event.target))) {
        props.onClose();
      }
    },
    { capture: true }
  );
  createEventListener(
    window,
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        props.onClose();
      }
    },
    { capture: true }
  );

  const cardPlace = () =>
    besideRect(
      {
        left: props.at.x - ringRadius - 44,
        top: props.at.y - ringRadius - 16,
        width: ringRadius * 2 + 88,
        height: ringRadius * 2 + 32
      },
      { width: cardSize.width ?? 0, height: cardSize.height ?? 0 },
      props.view
    );

  return (
    <div ref={setRoot} class={styles.spawn} data-hidden={props.hidden ? '' : undefined} data-keeps-panel>
      <div class={styles.spawnRing} style={{ left: `${props.at.x}px`, top: `${props.at.y}px` }}>
        <span class={styles.spawnCenter} />
        <For each={families()} keyed={(family) => family.id}>
          {(entry, index) => {
            const angle = () => (index() / families().length) * Math.PI * 2 - Math.PI / 2;
            return (
              <button
                type="button"
                class={styles.spawnFamily}
                aria-pressed={chosen() === entry().title ? 'true' : 'false'}
                style={{
                  left: `${Math.cos(angle()) * ringRadius}px`,
                  top: `${Math.sin(angle()) * ringRadius}px`
                }}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') {
                    setChosen(entry().title);
                  }
                }}
                onClick={() => setChosen(entry().title)}
              >
                {entry().title}
              </button>
            );
          }}
        </For>
      </div>
      <Show when={family()}>
        {(shown) => (
          <div
            ref={setCard}
            class={styles.spawnCard}
            style={{
              left: `${cardPlace().x}px`,
              top: `${cardPlace().y}px`,
              visibility: cardSize.width ? undefined : 'hidden'
            }}
          >
            <h4>{shown().title}</h4>
            <div class={styles.trayItems}>
              <Show
                when={shown().title !== kitsTitle}
                fallback={
                  <For each={props.kits.kits()}>
                    {(kit) => (
                      <KitTile kit={kit} kits={props.kits} cells={2} onLift={(event) => props.onLiftKit(event, kit)} />
                    )}
                  </For>
                }
              >
                <For each={shown().kinds}>
                  {(kind) => (
                    <PartTile kind={kind} presets={props.presets} onLift={(event) => props.onLift(event, kind)} />
                  )}
                </For>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}

const kitsTitle = 'Kits';

/** Distance in CSS pixels from the center to the families' buttons. */
const ringRadius = 76;

/** CSS pixels a held press must slide from the center before its direction chooses a family. */
const markDistance = 36;
