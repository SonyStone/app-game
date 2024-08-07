import { Index, createEffect, createMemo, createSignal, mergeProps, onCleanup } from 'solid-js';
import { createKeys } from './create-keys';
import { getFrequencyOfNote } from './get-note-frequency';
import { orderNotes } from './order-notes';

export const QwertyPianoBoard = (props: {
  id?: string;
  octaves?: number;
  width?: number;
  height?: number;
  margin?: number;
  startNote?: string;
  whiteKeyColour?: string;
  blackKeyColour?: string;
  activeColour?: string;
  borderColour?: string;
  borderWidth?: number;
  keyboardLayout?: string;
  musicalTyping?: false;
  onFrequencyChange?: (frequency: number) => void;
}) => {
  const settings = mergeProps(
    {
      id: 'keyboard',
      octaves: 3,
      width: 600,
      height: 150,
      margin: 0,
      startNote: 'A3',
      whiteKeyColour: '#fff',
      blackKeyColour: '#000',
      activeColour: 'yellow',
      borderColour: '#000',
      borderWidth: 1,
      keyboardLayout: 'en',
      musicalTyping: false
    },
    props
  );

  const startOctave = parseInt(settings.startNote.charAt(1), 10);
  let keyOctave = startOctave;

  const whiteNotes = createMemo(() => orderNotes(['C', 'D', 'E', 'F', 'G', 'A', 'B'], settings.startNote));
  const notesWithSharps = createMemo(() => orderNotes(['C', 'D', 'F', 'G', 'A'], settings.startNote));
  const totalWhiteKeys = createMemo(() => settings.octaves * 7);
  createEffect(() => {
    console.log('totalWhiteKeys', totalWhiteKeys());
  });
  const whiteKeyWidth = createMemo(() => settings.width / totalWhiteKeys() - settings.borderWidth);
  const blackKeyWidth = createMemo(() => whiteKeyWidth() / 2);
  const keys = createMemo(() =>
    createKeys({
      startOctave,
      whiteNotes: whiteNotes(),
      notesWithSharps: notesWithSharps(),
      totalWhiteKeys: totalWhiteKeys(),
      whiteKeyWidth: whiteKeyWidth()
    })
  );

  const [title, setTitle] = createSignal(0);
  createEffect(() => {
    const frequency = title();
    if (isNumber(frequency)) {
      props.onFrequencyChange?.(frequency);
    }
  });

  const keysDown = {};

  /**
   * Lighten up man. Change the colour of a key.
   * @param  {element} el DOM element to change colour of.
   */
  const lightenUp = (el: HTMLElement) => {
    if (el !== null || typeof el === undefined) {
      el.classList.remove('duration-1000');
      el.classList.add('duration-0');
      el.style.backgroundColor = settings.activeColour;
    }
  };

  /**
   * Revert key to original colour.
   * @param  {element} el DOM element to change colour of.
   */
  const darkenDown = (el: HTMLElement) => {
    if (el !== null) {
      el.classList.remove('duration-0');
      el.classList.add('duration-1000');
      if (el.getAttribute('data-note-type') === 'white') {
        el.style.backgroundColor = settings.whiteKeyColour;
      } else {
        el.style.backgroundColor = settings.blackKeyColour;
      }
    }
  };

  let mouse_is_down = false;
  let eventTarget: HTMLElement | null = null;
  let prevElement: HTMLElement | null = null;
  const pointerHandler = (
    event: PointerEvent & {
      currentTarget: HTMLElement;
      target: Element;
    }
  ) => {
    const element = event.target as HTMLElement;
    switch (event.type) {
      case 'pointerdown': {
        if (element.tagName.toLowerCase() == 'li') {
          mouse_is_down = true;
          eventTarget?.addEventListener('pointermove', pointerHandler as any);
          lightenUp(element);
          if (prevElement !== element) {
            darkenDown(prevElement!);
            prevElement = element;
          }
          setTitle(getFrequencyOfNote(element.title));
        }
        break;
      }
      case 'pointerup': {
        if (element.tagName.toLowerCase() == 'li') {
          mouse_is_down = false;
          eventTarget?.removeEventListener('pointermove', pointerHandler as any);
          darkenDown(element);
          setTitle(getFrequencyOfNote(element.title));
        }
        break;
      }
      case 'pointermove': {
        if (mouse_is_down) {
          const overElement = document.elementFromPoint(event.clientX, event.clientY)! as HTMLElement;
          if (overElement.tagName.toLowerCase() == 'li') {
            lightenUp(overElement);
            if (prevElement !== overElement) {
              // console.log('prevElement', prevElement);
              darkenDown(prevElement!);
              prevElement = overElement;
            }
            setTitle(getFrequencyOfNote(overElement.title));
          }
        }
        break;
      }
      case 'pointerover': {
        if (mouse_is_down && element.tagName.toLowerCase() == 'li') {
          lightenUp(element);
          if (prevElement !== element) {
            darkenDown(prevElement!);
            prevElement = element;
          }
          setTitle(getFrequencyOfNote(element.title));
        }
        break;
      }
      case 'pointerout': {
        if (mouse_is_down && element.tagName.toLowerCase() == 'li') {
          darkenDown(element);
          setTitle(getFrequencyOfNote(element.title));
        }
        break;
      }
      case 'pointercancel':
      case 'pointerleave':
        if (mouse_is_down && element.tagName.toLowerCase() == 'li') {
          darkenDown(element);
          setTitle(getFrequencyOfNote(element.title));
        }
        eventTarget?.removeEventListener('pointermove', pointerHandler as any);
        mouse_is_down = false;
        break;

      default:
        break;
    }
  };

  onCleanup(() => {
    eventTarget?.removeEventListener('pointermove', pointerHandler as any);
  });

  return (
    <>
      <pre>{title()}</pre>
      <div
        id={props.id}
        class="touch-none"
        style={{
          height: `$Psettings.height}px`,
          padding: 0,
          position: 'relative',
          'list-style': 'none',
          margin: `${settings.margin}px`,
          'user-select': 'none',
          'box-sizing': 'content-box'
        }}
      >
        <ul
          ref={(ref) => (eventTarget = ref)}
          style={{
            cursor: 'default',
            height: `${settings.height}px`,
            padding: 0,
            position: 'relative',
            'list-style': 'none',
            margin: `${settings.margin}px`,
            '-webkit-user-select': 'none',
            'box-sizing': 'content-box',
            // width: totalWhiteKeys() * (whiteKeyWidth() + settings.borderWidth) + settings.borderWidth * 2 + 'px',
            width: `${settings.width}px`,
            display: 'flex',
            'place-items': 'start'
          }}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={pointerHandler}
          onPointerUp={pointerHandler}
          onPointerOver={pointerHandler}
          onPointerOut={pointerHandler}
          onPointerLeave={pointerHandler}
          onPointerCancel={pointerHandler}
        >
          <Index each={keys()}>
            {(key, index) => (
              <li
                class="transition-colors"
                id={key().id}
                title={key().id}
                data-note-type={key().colour}
                style={{
                  'user-select': 'none',
                  border: `${settings.borderWidth}px solid ${settings.borderColour}`,
                  'box-sizing': 'content-box',
                  ...(key().colour === 'white'
                    ? {
                        'background-color': settings.whiteKeyColour,
                        'font-size': `${whiteKeyWidth() / 2}px`,
                        height: `${settings.height}px`,
                        width: `${whiteKeyWidth()}px`,
                        margin: `0 -${settings.borderWidth}px 0 0`,
                        'border-radius': '0 0 5px 5px',
                        position: 'relative',
                        'z-index': '1'
                      }
                    : {
                        'background-color': settings.blackKeyColour,
                        position: 'relative',
                        'font-size': `${blackKeyWidth() / 2}px`,
                        color: settings.whiteKeyColour,
                        width: `${blackKeyWidth()}px`,
                        margin: `0 ${-(blackKeyWidth() + settings.borderWidth * 2) / 2}px`,
                        height: `${settings.height / 1.5}px`,
                        'border-radius': '0 0 3px 3px',
                        'z-index': '2'
                      })
                }}
              ></li>
            )}
          </Index>
        </ul>
      </div>
    </>
  );
};

function isNumber(n: number): boolean {
  return typeof n == 'number' && !isNaN(n) && isFinite(n);
}
