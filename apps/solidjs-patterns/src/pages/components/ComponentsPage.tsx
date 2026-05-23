import { type JSX } from 'solid-js';
import { createPatternMarkdownComponents } from '../markdown-components';
import ComponentsContent from './components.md?markdown';

// ============================================================================
// MARK: Components Page
// ============================================================================

export default function ComponentsPage(): JSX.Element {
  return <ComponentsContent components={markdownComponents} />;
}

const markdownComponents = createPatternMarkdownComponents();
