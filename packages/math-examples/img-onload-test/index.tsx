import { createRootPool } from '@solid-primitives/rootless';
import {
  children,
  ComponentProps,
  createEffect,
  createMemo,
  createSignal,
  For,
  JSX,
  JSXElement,
  onCleanup,
  Show
} from 'solid-js';
import { spread } from 'solid-js/web';
import { createRootMapPool } from './createRootMapPool';
import { createImageCache } from './ImageCache';
import { patchLogDomManipulation } from './patchLogDomManipulation';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'app-img-onload-test': ComponentProps<'div'>;
    }
  }
}

const getImageSrc = (seed: string | number) => `https://api.dicebear.com/6.x/thumbs/svg?seed=${seed}`;

const TEN_ITEMS = Array.from({ length: 2 }, (_, i) => i + 1);

export default function ImgOnLoadTest() {
  return (
    <app-img-onload-test class="flex flex-col place-items-center gap-4 p-4">
      <div class="flex flex place-items-start gap-4">
        <div class="flex flex-col items-center gap-4 border border-transparent p-2">
          Image OnLoad Test
          {/* <img height={200} width={200} src={imageUrl()} onLoad={(e) => console.log('🥲 Image loaded:', e)} /> */}
        </div>
        <ImagesRootMapPool />
        <ImagesRootPool />
        <ImageMoveAround />
        <ImageCreateAndDestroy />
      </div>
    </app-img-onload-test>
  );
}

