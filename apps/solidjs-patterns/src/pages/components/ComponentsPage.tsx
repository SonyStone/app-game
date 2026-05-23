import { type JSX } from 'solid-js';
import { markdownComponents } from '../markdown-components';
import ComponentsContent from './components.md?markdown';

export default function ComponentsPage(): JSX.Element {
  return <ComponentsContent components={markdownComponents} />;
}
