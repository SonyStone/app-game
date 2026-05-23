import { type JSX } from 'solid-js';
import { createPatternMarkdownComponents } from '../markdown-components';
import SuspenseContent from './suspense.md?markdown';

// ============================================================================
// MARK: Suspense Page
// ============================================================================

export default function SuspensePage(): JSX.Element {
  return <SuspenseContent components={markdownComponents} />;
}

const markdownComponents = createPatternMarkdownComponents();
