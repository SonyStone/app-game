import { trackStore } from '@solid-primitives/deep';
import { createEffect, Index, JSXElement, Match, Switch, untrack } from 'solid-js';
import { createStore } from 'solid-js/store';
import { PathCommand, SVGPathParser } from './svg-path-parser';

export function PathInput(props: { value: string; onChange: (value: string) => void }) {
  const [state, setState] = createStore<PathCommand[]>([]);

  createEffect(() => {
    setState(SVGPathParser.parse(props.value));
  });

  createEffect(() => {
    trackStore(state);
    props.onChange(SVGPathParser.serialize(state));
  });

  function NumberInput(props: { value: number; onChange: (value: number) => void }) {
    return (
      <input
        type="number"
        class="w-12 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        value={props.value}
        onInput={(e) => {
          props.onChange(parseFloat(e.currentTarget.value) || 0);
        }}
      />
    );
  }

  return (
    <>
      <div class="flex flex-1 flex-col gap-0.5">
        <input
          type="text"
          class="w-full min-w-24 rounded border px-1.5 py-0.5"
          value={props.value ?? ''}
          onChange={(e) => {
            props.onChange?.(e.target.value);
          }}
        />
        <Index each={state}>
          {(item, index) => (
            <Switch>
              <Match when={item().type === 'M' || item().type === 'm'}>
                <div class="flex flex-nowrap place-items-baseline hover:bg-blue-100">
                  <Button
                    uppercase={item().type === 'M'}
                    onClick={() => {
                      const newType = untrack(item).type === 'M' ? 'm' : 'M';
                      const newCommands = convertPathCommand(state, index, newType);
                      setState(newCommands);
                    }}
                  >
                    {item().type}
                  </Button>
                  x:{' '}
                  <NumberInput
                    value={item().x}
                    onChange={(value) => {
                      setState(index, 'x', value);
                    }}
                  />
                  y:{' '}
                  <NumberInput
                    value={item().y}
                    onChange={(value) => {
                      setState(index, 'y', value);
                    }}
                  />
                </div>
              </Match>
              <Match when={item().type === 'H' || item().type === 'h'}>
                <div class="flex flex-nowrap place-items-baseline hover:bg-blue-100">
                  <Button
                    uppercase={item().type === 'H'}
                    onClick={() => {
                      const newType = untrack(item).type === 'H' ? 'h' : 'H';
                      const newCommands = convertPathCommand(state, index, newType);
                      setState(newCommands);
                    }}
                  >
                    {item().type}
                  </Button>
                  x:{' '}
                  <NumberInput
                    value={item().x}
                    onChange={(value) => {
                      setState(index, 'x', value);
                    }}
                  />
                </div>
              </Match>
              <Match when={item().type === 'V' || item().type === 'v'}>
                <div class="flex flex-nowrap place-items-baseline hover:bg-blue-100">
                  <Button
                    uppercase={item().type === 'V'}
                    onClick={() => {
                      const newType = untrack(item).type === 'V' ? 'v' : 'V';
                      const newCommands = convertPathCommand(state, index, newType);
                      setState(newCommands);
                    }}
                  >
                    {item().type}
                  </Button>
                  y:{' '}
                  <NumberInput
                    value={item().y}
                    onChange={(value) => {
                      setState(index, 'y', value);
                    }}
                  />
                </div>
              </Match>
            </Switch>
          )}
        </Index>
      </div>
    </>
  );
}

function Button(props: { uppercase: boolean; children?: JSXElement; onClick?: () => void }) {
  return (
    <button
      class={[
        'rounded  px-1.5 py-0.5',
        props.uppercase ? 'bg-orange-100 hover:bg-orange-200' : 'bg-purple-100 hover:bg-purple-200'
      ].join(' ')}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function convertPathCommand(commands: PathCommand[], index: number, newType: string): PathCommand[] {
  const newCommands = [...commands];
  const command = commands[index];
  
  // Calculate current position up to this command
  let currentX = 0;
  let currentY = 0;
  
  for (let i = 0; i < index; i++) {
    const cmd = commands[i];
    switch (cmd.type.toUpperCase()) {
      case 'M':
        currentX = cmd.type === 'M' ? cmd.x : currentX + cmd.x;
        currentY = cmd.type === 'M' ? cmd.y : currentY + cmd.y;
        break;
      case 'H':
        currentX = cmd.type === 'H' ? cmd.x : currentX + cmd.x;
        break;
      case 'V':
        currentY = cmd.type === 'V' ? cmd.y : currentY + cmd.y;
        break;
      case 'L':
        currentX = cmd.type === 'L' ? cmd.x : currentX + cmd.x;
        currentY = cmd.type === 'L' ? cmd.y : currentY + cmd.y;
        break;
    }
  }
  
  // Convert the command
  const newCommand = { ...command, type: newType };
  
  if (command.type.toUpperCase() === 'M') {
    if (newType === 'm' && command.type === 'M') {
      // Absolute to relative
      newCommand.x = command.x - currentX;
      newCommand.y = command.y - currentY;
    } else if (newType === 'M' && command.type === 'm') {
      // Relative to absolute
      newCommand.x = currentX + command.x;
      newCommand.y = currentY + command.y;
    }
  } else if (command.type.toUpperCase() === 'H') {
    if (newType === 'h' && command.type === 'H') {
      // Absolute to relative
      newCommand.x = command.x - currentX;
    } else if (newType === 'H' && command.type === 'h') {
      // Relative to absolute
      newCommand.x = currentX + command.x;
    }
  } else if (command.type.toUpperCase() === 'V') {
    if (newType === 'v' && command.type === 'V') {
      // Absolute to relative
      newCommand.y = command.y - currentY;
    } else if (newType === 'V' && command.type === 'v') {
      // Relative to absolute
      newCommand.y = currentY + command.y;
    }
  }
  
  newCommands[index] = newCommand;
  return newCommands;
}