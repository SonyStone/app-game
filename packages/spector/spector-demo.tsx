import type { JSX } from '@solidjs/web';
import { ThreeExamplesSpector } from './three-examples-spector';

/** Interactive route for capturing the official Three.js WebGL examples with Spector. */
export default function SpectorDemo(): JSX.Element {
  return <ThreeExamplesSpector />;
}
