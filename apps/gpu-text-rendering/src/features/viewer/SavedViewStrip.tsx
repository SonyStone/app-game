import { createEventListener } from '@solid-primitives/event-listener';
import playIcon from '@tabler/icons/outline/player-play.svg?url';
import stopIcon from '@tabler/icons/outline/player-stop.svg?url';
import closeIcon from '@tabler/icons/outline/x.svg?url';
import { createSignal, For, untrack } from 'solid-js';
import type { SavedViews } from './createSavedViews';
import type { createViewerI18n } from './i18n/createViewerI18n';
import s from './viewer.module.scss';

/**
 * Row of saved-view thumbnails with a play button for the looping tour. Selecting a thumbnail flies to its view; each
 * thumbnail has its own remove button. Dragging across the thumbnails with a mouse or pen scrubs the camera along the
 * route between them, scrolling the row when the pointer reaches its edge; touch drags scroll the row natively. A
 * vertical mouse wheel scrolls the row sideways.
 */
export function SavedViewStrip(props: {
  i18n: ReturnType<typeof createViewerI18n>;
  /** Views, selection and commands; read once. */
  savedViews: SavedViews;
  /** Starts or stops the looping tour from the play button. */
  onToggleTour: () => void;
  /** Receives the fractional route position under the pointer while scrubbing; see SavedViews.scrub. */
  onScrub: (position: number) => void;
}) {
  const t = untrack(() => props.i18n.t);
  const { views, selected, playing, visit, remove } = untrack(() => props.savedViews);
  const [list, setList] = createSignal<HTMLOListElement>();
  const [scrubbing, setScrubbing] = createSignal(false);
  let press: { id: number; x: number } | undefined;
  // Set once a press becomes a scrub, and cleared after the click that ends it, so releasing over a thumbnail does not
  // fly to it. The `scrubbing` signal only styles the row; its writes are not visible until Solid flushes.
  let dragged = false;

  createEventListener(
    list,
    'wheel',
    (event) => {
      const element = event.currentTarget as HTMLOListElement;

      if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && element.scrollWidth > element.clientWidth) {
        event.preventDefault();
        const direction = getComputedStyle(element).direction === 'rtl' ? -1 : 1;
        element.scrollBy({ left: event.deltaY * direction });
      }
    },
    { passive: false }
  );

  /** Scrubs to the pointer and keeps the nearest thumbnail visible, which scrolls the row near its edges. */
  function scrubTo(element: HTMLOListElement, clientX: number) {
    const thumbnails = [...element.querySelectorAll<HTMLElement>(`.${s.savedViewThumbnail}`)];
    const position = positionAt(
      clientX,
      thumbnails.map((thumbnail) => {
        const rect = thumbnail.getBoundingClientRect();
        return rect.left + rect.width / 2;
      })
    );

    props.onScrub(position);
    thumbnails[Math.round(position)]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  return (
    <div class={s.savedViews} role="group" aria-label={t('savedViews')}>
      <button
        type="button"
        class={s.tourButton}
        aria-label={playing() ? t('stopTour') : t('playTour')}
        aria-pressed={playing() ? 'true' : 'false'}
        title={playing() ? t('stopTour') : t('playTour')}
        onClick={() => props.onToggleTour()}
      >
        <img src={playing() ? stopIcon : playIcon} alt="" />
      </button>
      <ol
        ref={setList}
        class={`${s.savedViewList} ${scrubbing() ? s.scrubbing : ''}`}
        onPointerDown={(event) => {
          if (event.pointerType !== 'touch' && event.button === 0) {
            press = { id: event.pointerId, x: event.clientX };
          }
        }}
        onPointerMove={(event) => {
          if (press?.id !== event.pointerId) {
            return;
          }

          if (!dragged && Math.abs(event.clientX - press.x) > scrubThreshold) {
            event.currentTarget.setPointerCapture(event.pointerId);
            setScrubbing(true);
            dragged = true;
          }

          if (dragged) {
            scrubTo(event.currentTarget, event.clientX);
          }
        }}
        onPointerUp={() => {
          press = undefined;
        }}
        onLostPointerCapture={() => {
          press = undefined;
          setScrubbing(false);
          setTimeout(() => (dragged = false));
        }}
      >
        <For each={views()}>
          {(view, index) => {
            const number = () => ({ number: String(index() + 1) });

            return (
              <li class={s.savedView} aria-current={selected() === view ? 'true' : undefined}>
                <button
                  type="button"
                  class={s.savedViewThumbnail}
                  aria-label={t('savedView', number())}
                  title={t('savedView', number())}
                  onClick={() => {
                    if (!dragged) {
                      visit(view);
                    }
                  }}
                >
                  <img src={view.thumbnail} alt="" draggable={false} />
                </button>
                <button
                  type="button"
                  class={s.removeSavedView}
                  aria-label={t('removeView', number())}
                  title={t('removeView', number())}
                  onClick={() => remove(view)}
                >
                  <img src={closeIcon} alt="" />
                </button>
              </li>
            );
          }}
        </For>
      </ol>
    </div>
  );
}

/** CSS pixels a mouse or pen must move while pressed before the press becomes a scrub rather than a click. */
const scrubThreshold = 4;

/**
 * Returns the fractional index under `x` given the thumbnails' horizontal centers in list order: whole numbers at the
 * centers, interpolated between neighbours and clamped to the ends. Works for either reading direction.
 */
export function positionAt(x: number, centers: readonly number[]) {
  for (let index = 0; index + 1 < centers.length; index++) {
    const fraction = (x - centers[index]!) / (centers[index + 1]! - centers[index]!);

    if (fraction <= 1 || index + 2 === centers.length) {
      return index + Math.min(Math.max(fraction, 0), 1);
    }
  }

  return 0;
}
