// Types for path commands
export type PathCommand =
  | { type: 'M' | 'm'; x: number; y: number }
  | { type: 'L' | 'l'; x: number; y: number }
  | { type: 'H' | 'h'; x: number }
  | { type: 'V' | 'v'; y: number }
  | { type: 'C' | 'c'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'S' | 's'; x2: number; y2: number; x: number; y: number }
  | { type: 'Q' | 'q'; x1: number; y1: number; x: number; y: number }
  | { type: 'T' | 't'; x: number; y: number }
  | {
      type: 'A' | 'a';
      rx: number;
      ry: number;
      xAxisRotation: number;
      largeArcFlag: number;
      sweepFlag: number;
      x: number;
      y: number;
    }
  | { type: 'Z' | 'z' };

export class SVGPathParser {
  private static readonly COMMAND_REGEX = /[MmLlHhVvCcSsQqTtAaZz]/g;
  private static readonly NUMBER_REGEX = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

  static parse(pathString: string): PathCommand[] {
    if (!pathString || typeof pathString !== 'string') {
      return [];
    }

    const commands: PathCommand[] = [];
    const normalizedPath = pathString.trim().replace(/,/g, ' ');

    // Split by commands while keeping the command characters
    const segments = normalizedPath.split(this.COMMAND_REGEX).filter(Boolean);
    const commandChars = normalizedPath.match(this.COMMAND_REGEX) || [];

    for (let i = 0; i < commandChars.length; i++) {
      const command = commandChars[i] as string;
      const params = segments[i] ? this.parseNumbers(segments[i]) : [];

      const parsedCommands = this.parseCommand(command, params);
      commands.push(...parsedCommands);
    }

    return commands;
  }

  static serialize(commands: PathCommand[]): string {
    return commands.map((cmd) => this.commandToString(cmd)).join(' ');
  }

  private static parseNumbers(str: string): number[] {
    const matches = str.match(this.NUMBER_REGEX);
    return matches ? matches.map(Number) : [];
  }

  private static parseCommand(command: string, params: number[]): PathCommand[] {
    const commands: PathCommand[] = [];

    switch (command.toUpperCase()) {
      case 'M': // MoveTo
        for (let i = 0; i < params.length; i += 2) {
          if (i + 1 < params.length) {
            commands.push({
              type: command as 'M' | 'm',
              x: params[i],
              y: params[i + 1]
            });
          }
        }
        break;

      case 'L': // LineTo
        for (let i = 0; i < params.length; i += 2) {
          if (i + 1 < params.length) {
            commands.push({
              type: command as 'L' | 'l',
              x: params[i],
              y: params[i + 1]
            });
          }
        }
        break;

      case 'H': // Horizontal LineTo
        for (let i = 0; i < params.length; i++) {
          commands.push({
            type: command as 'H' | 'h',
            x: params[i]
          });
        }
        break;

      case 'V': // Vertical LineTo
        for (let i = 0; i < params.length; i++) {
          commands.push({
            type: command as 'V' | 'v',
            y: params[i]
          });
        }
        break;

      case 'C': // Cubic Bezier
        for (let i = 0; i < params.length; i += 6) {
          if (i + 5 < params.length) {
            commands.push({
              type: command as 'C' | 'c',
              x1: params[i],
              y1: params[i + 1],
              x2: params[i + 2],
              y2: params[i + 3],
              x: params[i + 4],
              y: params[i + 5]
            });
          }
        }
        break;

      case 'S': // Smooth Cubic Bezier
        for (let i = 0; i < params.length; i += 4) {
          if (i + 3 < params.length) {
            commands.push({
              type: command as 'S' | 's',
              x2: params[i],
              y2: params[i + 1],
              x: params[i + 2],
              y: params[i + 3]
            });
          }
        }
        break;

      case 'Q': // Quadratic Bezier
        for (let i = 0; i < params.length; i += 4) {
          if (i + 3 < params.length) {
            commands.push({
              type: command as 'Q' | 'q',
              x1: params[i],
              y1: params[i + 1],
              x: params[i + 2],
              y: params[i + 3]
            });
          }
        }
        break;

      case 'T': // Smooth Quadratic Bezier
        for (let i = 0; i < params.length; i += 2) {
          if (i + 1 < params.length) {
            commands.push({
              type: command as 'T' | 't',
              x: params[i],
              y: params[i + 1]
            });
          }
        }
        break;

      case 'A': // Arc
        for (let i = 0; i < params.length; i += 7) {
          if (i + 6 < params.length) {
            commands.push({
              type: command as 'A' | 'a',
              rx: params[i],
              ry: params[i + 1],
              xAxisRotation: params[i + 2],
              largeArcFlag: params[i + 3],
              sweepFlag: params[i + 4],
              x: params[i + 5],
              y: params[i + 6]
            });
          }
        }
        break;

      case 'Z': // ClosePath
        commands.push({ type: command as 'Z' | 'z' });
        break;
    }

    return commands;
  }

  private static commandToString(cmd: PathCommand): string {
    switch (cmd.type) {
      case 'M':
      case 'm':
        return `${cmd.type} ${cmd.x} ${cmd.y}`;

      case 'L':
      case 'l':
        return `${cmd.type} ${cmd.x} ${cmd.y}`;

      case 'H':
      case 'h':
        return `${cmd.type} ${cmd.x}`;

      case 'V':
      case 'v':
        return `${cmd.type} ${cmd.y}`;

      case 'C':
      case 'c':
        return `${cmd.type} ${cmd.x1} ${cmd.y1} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y}`;

      case 'S':
      case 's':
        return `${cmd.type} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y}`;

      case 'Q':
      case 'q':
        return `${cmd.type} ${cmd.x1} ${cmd.y1} ${cmd.x} ${cmd.y}`;

      case 'T':
      case 't':
        return `${cmd.type} ${cmd.x} ${cmd.y}`;

      case 'A':
      case 'a':
        return `${cmd.type} ${cmd.rx} ${cmd.ry} ${cmd.xAxisRotation} ${cmd.largeArcFlag} ${cmd.sweepFlag} ${cmd.x} ${cmd.y}`;

      case 'Z':
      case 'z':
        return cmd.type;

      default:
        return '';
    }
  }

  // Utility methods
  static getCommandCount(commands: PathCommand[]): Record<string, number> {
    const counts: Record<string, number> = {};
    commands.forEach((cmd) => {
      counts[cmd.type] = (counts[cmd.type] || 0) + 1;
    });
    return counts;
  }

  static getBounds(commands: PathCommand[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (commands.length === 0) return null;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    let currentX = 0,
      currentY = 0;

    commands.forEach((cmd) => {
      switch (cmd.type) {
        case 'M':
          currentX = cmd.x;
          currentY = cmd.y;
          break;
        case 'm':
          currentX += cmd.x;
          currentY += cmd.y;
          break;
        case 'L':
          currentX = cmd.x;
          currentY = cmd.y;
          break;
        case 'l':
          currentX += cmd.x;
          currentY += cmd.y;
          break;
        case 'H':
          currentX = cmd.x;
          break;
        case 'h':
          currentX += cmd.x;
          break;
        case 'V':
          currentY = cmd.y;
          break;
        case 'v':
          currentY += cmd.y;
          break;
        // Add other commands as needed
      }

      minX = Math.min(minX, currentX);
      minY = Math.min(minY, currentY);
      maxX = Math.max(maxX, currentX);
      maxY = Math.max(maxY, currentY);
    });

    return { minX, minY, maxX, maxY };
  }
}
