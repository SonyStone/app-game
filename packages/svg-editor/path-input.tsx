import { trackStore } from '@solid-primitives/deep';
import { createEffect, Index, JSXElement, Match, Switch, untrack } from 'solid-js';
import { createStore } from 'solid-js/store';
import { PathCommand, SVGPathParser } from './svg-path-parser';

type MoveCommand = Extract<PathCommand, { type: 'M' | 'm' }>;
type HorizontalCommand = Extract<PathCommand, { type: 'H' | 'h' }>;
type VerticalCommand = Extract<PathCommand, { type: 'V' | 'v' }>;

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
                  {(() => {
                    const command = item() as MoveCommand;

                    return (
                      <>
                  <Button
                    uppercase={command.type === 'M'}
                    onClick={() => {
                      const newType = untrack(item).type === 'M' ? 'm' : 'M';
                      const newCommands = convertPathCommand(state, index, newType);
                      setState(newCommands);
                    }}
                  >
                    {command.type}
                  </Button>
                  x:{' '}
                  <NumberInput
                    value={command.x}
                    onChange={(value) => {
                      setState(updateCommand(state, index, (current) =>
                        isMoveCommand(current) ? { ...current, x: value } : current
                      ));
                    }}
                  />
                  y:{' '}
                  <NumberInput
                    value={command.y}
                    onChange={(value) => {
                      setState(updateCommand(state, index, (current) =>
                        isMoveCommand(current) ? { ...current, y: value } : current
                      ));
                    }}
                  />
                      </>
                    );
                  })()}
                </div>
              </Match>
              <Match when={item().type === 'H' || item().type === 'h'}>
                <div class="flex flex-nowrap place-items-baseline hover:bg-blue-100">
                  {(() => {
                    const command = item() as HorizontalCommand;

                    return (
                      <>
                  <Button
                    uppercase={command.type === 'H'}
                    onClick={() => {
                      const newType = untrack(item).type === 'H' ? 'h' : 'H';
                      const newCommands = convertPathCommand(state, index, newType);
                      setState(newCommands);
                    }}
                  >
                    {command.type}
                  </Button>
                  x:{' '}
                  <NumberInput
                    value={command.x}
                    onChange={(value) => {
                      setState(updateCommand(state, index, (current) =>
                        isHorizontalCommand(current) ? { ...current, x: value } : current
                      ));
                    }}
                  />
                      </>
                    );
                  })()}
                </div>
              </Match>
              <Match when={item().type === 'V' || item().type === 'v'}>
                <div class="flex flex-nowrap place-items-baseline hover:bg-blue-100">
                  {(() => {
                    const command = item() as VerticalCommand;

                    return (
                      <>
                  <Button
                    uppercase={command.type === 'V'}
                    onClick={() => {
                      const newType = untrack(item).type === 'V' ? 'v' : 'V';
                      const newCommands = convertPathCommand(state, index, newType);
                      setState(newCommands);
                    }}
                  >
                    {command.type}
                  </Button>
                  y:{' '}
                  <NumberInput
                    value={command.y}
                    onChange={(value) => {
                      setState(updateCommand(state, index, (current) =>
                        isVerticalCommand(current) ? { ...current, y: value } : current
                      ));
                    }}
                  />
                      </>
                    );
                  })()}
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

function isMoveCommand(command: PathCommand): command is MoveCommand {
  return command.type === 'M' || command.type === 'm';
}

function isHorizontalCommand(command: PathCommand): command is HorizontalCommand {
  return command.type === 'H' || command.type === 'h';
}

function isVerticalCommand(command: PathCommand): command is VerticalCommand {
  return command.type === 'V' || command.type === 'v';
}

function updateCommand(
  commands: PathCommand[],
  index: number,
  update: (command: PathCommand) => PathCommand
): PathCommand[] {
  const nextCommands = [...commands];
  nextCommands[index] = update(commands[index]);
  return nextCommands;
}

function convertPathCommand(commands: PathCommand[], index: number, newType: PathCommand['type']): PathCommand[] {
  const newCommands = [...commands];
  const command = commands[index];

  // Calculate current position up to this command
  let currentX = 0;
  let currentY = 0;

  for (let i = 0; i < index; i++) {
    const cmd = commands[i];
    switch (cmd.type.toUpperCase()) {
      case 'M':
        if (isMoveCommand(cmd)) {
          currentX = cmd.type === 'M' ? cmd.x : currentX + cmd.x;
          currentY = cmd.type === 'M' ? cmd.y : currentY + cmd.y;
        }
        break;
      case 'H':
        if (isHorizontalCommand(cmd)) {
          currentX = cmd.type === 'H' ? cmd.x : currentX + cmd.x;
        }
        break;
      case 'V':
        if (isVerticalCommand(cmd)) {
          currentY = cmd.type === 'V' ? cmd.y : currentY + cmd.y;
        }
        break;
      case 'L':
        if ('x' in cmd && 'y' in cmd) {
          currentX = cmd.type === 'L' ? cmd.x : currentX + cmd.x;
          currentY = cmd.type === 'L' ? cmd.y : currentY + cmd.y;
        }
        break;
    }
  }

  // Convert the command
  let newCommand: PathCommand = command;

  if (isMoveCommand(command) && (newType === 'M' || newType === 'm')) {
    if (newType === 'm' && command.type === 'M') {
      newCommand = { ...command, type: newType, x: command.x - currentX, y: command.y - currentY };
    } else if (newType === 'M' && command.type === 'm') {
      newCommand = { ...command, type: newType, x: currentX + command.x, y: currentY + command.y };
    } else {
      newCommand = { ...command, type: newType };
    }
  } else if (isHorizontalCommand(command) && (newType === 'H' || newType === 'h')) {
    if (newType === 'h' && command.type === 'H') {
      newCommand = { ...command, type: newType, x: command.x - currentX };
    } else if (newType === 'H' && command.type === 'h') {
      newCommand = { ...command, type: newType, x: currentX + command.x };
    } else {
      newCommand = { ...command, type: newType };
    }
  } else if (isVerticalCommand(command) && (newType === 'V' || newType === 'v')) {
    if (newType === 'v' && command.type === 'V') {
      newCommand = { ...command, type: newType, y: command.y - currentY };
    } else if (newType === 'V' && command.type === 'v') {
      newCommand = { ...command, type: newType, y: currentY + command.y };
    } else {
      newCommand = { ...command, type: newType };
    }
  }

  newCommands[index] = newCommand;
  return newCommands;
}
