import type { JSX } from '@solidjs/web';
import {
  createContext,
  createMemo,
  createSignal,
  createTrackedEffect,
  For,
  onCleanup,
  useContext,
  type Accessor,
  type Component,
  type ParentComponent
} from 'solid-js';
import type { DemoId } from './types';

export type RegisterExampleControls = (id: DemoId, controls?: JSX.Element) => void;

const ExampleControlsRegisterContext = createContext<RegisterExampleControls>();
const ExampleControlsSelectedContext = createContext<Accessor<readonly JSX.Element[]>>();

export const ExampleControlsProvider: ParentComponent<{
  selectedIds: Accessor<readonly DemoId[]>;
}> = (props) => {
  const [controls, setControls] = createSignal<Partial<Record<DemoId, JSX.Element>>>({});

  const register = (id: DemoId, control?: JSX.Element) => {
    setControls((current) => {
      if (!control) {
        const next = { ...current };
        delete next[id];
        return next;
      }

      return {
        ...current,
        [id]: control
      };
    });
  };

  const selectedControls = createMemo(() => {
    const current = controls();

    return props
      .selectedIds()
      .map((id) => current[id])
      .filter((control): control is JSX.Element => control !== undefined);
  });

  return (
    <ExampleControlsRegisterContext value={register}>
      <ExampleControlsSelectedContext value={selectedControls}>{props.children}</ExampleControlsSelectedContext>
    </ExampleControlsRegisterContext>
  );
};

export const ExampleControlsPortal: ParentComponent<{ id: DemoId }> = (props) => {
  const register = useContext(ExampleControlsRegisterContext);

  if (!register) {
    throw new Error('Example controls must be used within the playground.');
  }

  createTrackedEffect(() => {
    register(props.id, props.children);
  });

  onCleanup(() => {
    register(props.id);
  });

  return null;
};

export const ExampleControlsMount: Component = () => {
  const selectedControls = useContext(ExampleControlsSelectedContext);

  if (!selectedControls) {
    throw new Error('Example controls mount must be used within the playground.');
  }

  return <For each={selectedControls()}>{(controls) => controls}</For>;
};
