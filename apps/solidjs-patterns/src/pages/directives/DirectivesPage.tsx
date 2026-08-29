import type { JSX } from '@solidjs/web';
import { markdownComponents } from '../markdown-components';
import DirectivesContent from './directives.md?markdown';

export default function DirectivesPage(): JSX.Element {
  return <DirectivesContent components={markdownComponents} />;
}
