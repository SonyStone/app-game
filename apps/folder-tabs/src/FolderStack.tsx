import { Tabs, type TabsProps } from '@app-game/solid-tabs';
import type { DemoFolder } from './folders';
import ArrowRightIcon from './icons/arrow-right.svg';
import FolderTabShape from './icons/folder-tab.svg';
import styles from './FolderStack.module.css';

/** The folder skin. Selection, gestures, layout and motion belong to solid-tabs. */
export function FolderStack(props: Omit<TabsProps<DemoFolder>, 'label' | 'getLabel' | 'renderTab'>) {
  return (
    <Tabs
      {...props}
      id=""
      label="Creative folders"
      class={styles.folderStack!}
      classes={{
        list: 'folder-tabs',
        card: styles.folderCard!,
        trigger: styles.folderTab!,
        panel: styles.folderSheet!,
        echo: 'folder-echo'
      }}
      initialTabOrder={[...props.items].sort((a, b) => a.left - b.left).map((item) => item.id)}
      cardClass={(item) => (item.dark ? styles.isDark! : '')}
      cardStyle={(item) => ({ '--folder-color': item.color, '--tabs-surface': item.color })}
      getLabel={(item) => `${item.number} ${item.name} ${item.detail}`}
      renderTab={(item) => (
        <>
          <FolderTabShape class={styles.tabShape} aria-hidden="true" />
          <span class={styles.tabNumber}>{item.number}</span>
          <span class={styles.tabLabel}>
            <span class={styles.tabName}>{item.name}</span>
            <span class={styles.tabDetail}>{item.detail}</span>
          </span>
        </>
      )}
      controls={(state) => (
        <div
          class={styles.railControls}
          data-tabs-no-drag=""
          aria-label="Scroll folders"
          inert={!state.collapsed()}
        >
          <button
            aria-label="Scroll folders left"
            disabled={!state.canScrollBack()}
            onClick={() => state.scrollBy(-56)}
          >
            <ArrowRightIcon class={styles.railArrowLeft} aria-hidden="true" />
          </button>
          <button
            aria-label="Scroll folders right"
            disabled={!state.canScrollForward()}
            onClick={() => state.scrollBy(56)}
          >
            <ArrowRightIcon aria-hidden="true" />
          </button>
        </div>
      )}
    />
  );
}
