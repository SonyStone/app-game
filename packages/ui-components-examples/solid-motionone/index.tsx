import { toObservable } from '@utils/toObservable';
import { delay, filter, tap } from 'rxjs';
import { createMemo, createSignal, Show, untrack } from 'solid-js';
import { Motion, Presence } from 'solid-motionone';

export default function App() {
  const [show, setShow] = createSignal(true);
  const [bg, setBg] = createSignal('red');

  return (
    <div class="flex flex-col">
      <h1>Hello, Solid Motion One!</h1>
      <button onClick={() => setShow(!show())}>Toggle Animation</button>
      <Motion.div animate={{ opacity: [0, 1] }} transition={{ duration: 1, easing: 'ease-in-out' }}>
        <h1>Hello, Solid Motion One!</h1>
      </Motion.div>
      <Show when={show()}>
        <Motion.div
          animate={{ rotate: 180, backgroundColor: 'yellow' }}
          transition={{
            duration: 1,
            rotate: { duration: 2 }
          }}
        >
          <h1>Hello, Solid Motion One!</h1>
        </Motion.div>
      </Show>
      <Motion.button onClick={() => setBg('blue')} animate={{ backgroundColor: bg() }} transition={{ duration: 3 }}>
        Click Me
      </Motion.button>
      <Motion.div
        class="w-100px h-100px bg-#9911ff rounded-10px flex items-center justify-center"
        animate={{ scale: 1.2 }}
        transition={{ duration: 0.3 }}
        hover={{ scale: 1.5 }}
        // whileHover={{ scale: 1.2 }}
        // whileTap={{ scale: 0.8 }}
      />
      <Example2 />
      <ExampleOfLayoutAnimation />
    </div>
  );
}

function Example2() {
  const [show, setShow] = createSignal(true);

  return (
    <div>
      <Presence exitBeforeEnter>
        <Show when={show()}>
          <Motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: '100%' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2>Animated Content</h2>
          </Motion.div>
        </Show>
      </Presence>
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

  const index = createMemo((prev: number) => {
    toggle();
    while (true) {
      const newIndex = Math.floor(Math.random() * positions.length);
      if (newIndex !== prev) return newIndex;
    }
  }, 0);

  const position = createMemo(() => positions[index()]);

  return (
    <div class="p-4">
      <h2>Layout Animation Example</h2>
      <button
        class={['w-200px h-200px bg-#9911ff44 p-10px rounded-30px box-content flex  cursor-pointer', position()].join(
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
