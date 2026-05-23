import { type JSX } from 'solid-js';
import { createPatternMarkdownComponents } from '../markdown-components';
import DirectivesContent from './directives.md?markdown';

// ============================================================================
// MARK: Directives Page
// ============================================================================

export default function DirectivesPage(): JSX.Element {
  return <DirectivesContent components={markdownComponents} />;
}

const markdownComponents = createPatternMarkdownComponents();
