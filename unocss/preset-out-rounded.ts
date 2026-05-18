import type { Rule } from '@unocss/core';
import { symbols } from '@unocss/core';
import type { Theme } from '@unocss/preset-wind4';
import {
  colorCSSGenerator,
  generateThemeVariable,
  h,
  hasParseableColor,
  parseColor,
  themeTracking
} from '@unocss/preset-wind4/utils';

type CSSObject = Record<string, string | number | undefined>;
type OutRoundedTheme = Parameters<typeof parseColor>[1];

type RuleContextLike = {
  theme: OutRoundedTheme;
};

type RuleResult = CSSObject | ReturnType<typeof colorCSSGenerator>;
type OutwardSide = 'b' | 't' | 'l' | 'r';

const OUTWARD_ROUNDED_RADIUS_VAR = '--un-outward-rounded-radius';
const OUTWARD_ROUNDED_RADIUS_VALUE = ` var(${OUTWARD_ROUNDED_RADIUS_VAR}, var(--radius-DEFAULT))`;

const OUTWARD_BORDER_WIDTH_VAR = '--un-outward-border-width';
const OUTWARD_BORDER_WIDTH_VALUE = ` var(${OUTWARD_BORDER_WIDTH_VAR}, 0px)`;

const OUTWARD_BG_COLOR_VAR = '--un-outward-bg-color';
const OUTWARD_BG_COLOR_VALUE = `var(${OUTWARD_BG_COLOR_VAR}, transparent)`;

const OUTWARD_BORDER_COLOR_VAR = '--un-outward-border-color';
const OUTWARD_BORDER_COLOR_VALUE = `var(${OUTWARD_BORDER_COLOR_VAR}, ${OUTWARD_BG_COLOR_VALUE})`;
const OUTWARD_NEGATIVE_BORDER_WIDTH_VALUE = `calc(${OUTWARD_BORDER_WIDTH_VALUE} * -1)`;

const radius = `calc(${OUTWARD_ROUNDED_RADIUS_VALUE} + ${OUTWARD_BORDER_WIDTH_VALUE})`;
const borderWidth = OUTWARD_BORDER_WIDTH_VALUE;
const borderColor = OUTWARD_BORDER_COLOR_VALUE;
const backgroundColor = OUTWARD_BG_COLOR_VALUE;
const size = `calc(${OUTWARD_ROUNDED_RADIUS_VALUE} + ${OUTWARD_BORDER_WIDTH_VALUE})`;

const defaultObject: CSSObject = {
  position: 'absolute',
  'pointer-events': 'none',
  'background-position': 'right top', // Not important for now
  'background-repeat': 'no-repeat',
  'background-size': `${size} ${size}`,
  width: size,
  height: size
};

const outwardHostBaseStyles: CSSObject = {
  position: 'relative',
  'background-color': OUTWARD_BG_COLOR_VALUE,
  'border-color': OUTWARD_BORDER_COLOR_VALUE,
  'border-width': OUTWARD_BORDER_WIDTH_VALUE
};

const outwardHostSideStyles: Record<OutwardSide, CSSObject> = {
  b: {
    'margin-bottom': OUTWARD_NEGATIVE_BORDER_WIDTH_VALUE,
    'border-top-left-radius': OUTWARD_ROUNDED_RADIUS_VALUE,
    'border-top-right-radius': OUTWARD_ROUNDED_RADIUS_VALUE,
    'border-bottom-color': OUTWARD_BG_COLOR_VALUE
  },
  t: {
    'margin-top': OUTWARD_NEGATIVE_BORDER_WIDTH_VALUE,
    'border-bottom-left-radius': OUTWARD_ROUNDED_RADIUS_VALUE,
    'border-bottom-right-radius': OUTWARD_ROUNDED_RADIUS_VALUE,
    'border-top-color': OUTWARD_BG_COLOR_VALUE
  },
  l: {
    'margin-left': OUTWARD_NEGATIVE_BORDER_WIDTH_VALUE,
    'border-top-right-radius': OUTWARD_ROUNDED_RADIUS_VALUE,
    'border-bottom-right-radius': OUTWARD_ROUNDED_RADIUS_VALUE,
    'border-left-color': OUTWARD_BG_COLOR_VALUE
  },
  r: {
    'margin-right': OUTWARD_NEGATIVE_BORDER_WIDTH_VALUE,
    'border-top-left-radius': OUTWARD_ROUNDED_RADIUS_VALUE,
    'border-bottom-left-radius': OUTWARD_ROUNDED_RADIUS_VALUE,
    'border-right-color': OUTWARD_BG_COLOR_VALUE
  }
};

