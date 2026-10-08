import { Match, Switch } from 'solid-js';
import { SketchIcon } from '../../../../shared/ui/SketchIcon';
import type { Preset } from '../../kit/catalog';
import type { Studio } from '../../kit/createStudio';
import { LayerThumb } from '../../kit/LayerThumb';
import { StrokePreview } from '../../kit/StrokePreview';
import { cardIndex, CornerIndex, formatSize, signedAngle, Suit, type DeckCard } from './cards';
import styles from './Deck.module.css';

/**
 * A card as it lies in the hand: the corner indices, its key, the suit as a watermark, the title, and one live stat
 * large enough to read at a third of the size: the zoom and angle, the tool, the brush stroke, the color, the active
 * layer. Drawn at the card's full size; the hand shrinks the whole card.
 */
export function CardFace(props: { card: DeckCard; studio: Studio; hidden: boolean }) {
  return (
    <div class={[styles.face, { [styles.faceHidden!]: props.hidden }]} aria-hidden={props.hidden ? 'true' : undefined}>
      <Suit card={props.card.id} class={styles.faceGlyph} />
      <CornerIndex card={props.card} class={styles.faceCorner} />
      <CornerIndex card={props.card} class={styles.faceCorner} turned />
      <span class={styles.faceKey}>{cardIndex(props.card.id) + 1}</span>
      <div class={styles.faceStat}>
        <Switch>
          <Match when={props.card.id === 'navigate'}>
            <b class={styles.faceBig}>{Math.round(props.studio.view().scale * 100)}%</b>
            <span class={styles.faceLine}>
              <SketchIcon name="rotate" size={30} />
              {signedAngle(props.studio.view().angle)}°
              <SketchIcon name="undo" size={30} />
              {props.studio.history().done}
            </span>
          </Match>
          <Match when={props.card.id === 'tools'}>
            <SketchIcon name={props.studio.toolInfo().icon} size={112} />
            <span class={styles.faceLine}>{props.studio.toolInfo().label}</span>
          </Match>
          <Match when={props.card.id === 'brush'}>
            <div class={styles.faceStroke}>
              <StrokePreview preset={livePreset(props.studio)} color={props.studio.color()} height={96} />
            </div>
            <span class={styles.faceLine}>
              {props.studio.number('size') > 0
                ? `${formatSize(props.studio.number('size'))} px · ${props.studio.number('opacity')}%`
                : props.studio.toolInfo().label}
            </span>
          </Match>
          <Match when={props.card.id === 'color'}>
            <span class={styles.faceSwatches}>
              <i style={{ background: props.studio.previous() }} />
              <i style={{ background: props.studio.color() }} />
            </span>
            <span class={styles.faceLine}>{props.studio.color().slice(1).toUpperCase()}</span>
          </Match>
          <Match when={props.card.id === 'layers'}>
            <LayerThumb
              studio={props.studio}
              layer={props.studio.activeLayer()}
              width={236}
              height={162}
              class={styles.faceThumb}
            />
            <span class={styles.faceLine}>
              {props.studio.layers().find((layer) => layer.id === props.studio.activeLayer())?.name}
            </span>
          </Match>
        </Switch>
      </div>
      <span class={styles.faceTitle}>{props.card.title}</span>
    </div>
  );
}

/** The current tool's brush as a preset, so that the Brush card's face samples the live settings. */
function livePreset(studio: Studio): Preset {
  const tool = studio.tool();
  return {
    id: 'live',
    name: '',
    tool: tool === 'mixer' || tool === 'eraser' ? tool : 'brush',
    set: 'Painting',
    values: {
      size: studio.number('size') || 12,
      opacity: studio.number('opacity') || 100,
      hardness: studio.value('hardness') === undefined ? 100 : studio.number('hardness'),
      pressureSize: studio.value('pressureSize') === true
    }
  };
}
