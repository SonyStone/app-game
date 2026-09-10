import { For } from 'solid-js';
import type { GreaseMaterial, MaterialId } from '../../document';
import styles from './MaterialList.module.css';
import { vec4ToCss } from '../shared/color';

type MaterialListProps = {
  activeMaterialId: MaterialId;
  materials: readonly GreaseMaterial[];
  onSelectMaterial: (materialId: MaterialId) => void;
};

export function MaterialList(props: MaterialListProps) {
  return (
    <div class={styles.materialList}>
      <For each={props.materials}>
        {(material) => (
          <button
            class={`${styles.materialChip} ${
              material.id === props.activeMaterialId ? styles.materialChipActive : ''
            }`}
            type="button"
            onClick={() => props.onSelectMaterial(material.id)}
          >
            <span class={styles.materialSwatch} style={{ 'background-color': vec4ToCss(material.strokeColor) }} />
            <span class={styles.materialName}>{material.name}</span>
          </button>
        )}
      </For>
    </div>
  );
}