function ImagesRootMapPool() {
  const imagePool = createRootMapPool<number, string, JSXElement>((key, src) => {
    createEffect(() => {
      console.log('Creating POOLED image for src:', src());
    });
    const [loadedCount, setLoadedCount] = createSignal(0);

    return (
      <>
        <img
          id={`pooled-image-seed-${key}`}
          ref={() => {
            onCleanup(() => {
              console.log('🥲 Image cleaned up:', key);
            });
          }}
          height={20}
          width={20}
          src={src()}
          onLoad={(e) => {
            console.log('🥲 Image loaded:', e);
            setLoadedCount((c) => c + 1);
          }}
        />
        <span class="text-sm text-gray-500">
          Image {key} Loaded Count {loadedCount()}
        </span>
      </>
    ) as HTMLImageElement;
  });

  const [toggle, setToggle] = createSignal(true);
  const [count, setCount] = createSignal(0);

  function ImagePool(props: { key: number }) {
    const image = createMemo(() => {
      console.log('ImagePool creating image for key:', props.key);
      return imagePool(props.key, getImageSrc(props.key));
    });

    return <>{image()}</>;
  }

  return (
    <div class="flex w-full flex-col place-items-center gap-2 rounded-md border border-gray-300 p-2">
      <div class="flex gap-2">
        <button
          class="w-full rounded bg-blue-200 px-4 py-2 hover:bg-blue-300"
          onClick={() => setToggle((prev) => !prev)}
        >
          {toggle() ? 'Hide' : 'Show'}
        </button>
        <button
          class="w-full rounded bg-blue-200 px-4 py-2 hover:bg-blue-300"
          onClick={() => setCount((prev) => prev - 1)}
        >
          Remove
        </button>
        <button
          class="w-full rounded bg-blue-200 px-4 py-2 hover:bg-blue-300"
          onClick={() => setCount((prev) => prev + 1)}
        >
          Add
        </button>
      </div>
      <div
        class="flex flex-col gap-2"
        ref={(ref) => {
          patchLogDomManipulation(ref);
        }}
      >
        <Show when={toggle()}>
          <For each={TEN_ITEMS}>
            {(item) => (
              <ImageContainer>
                {/* <OnMount>{imagePool(item + count(), getImageSrc(item + count()))}</OnMount> */}
                <OnMount>
                  <ImagePool key={item + count()} />
                </OnMount>
              </ImageContainer>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}

function OnMount(props: { children: JSX.Element }) {
  const resolved = children(() => props.children);
  const [node, setNode] = createSignal<JSX.Element>(null);

  createEffect(() => {
    // let node = resolved();
    // if (node instanceof HTMLElement && document.body.contains(node)) {
    //   node = node.cloneNode(true);
    // }

    setNode(resolved());
  });

  return node as unknown as JSX.Element;
}

function ImageCreateAndDestroy() {
  const [toggle, setToggle] = createSignal(true);

  const Image = createImageCache();

  const image = (
    <img
      ref={(ref) => {
        patchLogDomManipulation(ref);
      }}
      height={50}
      width={50}
      src={getImageSrc('create')}
      onLoad={(e) => console.log('🥲 Image loaded:', e)}
    />
  ) as HTMLImageElement;

  const holder = (<div></div>) as HTMLDivElement;

  const [imageId, setImageId] = createSignal(0);
  const [imageSize, setImageSize] = createSignal(50);

  spread(image, {
    get height() {
      return imageSize();
    },
    get width() {
      return imageSize();
    },
    onload: (e: Event) => console.log('🥲 Cloned Image loaded:', e)
  });

  function addImage() {
    const newImage = image.cloneNode(true) as HTMLImageElement;
    spread(newImage, {
      get height() {
        return imageSize();
      },
      get width() {
        return imageSize();
      },
      onload: (e: Event) => console.log('🥲 Cloned Image loaded:', e)
    });
    holder.appendChild(newImage);
  }

  return (
    <div class="flex flex-col gap-4 rounded-md border border-gray-300 p-2">
      <button class="w-full rounded bg-blue-200 px-4 py-2 hover:bg-blue-300" onClick={() => setToggle((prev) => !prev)}>
        {toggle() ? 'Hide' : 'Show'}
      </button>
      <button class="w-full rounded bg-blue-200 px-4 py-2 hover:bg-blue-300" onClick={() => addImage()}>
        Add Image
      </button>
      <div class="flex gap-2">
        <button
          class="w-full rounded bg-blue-200 px-4 py-2 hover:bg-blue-300"
          onClick={() => setImageId((prev) => prev + 1)}
        >
          Next Image
        </button>
        <span>Current Image ID: {imageId()}</span>
        <button
          class="w-full rounded bg-blue-200 px-4 py-2 hover:bg-blue-300"
          onClick={() => setImageId((prev) => prev - 1)}
        >
          Previous Image
        </button>
      </div>
      <input
        type="range"
        min={10}
        max={100}
        value={imageSize()}
        onInput={(e) => setImageSize(Number(e.currentTarget.value))}
      />
      <div
        id="1"
        ref={(ref) => {
          patchLogDomManipulation(ref);
        }}
      >
        {(() => {
          const img = (<img />) as HTMLImageElement;
          spread(img, {
            get height() {
              return imageSize();
            },
            get width() {
              return imageSize();
            },
            get src() {
              return getImageSrc('off');
            }
          });
          return img;
        })()}
        <Show when={toggle()}>
          <div
            id="2"
            ref={(ref) => {
              patchLogDomManipulation(ref);
            }}
          >
            <Image
              id="3"
              ref={(ref) => {
                patchLogDomManipulation(ref);
              }}
              height={imageSize()}
              width={imageSize()}
              src={getImageSrc('create' + imageId())}
            />
            <Image
              id="3"
              ref={(ref) => {
                patchLogDomManipulation(ref);
              }}
              height={imageSize()}
              width={imageSize()}
              src={getImageSrc('create' + imageId())}
            />
          </div>
          {image}
          {holder}
        </Show>
      </div>
    </div>
  );
}

function ImageMoveAround() {
  const container1 = (
    <div class="h-20px w-20px flex-shrink-0 rounded-md border border-gray-300"></div>
  ) as HTMLDivElement;
  const container2 = (
    <div class="h-20px w-20px flex-shrink-0 rounded-md border border-gray-300"></div>
  ) as HTMLDivElement;
  const container3 = (
    <div class="h-20px w-20px flex-shrink-0 rounded-md border border-gray-300"></div>
  ) as HTMLDivElement;
  const where = new DocumentFragment();

  const image = (
    <img height={20} width={20} src={getImageSrc('move')} onLoad={(e) => console.log('🥲 Image loaded:', e)} />
  ) as HTMLImageElement;

  const oldRemove = image.remove;
  image.remove = () => {
    console.log('🥲 Image removed:', image);
    oldRemove.call(image);
  };

  console.log('Initial image element:', container3);

  const tasks = [
    () => {
      container1.appendChild(image);
    },
    () => {
      container2.appendChild(image);
    },
    () => {
      container3.appendChild(image);
    },
    () => {
      where.appendChild(image);
    }
  ];

  let currentTask = 0;

  return (
    <div class="flex flex-col gap-4 rounded-md border border-gray-300 p-2">
      <button
        class="rounded bg-blue-200 px-4 py-2 hover:bg-blue-300"
        onClick={() => {
          tasks[currentTask % tasks.length]();
          currentTask++;
        }}
      >
        Move Image
      </button>
      {container1}
      {container2}
      {where}
    </div>
  );
}

function ImagesRootPool() {
  const imagePool = createRootPool<string, JSXElement>((src) => {
    const src2 = createMemo(() => src(), '', {
      equals: (a, b) => {
        console.log('Comparing image src for pooling:', a, b, a === b);
        return a === b;
      }
    });
    console.log('Creating POOLED image');
    createEffect(() => {
      console.log('Creating POOLED image for src:', src2());
    });
    return <img height={20} width={20} src={src()} onLoad={(e) => console.log('🥲 Image loaded:', e)} />;
  });

  const [count, setCount] = createSignal(0);

  return (
    <Toggler>
      <For each={TEN_ITEMS}>{(item) => <ImageContainer>{imagePool(getImageSrc(item + count()))}</ImageContainer>}</For>
    </Toggler>
  );
}

function ImageContainer(props: Partial<{ children: JSX.Element }>) {
  return <div class="flex items-center gap-4 rounded border p-1 px-1.5">{props.children}</div>;
}

function Toggler(props: { children?: JSX.Element }) {
  const [toggle, setToggle] = createSignal(true);

  return (
    <div class="flex w-full flex-col place-items-center gap-2 rounded-md border border-gray-300 p-2">
      <button class="w-full rounded bg-blue-200 px-4 py-2 hover:bg-blue-300" onClick={() => setToggle((prev) => !prev)}>
        {toggle() ? 'Hide' : 'Show'}
      </button>
      <div
        class="flex flex-col gap-2"
        ref={(ref) => {
          patchLogDomManipulation(ref);
        }}
      >
        <Show when={toggle()}>{props.children}</Show>
      </div>
    </div>
  );
}
