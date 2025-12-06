import { createContextProvider } from '@utils/createContextProvider';
import { createMemo, JSX } from 'solid-js';

const [ImageCacheProvider, useImageCache] = createContextProvider(() => {
  // Cache to store actual DOM img elements
  const imageElementCache = new Map<string, HTMLImageElement>();
  const imageElementStore = new DocumentFragment();

  const getOrCreateImage = (src: string, props: JSX.ImgHTMLAttributes<HTMLImageElement>): HTMLImageElement => {
    let img = imageElementCache.get(src);
    if (!img) {
      console.log('Creating NEW DOM element and loading:', src);
      img = (
        <img height={props.height} width={props.width} src={src} onLoad={() => console.log('🥲 Image loaded:', src)} />
      ) as HTMLImageElement;
      imageElementCache.set(src, img);
      imageElementStore.appendChild(img);
    }

    return img;
  };

  return {
    getOrCreateImage,
    storeBack: (imgElement: HTMLImageElement) => {
      imageElementStore.appendChild(imgElement);
    },
    imageElementStore
  };
});

export { ImageCacheProvider };

export function ImageStore() {
  const { imageElementStore } = useImageCache();
  return imageElementStore as JSX.Element;
}

export function ImageCache(props: JSX.ImgHTMLAttributes<HTMLImageElement>) {
  const { getOrCreateImage, storeBack } = useImageCache();
  const containerRef = document.createTextNode('');

  const memoizedImage = createMemo(() => {
    const src = props.src || '';

    if (containerRef && src) {
      // Get or create the cached image element
      const imgElement = getOrCreateImage(src, props);

      console.log('✅ Using cached image element for:', props.src, imgElement);

      // onCleanup(() => {
      //   console.log('❓ Storing back image element to cache:', props.src, imgElement);
      //   if (imgElement) {
      //     storeBack(imgElement);
      //   }
      // });
      return imgElement;
    }

    return null;
  });

  return <>{memoizedImage()}</>;
}
