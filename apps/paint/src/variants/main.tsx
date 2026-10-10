import { render } from '@solidjs/web';
import { For, lazy, Show } from 'solid-js';
import 'uno.css';
import { paintVariants } from '.';

/**
 * Dev entry at /variants.html: `#<id>` opens that Paint variant full-window, without a hash the page lists them. A
 * hash change reloads the page, so each variant starts with a fresh drawing session.
 */
const element = document.getElementById('app');
if (!element) {
  throw new Error('Missing application mount element.');
}

addEventListener('hashchange', () => location.reload());
const variant = paintVariants.find(({ id }) => id === location.hash.slice(1));
const Variant = variant && lazy(() => variant.load().then((component) => ({ default: component })));

render(
  () => (
    <Show when={Variant} fallback={<VariantList />}>
      {(Chosen) => {
        const Component = Chosen();
        return <Component />;
      }}
    </Show>
  ),
  element
);
document.body.classList.add('app-utilities');

/** Links to every variant. */
function VariantList() {
  return (
    <main style={{ padding: '24px', font: '14px/1.5 system-ui, sans-serif' }}>
      <h1>Paint variants</h1>
      <ul>
        <For each={paintVariants}>
          {(variant) => (
            <li>
              <a href={`#${variant.id}`}>{variant.name}</a> · {variant.description}
            </li>
          )}
        </For>
      </ul>
    </main>
  );
}
