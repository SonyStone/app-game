import { JSX } from '@solidjs/web/jsx-runtime';

import { isTransformsAreEqual, Layout, noopTransform, Transform } from './layout';

export const layoutStyle = (layout: Layout): JSX.CSSProperties => {
  return {
    top: `${layout.y}px`,
    left: `${layout.x}px`,
    width: `${layout.width}px`,
    height: `${layout.height}px`
  };
};

export const transformStyle = (transform: Transform): JSX.CSSProperties => {
  return { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` };
};

export const maybeTransformStyle = (transform: Transform): JSX.CSSProperties => {
  return isTransformsAreEqual(transform, noopTransform()) ? {} : transformStyle(transform);
};
