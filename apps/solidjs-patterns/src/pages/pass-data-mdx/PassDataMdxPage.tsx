import { type JSX } from 'solid-js';
import { PatternLayout } from '../../components/PatternLayout';
import { components } from './PassDataMdxParts';
import PassDataContent from './pass-data.mdx';

// ============================================================================
// MARK: Pass Data MDX Page
// ============================================================================

export default function PassDataMdxPage(): JSX.Element {
  return (
    <PatternLayout
      title="Pass Data (MDX)"
      badge="MDX"
      description="A small MDX trial: prose stays in markdown while richer examples and callouts stay as Solid components."
    >
      <div class="flex flex-col gap-6">
        <PassDataContent components={components} />
      </div>
    </PatternLayout>
  );
}
