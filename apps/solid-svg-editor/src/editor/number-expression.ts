/**
 * Evaluates what a user types into a number field, like GodSVG's `NumstringParser.evaluate`: plain numbers and
 * arithmetic such as `-2.2 + 4`, `10 * 3 / 2`, `2 ** 3`, `(1 + 2) % 2`, functions such as `sqrt(2)` or `max(1, 4)`,
 * and the constants `pi`, `tau`, `e`, `phi` (also capitalized). A comma works as the decimal separator when the text
 * has no other meaning for it. Returns `NaN` for anything else; no code is ever executed.
 */
export function evaluateNumberExpression(text: string): number {
  const value = evaluate(text);

  if (!Number.isNaN(value) || !text.includes(',')) {
    return value;
  }

  return evaluate(text.replace(/,/g, '.'));
}

function evaluate(text: string): number {
  const tokens = tokenize(text);

  if (!tokens) {
    return Number.NaN;
  }

  const parser = createParser(tokens);
  const value = parser.expression();
  return parser.done() && Number.isFinite(value) ? value : Number.NaN;
}

type Token = { readonly kind: 'number'; readonly value: number } | { readonly kind: 'name' | 'symbol'; readonly text: string };

function tokenize(text: string): Token[] | undefined {
  const tokens: Token[] = [];
  const pattern = /\s*(?:(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(\*\*|[-+*/%(),]))/y;
  let position = 0;

  while (position < text.length) {
    if (text.slice(position).trim() === '') {
      break;
    }

    pattern.lastIndex = position;
    const match = pattern.exec(text);

    if (!match) {
      return undefined;
    }

    const [, number, name, symbol] = match;
    tokens.push(
      number !== undefined ? { kind: 'number', value: Number(number) } : name !== undefined ? { kind: 'name', text: name } : { kind: 'symbol', text: symbol ?? '' }
    );
    position = pattern.lastIndex;
  }

  return tokens;
}

/** Precedence climbing: `+ -` < `* / %` < unary signs < `**` (right-associative) < calls and parentheses. */
function createParser(tokens: readonly Token[]) {
  let index = 0;
  const peek = () => tokens[index];
  const isSymbol = (text: string) => {
    const token = peek();
    return token?.kind === 'symbol' && token.text === text;
  };
  const take = (text: string) => {
    if (isSymbol(text)) {
      index += 1;
      return true;
    }

    return false;
  };

  function expression(): number {
    let value = term();

    while (isSymbol('+') || isSymbol('-')) {
      if (take('+')) {
        value += term();
      } else {
        take('-');
        value -= term();
      }
    }

    return value;
  }

  function term(): number {
    let value = unary();

    while (isSymbol('*') || isSymbol('/') || isSymbol('%')) {
      if (take('*')) {
        value *= unary();
      } else if (take('/')) {
        value /= unary();
      } else {
        take('%');
        value %= unary();
      }
    }

    return value;
  }

  function unary(): number {
    if (take('-')) {
      return -unary();
    }

    if (take('+')) {
      return unary();
    }

    return power();
  }

  function power(): number {
    const base = primary();
    return take('**') ? base ** unary() : base;
  }

  function primary(): number {
    const token = peek();

    if (!token) {
      return Number.NaN;
    }

    index += 1;

    if (token.kind === 'number') {
      return token.value;
    }

    if (token.kind === 'symbol') {
      if (token.text !== '(') {
        return Number.NaN;
      }

      const value = expression();
      return take(')') ? value : Number.NaN;
    }

    if (take('(')) {
      const args: number[] = [];

      if (!take(')')) {
        do {
          args.push(expression());
        } while (take(','));

        if (!take(')')) {
          return Number.NaN;
        }
      }

      return callFunction(token.text, args);
    }

    return constants[token.text] ?? Number.NaN;
  }

  return { expression, done: () => index === tokens.length };
}

function callFunction(name: string, args: readonly number[]): number {
  const fn = functions[name];
  return fn && (fn.arity === undefined || fn.arity === args.length) ? fn.apply(args) : Number.NaN;
}

const phi = (1 + Math.sqrt(5)) / 2;

/** GodSVG's `ExpressionScript` constants. */
const constants: Readonly<Record<string, number>> = {
  pi: Math.PI,
  Pi: Math.PI,
  PI: Math.PI,
  tau: Math.PI * 2,
  Tau: Math.PI * 2,
  TAU: Math.PI * 2,
  e: Math.E,
  E: Math.E,
  phi,
  Phi: phi,
  PHI: phi
};

const unaryMath = (apply: (value: number) => number) => ({ arity: 1, apply: ([value = Number.NaN]: readonly number[]) => apply(value) });

/** The math functions of Godot expressions that make sense for numbers in an SVG. */
const functions: Readonly<Record<string, { readonly arity?: number; readonly apply: (args: readonly number[]) => number }>> = {
  sqrt: unaryMath(Math.sqrt),
  abs: unaryMath(Math.abs),
  sin: unaryMath(Math.sin),
  cos: unaryMath(Math.cos),
  tan: unaryMath(Math.tan),
  asin: unaryMath(Math.asin),
  acos: unaryMath(Math.acos),
  atan: unaryMath(Math.atan),
  floor: unaryMath(Math.floor),
  ceil: unaryMath(Math.ceil),
  round: unaryMath(Math.round),
  exp: unaryMath(Math.exp),
  log: unaryMath(Math.log),
  deg_to_rad: unaryMath((degrees) => (degrees * Math.PI) / 180),
  rad_to_deg: unaryMath((radians) => (radians * 180) / Math.PI),
  atan2: { arity: 2, apply: ([y = Number.NaN, x = Number.NaN]) => Math.atan2(y, x) },
  pow: { arity: 2, apply: ([base = Number.NaN, exponent = Number.NaN]) => base ** exponent },
  clamp: { arity: 3, apply: ([value = Number.NaN, min = Number.NaN, max = Number.NaN]) => Math.min(max, Math.max(min, value)) },
  min: { apply: (args) => (args.length > 0 ? Math.min(...args) : Number.NaN) },
  max: { apply: (args) => (args.length > 0 ? Math.max(...args) : Number.NaN) }
};
