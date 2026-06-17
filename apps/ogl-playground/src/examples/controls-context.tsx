import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  useContext,
  type Accessor,
  type Component,
  type JSX,
  type ParentComponent,
} from 'solid-js';
import type { DemoId } from './types';

export type RegisterExampleControls = (
  id: DemoId,
  controls?: JSX.Element,
) => void;

const ExampleControlsRegisterContext = createContext<RegisterExampleControls>();
const ExampleControlsSelectedContext =
  createContext<Accessor<readonly JSX.Element[]>>();

export const ExampleControlsProvider: ParentComponent<{
  selectedIds: Accessor<readonly DemoId[]>;
}> = (props) => {
  const [controls, setControls] = createSignal<
    Partial<Record<DemoId, JSX.Element>>
  >({});

  const register = (id: DemoId, control?: JSX.Element) => {
    setControls((current) => {
      if (!control) {
        const next = { ...current };
        delete next[id];
        return next;
      }

      return {
        ...current,
        [id]: control,
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
    <ExampleControlsRegisterContext.Provider value={register}>
      <ExampleControlsSelectedContext.Provider value={selectedControls}>
        {props.children}
      </ExampleControlsSelectedContext.Provider>
    </ExampleControlsRegisterContext.Provider>
  );
};

export const ExampleControlsPortal: ParentComponent<{ id: DemoId }> = (
  props,
) => {
  const register = useContext(ExampleControlsRegisterContext);

  if (!register) {
    throw new Error('Example controls must be used within the playground.');
  }

  createEffect(() => {
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
    throw new Error(
      'Example controls mount must be used within the playground.',
    );
  }

  return <For each={selectedControls()}>{(controls) => controls}</For>;
};