// moving clockwise from top right
const connectedCorners = {
  // top right corner
  '↗': {
    start: {
      'inset-inline-end': `calc(${borderWidth} * -1)`,
      'inset-block-start': `calc(${radius} * -1)`
    },
    // ▢◜
    end: {
      'inset-inline-end': `calc(${radius} * -1)`,
      'inset-block-start': `calc(${borderWidth} * -1)`
    }
  },
  // bottom right corner
  '↘': {
    // ▢◟
    start: {
      'inset-inline-end': `calc(${radius} * -1)`,
      'inset-block-end': `calc(${borderWidth} * -1)`
    },
    // ▢
    // ◝
    end: {
      'inset-inline-end': `calc(${borderWidth} * -1)`,
      'inset-block-end': `calc(${radius} * -1)`
    }
  },
  // bottom left corner
  '↙': {
    // ▢
    // ◜
    start: {
      'inset-inline-start': `calc(${borderWidth} * -1)`,
      'inset-block-end': `calc(${radius} * -1)`
    },
    end: {
      'inset-inline-start': `calc(${radius} * -1)`,
      'inset-block-end': `calc(${borderWidth} * -1)`
    }
  },
  // top left corner
  '↖': {
    start: {
      'inset-inline-start': `calc(${radius} * -1)`,
      'inset-block-start': `calc(${borderWidth} * -1)`
    },
    end: {
      'inset-inline-start': `calc(${borderWidth} * -1)`,
      'inset-block-start': `calc(${radius} * -1)`
    }
  }
};

const gradientPositions = {
  '◞': `0 0`,
  '◟': `${radius} 0`,
  '◜': `${radius} ${radius}`,
  '◝': `0 ${radius}`
};

const background = (position: '◞' | '◟' | '◜' | '◝') => ({
  background:
    `radial-gradient(` +
    `${radius} at ${gradientPositions[position]}, ` +
    `transparent calc(98% - ${borderWidth}), ` +
    `${borderColor} calc(100% - ${borderWidth}) 98%, ` +
    `${backgroundColor}` +
    `)`
});

export function presetOutRounded() {
  return {
    name: 'preset-out-rounded',
    rules: [...outRoundedRules]
  };
}

// Round-Out
// outward-side-<size> // rounded size
// outward-bg-<color>
// outward-border-<width>
// outward-border-<color>
const outward = {
  b: function* () {
    yield {
      ...outwardHostBaseStyles,
      ...outwardHostSideStyles.b
    };
    yield {
      [symbols.selector]: (s: string) => `${s}::before`,
      content: ' "" ',
      ...defaultObject,
      ...background('◞'),
      ...connectedCorners['↙'].end
    };
    yield {
      [symbols.selector]: (s: string) => `${s}::after`,
      content: ' "" ',
      ...defaultObject,
      ...background('◟'),
      ...connectedCorners['↘'].start
    };
  },
  t: function* () {
    yield {
      ...outwardHostBaseStyles,
      ...outwardHostSideStyles.t
    };
    yield {
      [symbols.selector]: (s: string) => `${s}::before`,
      content: ' "" ',
      ...defaultObject,
      ...background('◝'),
      ...connectedCorners['↖'].start
    };
    yield {
      [symbols.selector]: (s: string) => `${s}::after`,
      content: ' "" ',
      ...defaultObject,
      ...background('◜'),
      ...connectedCorners['↗'].end
    };
  },
  l: function* () {
    yield {
      ...outwardHostBaseStyles,
      ...outwardHostSideStyles.l
    };
    yield {
      [symbols.selector]: (s: string) => `${s}::before`,
      content: ' "" ',
      ...defaultObject,
      ...background('◟'),
      ...connectedCorners['↖'].end
    };
    yield {
      [symbols.selector]: (s: string) => `${s}::after`,
      content: ' "" ',
      ...defaultObject,
      ...background('◜'),
      ...connectedCorners['↙'].start
    };
  },
  r: function* () {
    yield {
      ...outwardHostBaseStyles,
      ...outwardHostSideStyles.r
    };
    yield {
      [symbols.selector]: (s: string) => `${s}::before`,
      content: ' "" ',
      ...defaultObject,
      ...background('◞'),
      ...connectedCorners['↗'].start
    };
    yield {
      [symbols.selector]: (s: string) => `${s}::after`,
      content: ' "" ',
      ...defaultObject,
      ...background('◝'),
      ...connectedCorners['↘'].end
    };
  }
} as const;

