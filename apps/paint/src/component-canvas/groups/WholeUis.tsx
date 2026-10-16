import type { JSX } from '@solidjs/web';
import { For, lazy, Loading, Show } from 'solid-js';
import type { VariantInfo } from '../../mockups/puck-gallery/kit/variant';
import { variants as galleryVariants } from '../../mockups/puck-gallery/variants';
import { featureDemos, paintVariants, type PaintVariant } from '../../variants';
import styles from '../ComponentCanvas.module.css';
import { GalleryStage } from '../GalleryStage';
import { TryButton } from '../Screen';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';

/**
 * Whole UIs, each opened full screen from the canvas: Paint's variants and feature demos on the drawing session, as
 * their pages show them, the two mockup pages, and every Puck gallery variant on a mock studio. They cannot sit on the
 * canvas themselves: a variant opens the drawing session, with its engine and the saved drawing that every variant
 * shares, and the gallery's variants listen to the whole window; so only one runs at a time.
 */
export function WholeUis() {
  return (
    <CanvasGroup
      id="whole-uis"
      title="Whole UIs"
      omitted={
        <>
          Paint's variants open the drawing they all share on this address, as their pages do; the feature demos open
          drawings of their own. The canvas's parts of each UI are in the groups by kind.
        </>
      }
    >
      <CanvasRow title="Paint variants" note="on the drawing session, full screen">
        <For each={paintVariants}>
          {(variant) => <PaintVariantSpecimen variant={variant} group="variants" />}
        </For>
      </CanvasRow>

      <CanvasRow title="Feature demos" note="one feature each, on a drawing of its own">
        <For each={featureDemos}>{(demo) => <PaintVariantSpecimen variant={demo} group="demos" />}</For>
      </CanvasRow>

      <CanvasRow title="Puck gallery" note="each summoned pinned on a mock studio, as the gallery's Pin does">
        <For each={galleryVariants}>{(variant) => <GalleryVariantSpecimen variant={variant} />}</For>
      </CanvasRow>

      <CanvasRow title="Mockup pages">
        <Specimen
          id="whole-uis/mockups/puck-gallery"
          label="Puck gallery"
          below={<TryButton label="Open full screen" title="Puck gallery" render={() => <PuckGalleryPage />} />}
        >
          <UiCard
            name="Puck gallery"
            text="Nine Puck and cluster designs on one drawing, switched from its bar; Space, the pen's side button or a long press summons the chosen one."
          />
        </Specimen>
        <Specimen
          id="whole-uis/mockups/tile-cluster"
          label="Tile cluster"
          below={<TryButton label="Open full screen" title="Tile cluster" render={() => <TileClusterPage />} />}
        >
          <UiCard
            name="Tile cluster"
            text="The first cluster mockup: tiles of tools, color, brush and layers around the Puck ring, with its launcher and debug sidebar."
          />
        </Specimen>
      </CanvasRow>
    </CanvasGroup>
  );
}

/** A Paint variant or feature demo: its card, and the variant itself full screen. */
function PaintVariantSpecimen(props: { variant: PaintVariant; group: 'variants' | 'demos' }) {
  return (
    <Specimen
      id={`whole-uis/${props.group}/${props.variant.id}`}
      label={props.variant.name}
      below={
        <TryButton
          label="Open full screen"
          title={props.variant.name}
          render={() => <PaintVariantStage variant={props.variant} />}
        />
      }
    >
      <UiCard name={props.variant.name} text={props.variant.description} />
    </Specimen>
  );
}

/** A Paint variant loaded on first use; its link back leads to the canvas. */
function PaintVariantStage(props: { variant: PaintVariant }) {
  const Variant = lazy(() => props.variant.load().then((component) => ({ default: component })));

  return (
    <Loading fallback={<p class={styles.stageHint}>Opening {props.variant.name}…</p>}>
      <Variant experimentsHref="/paint/components" />
    </Loading>
  );
}

/** A Puck gallery variant: its card with the gallery's own description, and the variant live full screen. */
function GalleryVariantSpecimen(props: { variant: VariantInfo }) {
  return (
    <Specimen
      id={`whole-uis/puck-gallery/${props.variant.id}`}
      label={props.variant.name}
      below={
        <TryButton
          label="Open full screen"
          title={`Puck gallery: ${props.variant.name}`}
          render={() => <GalleryStage variant={props.variant} />}
        />
      }
    >
      <UiCard name={props.variant.name} text={props.variant.idea} from={props.variant.inspiredBy} />
    </Specimen>
  );
}

/** A whole UI's card: its name, where it comes from and what it is. */
function UiCard(props: { name: string; text: string; from?: string; children?: JSX.Element }) {
  return (
    <div class={styles.uiCard}>
      <b>{props.name}</b>
      <Show when={props.from}>
        <small>{props.from}</small>
      </Show>
      <p>{props.text}</p>
      {props.children}
    </div>
  );
}

const PuckGalleryPage = lazy(() =>
  import('../../mockups/puck-gallery/PuckGallery').then(({ PuckGallery }) => ({ default: PuckGallery }))
);

const TileClusterPage = lazy(() =>
  import('../../mockups/tile-cluster/TileClusterMockup').then(({ TileClusterMockup }) => ({
    default: TileClusterMockup
  }))
);
