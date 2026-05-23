import { type JSX } from 'solid-js';
import { createPatternMarkdownComponents } from '../markdown-components';
import PrimitivesContent from './primitives.md?markdown';

// ============================================================================
// MARK: Primitives Page
// ============================================================================

export default function PrimitivesPage(): JSX.Element {
  return <PrimitivesContent components={markdownComponents} />;
}

const markdownComponents = createPatternMarkdownComponents();
