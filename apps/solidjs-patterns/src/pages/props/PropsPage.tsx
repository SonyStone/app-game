import { type JSX } from 'solid-js';
import { createPatternMarkdownComponents } from '../markdown-components';
import PropsContent from './props.md?markdown';

// ============================================================================
// MARK: Props Page
// ============================================================================

export default function PropsPage(): JSX.Element {
  return <PropsContent components={markdownComponents} />;
}

const markdownComponents = createPatternMarkdownComponents();
