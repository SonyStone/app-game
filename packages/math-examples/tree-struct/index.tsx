import { ComponentProps, createSignal } from 'solid-js';
import { ImageCache, ImageCacheProvider, ImageStore } from './ImageCache';
import { TreeStruct } from './tree-struct';
import { TreeStructSimple } from './TreeStructSimple';

export default function TreeStructExample() {
  return (
    <div class="flex gap-8">
      <TreeStruct />
      <TreeStructSimple />
      {/* <ListStruct /> */}
      {/* <SwapParentChild /> */}
      <ImageHidder />
    </div>
  );
}

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'app-image-hidder': ComponentProps<'div'>;
    }
  }
}

function ImageHidder() {
  const [toggle, setToggle] = createSignal(true);

  return (
    <ImageCacheProvider>
      <ImageStore />
      <app-image-hidder class="mt-4">
        <h2>Image Hidder Example</h2>
        <p>Click the button to hide/show the image below:</p>
        <button class="mb-4 rounded bg-blue-500 px-4 py-2 text-white" onClick={() => setToggle(!toggle())}>
          {toggle() ? 'Hide' : 'Show'} Image
        </button>
        {toggle() && (
          <ImageCache
            height={200}
            width={200}
            src="https://api.dicebear.com/6.x/thumbs/svg?seed=image"
            alt="Example from Cache"
          />
        )}
      </app-image-hidder>
    </ImageCacheProvider>
  );
}