const outRoundedRules: Rule<Theme>[] = [
  [/^outward-([rltb])(?:-(.+))?$/, handlerOutwardPlacement],

  [/^outward-border-(?:width|size)-(.+)$/, handlerOutwardBorderWidth],
  [/^outward-border-(.+)$/, handlerOutwardBorderColorOrWidth],

  [/^outward-bg-(.+)$/, handlerOutwardBackgroundColor]
] satisfies Array<[RegExp, (match: string[], ctx: RuleContextLike) => RuleResult | Generator<RuleResult>]>;

function* handlerOutwardPlacement(
  [, side = '', value = 'DEFAULT']: string[],
  { theme }: RuleContextLike
): Generator<CSSObject> {
  if (!isOutwardSide(side)) {
    return undefined;
  }

  const rounded = resolveRounded(value, theme);
  if (!rounded) {
    return undefined;
  }

  yield {
    [OUTWARD_ROUNDED_RADIUS_VAR]: rounded
  };

  yield* outward[side]();
}

function handlerOutwardBorderWidth([, value]: string[], { theme }: RuleContextLike): RuleResult {
  const borderWidth = h.bracket.cssvar.global.px(value, theme);
  if (borderWidth == null) {
    return undefined;
  }

  return {
    [OUTWARD_BORDER_WIDTH_VAR]: borderWidth
  };
}

function handlerOutwardBorderColorOrWidth([, value]: string[], ctx: RuleContextLike): RuleResult {
  if (hasParseableColor(value, ctx.theme)) {
    return colorCSSGenerator(
      parseColor(value, ctx.theme),
      OUTWARD_BORDER_COLOR_VAR,
      'outward-border',
      ctx as Parameters<typeof colorCSSGenerator>[3]
    );
  }

  return handlerOutwardBorderWidth(['', value], ctx);
}

function handlerOutwardBackgroundColor([, value]: string[], ctx: RuleContextLike): RuleResult {
  if (!hasParseableColor(value, ctx.theme)) {
    return undefined;
  }

  return colorCSSGenerator(
    parseColor(value, ctx.theme),
    OUTWARD_BG_COLOR_VAR,
    'outward-bg',
    ctx as Parameters<typeof colorCSSGenerator>[3]
  );
}

function resolveRounded(value: string, theme: OutRoundedTheme): string | undefined {
  if (value === 'DEFAULT') {
    return generateThemeVariable('radius', 'DEFAULT');
  }

  if (value === 'full') {
    return 'calc(infinity * 1px)';
  }

  const resolvedRadius = theme.radius?.[value] ?? h.bracket.cssvar.global.fraction.rem(value, theme);
  if (resolvedRadius == null) {
    return undefined;
  }

  const isThemeRadius = !!theme.radius && value in theme.radius;
  if (isThemeRadius) {
    themeTracking('radius', value);
  }

  return isThemeRadius ? generateThemeVariable('radius', value) : resolvedRadius;
}

function isOutwardSide(value: string): value is OutwardSide {
  return value === 'b' || value === 't' || value === 'l' || value === 'r';
}
