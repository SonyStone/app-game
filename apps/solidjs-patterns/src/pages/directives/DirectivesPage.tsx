import { type JSX } from 'solid-js';
import { markdownComponents } from '../markdown-components';
import DirectivesContent from './directives.md?markdown';

export default function DirectivesPage(): JSX.Element {
  return <DirectivesContent components={markdownComponents} />;
}
