import { createContextProvider } from '@utils/createContextProvider';
import { createEffect, JSX, onCleanup } from 'solid-js';

const [ImageCacheProvider, useImageCache] = createContextProvider(() => {
  // Cache to store actual DOM img elements
  const imageElementCache = new Map<string, HTMLImageElement>();
  const imageElementStore = (<div style={{ display: 'none' }}></div>) as HTMLDivElement;

  const getOrCreateImage = (src: string, props: JSX.ImgHTMLAttributes<HTMLImageElement>): HTMLImageElement => {
    let img = imageElementCache.get(src);
    if (!img) {
      console.log('Creating NEW DOM element and loading:', src);
      img = (
        <img height={props.height} width={props.width} src={src} onLoad={() => console.log('Image loaded:', src)} />
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
  const containerRef = (<span style={{ display: 'contents' }} />) as HTMLSpanElement;
  let imgElement: HTMLImageElement | null = null;

  createEffect(() => {
    const src = props.src || '';

    if (containerRef && src) {
      // Get or create the cached image element
      imgElement = getOrCreateImage(src, props);

      // Move/append the cached img element into our container
      containerRef.appendChild(imgElement);
    }
  });

  onCleanup(() => {
    console.log('❓ Storing back image element to cache:', props.src);
    if (imgElement) {
      containerRef.removeChild(imgElement);
      storeBack(imgElement);
    }
  });

  // Return a container span that will hold the cached img element
  return containerRef;
}
