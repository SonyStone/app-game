import { toObservable } from '@utils/toObservable';
import { delay, filter, tap } from 'rxjs';
import { createMemo, createSignal, Show, untrack } from 'solid-js';

export default function App() {
  const [show, setShow] = createSignal(true);
  const [bg, setBg] = createSignal('red');

  return (
    <div class="flex flex-col">
      <h1>Solid 2 Web Animations</h1>
      <button onClick={() => setShow(!show())}>Toggle Animation</button>
      <div
        ref={(element) => {
          void element.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 1_000,
            easing: 'ease-in-out',
            fill: 'both'
          }).finished;
        }}
      >
        <h1>Hello, Web Animations!</h1>
      </div>
      <Show when={show()}>
        <div
          ref={(element) => {
            void element.animate(
              [
                { transform: 'rotate(0deg)', backgroundColor: 'transparent' },
                { transform: 'rotate(180deg)', backgroundColor: 'yellow' }
              ],
              { duration: 2_000, fill: 'both' }
            ).finished;
          }}
        >
          <h1>Hello, Web Animations!</h1>
        </div>
      </Show>
      <button onClick={() => setBg('blue')} style={{ 'background-color': bg(), transition: 'background-color 3s' }}>
        Click Me
      </button>
      <div class="w-100px h-100px bg-#9911ff rounded-10px flex scale-120 items-center justify-center transition-transform duration-300 hover:scale-150" />
      <Example2 />
      <ExampleOfLayoutAnimation />
    </div>
  );
}

function Example2() {
  const [show, setShow] = createSignal(true);

  return (
    <div>
      <Show when={show()}>
        <div
          ref={(element) => {
            void element.animate(
              [
                { opacity: 0, height: '0' },
                { opacity: 1, height: `${element.scrollHeight}px` }
              ],
              { duration: 300, fill: 'both' }
            ).finished;
          }}
        >
          <h2>Animated Content</h2>
        </div>
      </Show>
      <button onClick={() => setShow((p) => !p)}>Toggle</button>
    </div>
  );
}

function ExampleOfLayoutAnimation() {
  const [toggle, setToggle] = createSignal(true);

  const [ref, setRef] = createSignal<HTMLElement | null>(null);
  const [style, setStyle] = createSignal({});
  const [prevBoundingClientRect, setPrevBoundingClientRect] = createSignal<DOMRect | null>(null);

  toObservable(toggle)
    .pipe(
      filter(() => !!ref() && !!prevBoundingClientRect()),
      tap(() => {
        const prevRect = prevBoundingClientRect();
        const nextRect = untrack(ref)?.getBoundingClientRect();

        const x = (prevRect?.x ?? 0) - (nextRect?.x ?? 0);
        const y = (prevRect?.y ?? 0) - (nextRect?.y ?? 0);

        setStyle({
          transform: `translate(${x}px, ${y}px)`,
          transition: 'none'
        });
      }),
      delay(1),
      tap(() => {
        setStyle({
          transform: `translate(0px, 0px)`,
          transition: 'transform 0.3s ease-in-out'
        });
      })
    )
    .subscribe();

  const positions = [
    'place-content-start place-items-start',
    'place-content-start place-items-end',
    'place-content-end place-items-start',
    'place-content-end place-items-end',
    'place-content-center place-items-center'
  ];

  const index = createMemo(
    (prev: number) => {
      toggle();
      while (true) {
        const newIndex = Math.floor(Math.random() * positions.length);
        if (newIndex !== prev) return newIndex;
      }
    },
    { loadingValue: 0 }
  );

  const position = createMemo(() => positions[index()]);

  return (
    <div class="p-4">
      <h2>Layout Animation Example</h2>
      <button
        class={['w-200px h-200px bg-#9911ff44 p-10px rounded-30px box-content flex cursor-pointer', position()].join(
          ' '
        )}
        onClick={() => {
          setPrevBoundingClientRect(ref()?.getBoundingClientRect() || null);
          setToggle((p) => !p);
        }}
      >
        <div
          style={style()}
          ref={(ref) => {
            setRef(ref);
          }}
          class="w-50px h-50px bg-#9911ff transform-origin-center flex items-center justify-center rounded-full transition-transform"
        >
          <span class="text-white">{index() + 1}</span>
        </div>
      </button>
    </div>
  );
}
