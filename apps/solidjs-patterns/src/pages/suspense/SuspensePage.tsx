import type { JSX } from '@solidjs/web';
import { markdownComponents } from '../markdown-components';
import SuspenseContent from './suspense.md?markdown';

export default function SuspensePage(): JSX.Element {
  return <SuspenseContent components={markdownComponents} />;
}
