import { type JSX } from 'solid-js';
import { markdownComponents } from '../markdown-components';
import PrimitivesContent from './primitives.md?markdown';

export default function PrimitivesPage(): JSX.Element {
  return <PrimitivesContent components={markdownComponents} />;
}
