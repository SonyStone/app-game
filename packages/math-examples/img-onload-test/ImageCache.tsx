import {
  Accessor,
  batch,
  ComponentProps,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  getOwner,
  JSX,
  mergeProps,
  onCleanup,
  Setter,
  Signal
} from 'solid-js';
import { spread } from 'solid-js/web';

/**
 * The possible states of an image in the cache.
 * 'empty' - Image element created, not mounted and no loading started.
 * 'mounted' - Image element mounted, loading started but not yet loaded.
 * 'ready' - Image element mounted and loaded, ready to be cloned.
 */

export function createImageCache() {
  type Root = {
    src: string | undefined;
    img: HTMLImageElement;
    readyForClone: Accessor<boolean>;
    dispose(): void;
    refcount: number;
    setProps: Setter<ComponentProps<'img'>>;
  };

  const owner = getOwner();
  const cache = new Map<string | undefined, Root>();

  onCleanup(() => {
    for (const root of cache.values()) {
      root.dispose();
    }
  });

  const mapRoot = (
    src: string | undefined,
    dispose: VoidFunction,
    [props, setProps]: Signal<ComponentProps<'img'>>
  ) => {
    const [readyForClone, setReadyForClone] = createSignal(false);
    const img = (
      <img
        {...props()}
        src={src}
        onLoad={() => {
          console.log('4️⃣❗❗ Image loaded:', src);
          setReadyForClone(true);
        }}
      />
    ) as HTMLImageElement;

    const root: Root = {
      src,
      img,
      refcount: 1,
      setProps,
      dispose,
      readyForClone
    };

    return root;
  };

  const cloneRoot = (sourceRoot: Root, dispose: VoidFunction, [props, setProps]: Signal<ComponentProps<'img'>>) => {
    const img = createMemo(() => {
      if (!sourceRoot.readyForClone()) {
        return null;
      }

      // Need to clone only after original img did load to avoid re-loading
      console.log(`♻️ Cloned image element for src: ${sourceRoot.src}`);
      const img = sourceRoot.img.cloneNode() as HTMLImageElement;
      spread(
        img,
        mergeProps(props(), {
          id: 'clone',
          src: sourceRoot.src,
          onLoad: () => console.warn('4️⃣❗❗ Cloned image loaded:', sourceRoot.src)
        })
      );

      return img;
    });

    const root: Root = {
      src: sourceRoot.src,
      img,
      refcount: 1,
      setProps,
      dispose,
      readyForClone: () => false
    };

    return root;
  };

  const cleanupRoot = (root: Root) => {
    batch(() => {
      root.setProps({});
      root.refcount--;
    });
  };

  return (props: JSX.ImgHTMLAttributes<HTMLImageElement>): JSX.Element => {
    console.log('0️⃣ImageCache render for src:', props.src);
    return createMemo(() => {
      const src = props.src;
      const root = cache.get(props.src);

      // Create New image on start
      if (!root) {
        console.log('3️⃣Creating NEW DOM element and loading:', src);
        const newRoot = createRoot((dispose) => mapRoot(src, dispose, createSignal(props)), owner);
        cache.set(newRoot.src, newRoot);

        onCleanup(() => {
          cleanupRoot(newRoot);
        });

        return newRoot.img as unknown as JSX.Element;
      }

      // Reuse existing inactive image
      if (root && root.refcount === 0) {
        console.log('2️⃣Reusing DOM element from cache for:', src, ' refcount:', root.refcount);
        batch(() => {
          root!.setProps(props);
          root!.refcount = 1;
        });

        onCleanup(() => {
          cleanupRoot(root);
        });

        const [node, setNode] = createSignal<JSX.Element | null>(null);

        createEffect(() => {
          setNode(root.img);
        });

        return node as unknown as JSX.Element;
      }

      // Reuse, but if image is already in the DOM, we clone it.
      // Need a ref count I gess?
      {
        console.log('3️⃣ Cloning DOM element from cache for:', src, ' refcount:', root.refcount);
        // Need to clone the existing component
        const clonedRoot = createRoot((dispose) => cloneRoot(root!, dispose, createSignal(props)), owner);
        root.refcount++;
        onCleanup(() => {
          cleanupRoot(root);
        });

        return clonedRoot.img as unknown as JSX.Element;
      }
    }) as unknown as JSX.Element;
  };
}
