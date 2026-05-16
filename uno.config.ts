import presetWebFonts from '@unocss/preset-web-fonts';
import presetWind4 from '@unocss/preset-wind4';
import {
  colorCSSGenerator,
  cornerMap,
  generateThemeVariable,
  h,
  hasParseableColor,
  parseColor,
  themeTracking
} from '@unocss/preset-wind4/utils';
import transformerCompileClass from '@unocss/transformer-compile-class';
import transformerVariantGroup from '@unocss/transformer-variant-group';
import { defineConfig } from '@unocss/vite';
import { presetAnimations } from 'unocss-preset-animations';

type CSSObject = Record<string, string | number | undefined>;
type OutRoundedTheme = Parameters<typeof parseColor>[1];

type RuleContextLike = {
  theme: OutRoundedTheme;
};

type RuleResult = CSSObject | ReturnType<typeof colorCSSGenerator>;

type OutRoundedCorner =
  | '-top-left'
  | '-top-right'
  | '-bottom-left'
  | '-bottom-right'
  | '-start-start'
  | '-start-end'
  | '-end-start'
  | '-end-end';

type OutRoundedCornerMeta = {
  gradientPosition: string;
  tilePosition: string;
  inlineEdge: string;
  blockEdge: string;
};

const OUT_ROUNDED_RADIUS_VAR = '--un-out-rounded-radius';
const OUT_ROUNDED_BORDER_WIDTH_VAR = '--un-out-rounded-border-width';
const OUT_ROUNDED_RADIUS_VALUE = `var(${OUT_ROUNDED_RADIUS_VAR}, var(--radius-DEFAULT, 8px))`;
const OUT_ROUNDED_BORDER_WIDTH_VALUE = `var(${OUT_ROUNDED_BORDER_WIDTH_VAR}, 1px)`;

const outRoundedCornerMeta: Record<OutRoundedCorner, OutRoundedCornerMeta> = {
  '-top-left': {
    gradientPosition: `0 var(${OUT_ROUNDED_RADIUS_VAR})`,
    tilePosition: 'left top',
    inlineEdge: 'left',
    blockEdge: 'top'
  },
  '-top-right': {
    gradientPosition: `var(${OUT_ROUNDED_RADIUS_VAR}) var(${OUT_ROUNDED_RADIUS_VAR})`,
    tilePosition: 'right top',
    inlineEdge: 'right',
    blockEdge: 'top'
  },
  '-bottom-left': {
    gradientPosition: '0 0',
    tilePosition: 'left bottom',
    inlineEdge: 'left',
    blockEdge: 'bottom'
  },
  '-bottom-right': {
    gradientPosition: `var(${OUT_ROUNDED_RADIUS_VAR}) 0`,
    tilePosition: 'right bottom',
    inlineEdge: 'right',
    blockEdge: 'bottom'
  },
  '-start-start': {
    gradientPosition: `0 var(${OUT_ROUNDED_RADIUS_VAR})`,
    tilePosition: 'left top',
    inlineEdge: 'inset-inline-start',
    blockEdge: 'inset-block-start'
  },
  '-start-end': {
    gradientPosition: `var(${OUT_ROUNDED_RADIUS_VAR}) var(${OUT_ROUNDED_RADIUS_VAR})`,
    tilePosition: 'right top',
    inlineEdge: 'inset-inline-end',
    blockEdge: 'inset-block-start'
  },
  '-end-start': {
    gradientPosition: '0 0',
    tilePosition: 'left bottom',
    inlineEdge: 'inset-inline-start',
    blockEdge: 'inset-block-end'
  },
  '-end-end': {
    gradientPosition: `var(${OUT_ROUNDED_RADIUS_VAR}) 0`,
    tilePosition: 'right bottom',
    inlineEdge: 'inset-inline-end',
    blockEdge: 'inset-block-end'
  }
};

const outRoundedRules = [
  [/^out()$/, handlerOutPlacement],
  [/^out-([rltbse])$/, handlerOutPlacement],
  [/^out-([rltb]{2})$/, handlerOutPlacement],
  [/^out-([bise][se])$/, handlerOutPlacement],
  [/^out-([bi][se]-[bi][se])$/, handlerOutPlacement],

  [/^(?:out-rounded|out-rd)(?:-(.+))?$/, handlerOutRoundedRadius],

  [/^(?:out-border|out-b)-(?:width|size)-(.+)$/, handlerOutRoundedBorderWidth],
  [/^(?:out-border|out-b)-(.+)$/, handlerOutRoundedBorderColorOrWidth],

  [/^out-bg-(.+)$/, handlerOutRoundedBackgroundColor]
] satisfies Array<[RegExp, (match: string[], ctx: RuleContextLike) => RuleResult]>;

function handlerOutPlacement([, side = '']: string[]): RuleResult {
  const corners = resolveOutRoundedCorners(side);
  if (!corners) {
    return undefined;
  }

  return getOutRoundedPlacement(corners);
}

function handlerOutRoundedRadius([, value = 'DEFAULT']: string[], { theme }: RuleContextLike): RuleResult {
  const radius = resolveOutRoundedRadius(value, theme);
  if (!radius) {
    return undefined;
  }

  return {
    [OUT_ROUNDED_RADIUS_VAR]: radius
  };
}

function handlerOutRoundedBorderWidth([, value]: string[], { theme }: RuleContextLike): RuleResult {
  const borderWidth = h.bracket.cssvar.global.px(value, theme);
  if (borderWidth == null) {
    return undefined;
  }

  return {
    [OUT_ROUNDED_BORDER_WIDTH_VAR]: borderWidth
  };
}

function handlerOutRoundedBorderColorOrWidth([, value]: string[], ctx: RuleContextLike): RuleResult {
  if (hasParseableColor(value, ctx.theme)) {
    return colorCSSGenerator(
      parseColor(value, ctx.theme),
      '--out-border-color',
      'out-border',
      ctx as Parameters<typeof colorCSSGenerator>[3]
    );
  }

  return handlerOutRoundedBorderWidth(['', value], ctx);
}

function handlerOutRoundedBackgroundColor([, value]: string[], ctx: RuleContextLike): RuleResult {
  if (!hasParseableColor(value, ctx.theme)) {
    return undefined;
  }

  return colorCSSGenerator(
    parseColor(value, ctx.theme),
    '--out-border-bg-color',
    'out-bg',
    ctx as Parameters<typeof colorCSSGenerator>[3]
  );
}

function resolveOutRoundedCorners(side: string): OutRoundedCorner[] | undefined {
  if (side === '') {
    return ['-bottom-right'];
  }

  const corners = cornerMap[side as keyof typeof cornerMap];
  if (!corners) {
    return undefined;
  }

  const supportedCorners = corners.filter(isOutRoundedCorner);
  return supportedCorners.length > 0 ? supportedCorners : undefined;
}

function isOutRoundedCorner(value: string): value is OutRoundedCorner {
  return value in outRoundedCornerMeta;
}

function getOutRoundedPlacement(corners: OutRoundedCorner[]): CSSObject {
  const [firstCorner, secondCorner] = corners;
  const firstMeta = outRoundedCornerMeta[firstCorner];

  const styles: CSSObject = {
    position: 'absolute',
    'pointer-events': 'none',
    background: corners.map(getOutRoundedGradient).join(', '),
    'background-position': corners.map((corner) => outRoundedCornerMeta[corner].tilePosition).join(', '),
    'background-repeat': 'no-repeat',
    'background-size': corners.map(() => `${OUT_ROUNDED_RADIUS_VALUE} ${OUT_ROUNDED_RADIUS_VALUE}`).join(', ')
  };

  if (!secondCorner) {
    styles.width = OUT_ROUNDED_RADIUS_VALUE;
    styles.height = OUT_ROUNDED_RADIUS_VALUE;
    styles[firstMeta.inlineEdge] = `calc(${OUT_ROUNDED_RADIUS_VALUE} * -1)`;
    styles[firstMeta.blockEdge] = `calc(${OUT_ROUNDED_BORDER_WIDTH_VALUE} * -1)`;
    return styles;
  }

  const secondMeta = outRoundedCornerMeta[secondCorner];
  if (firstMeta.inlineEdge === secondMeta.inlineEdge) {
    styles.width = OUT_ROUNDED_RADIUS_VALUE;
    styles[firstMeta.inlineEdge] = `calc(${OUT_ROUNDED_RADIUS_VALUE} * -1)`;
    styles[firstMeta.blockEdge] = `calc(${OUT_ROUNDED_BORDER_WIDTH_VALUE} * -1)`;
    styles[secondMeta.blockEdge] = `calc(${OUT_ROUNDED_BORDER_WIDTH_VALUE} * -1)`;
    return styles;
  }

  styles.height = OUT_ROUNDED_RADIUS_VALUE;
  styles[firstMeta.blockEdge] = `calc(${OUT_ROUNDED_BORDER_WIDTH_VALUE} * -1)`;
  styles[firstMeta.inlineEdge] = `calc(${OUT_ROUNDED_RADIUS_VALUE} * -1)`;
  styles[secondMeta.inlineEdge] = `calc(${OUT_ROUNDED_RADIUS_VALUE} * -1)`;
  return styles;
}

function getOutRoundedGradient(corner: OutRoundedCorner): string {
  return `radial-gradient(${OUT_ROUNDED_RADIUS_VALUE} at ${outRoundedCornerMeta[corner].gradientPosition}, transparent calc(98% - ${OUT_ROUNDED_BORDER_WIDTH_VALUE}), var(--out-border-color, transparent) calc(100% - ${OUT_ROUNDED_BORDER_WIDTH_VALUE}) 98%, var(--out-border-bg-color, transparent))`;
}

function resolveOutRoundedRadius(value: string, theme: OutRoundedTheme): string | undefined {
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

export default defineConfig({
  presets: [
    presetWind4(),
    presetWebFonts({
      provider: 'google',
      fonts: {
        geist: ['Geist', { name: 'sans-serif', provider: 'none' }]
      }
    }) as unknown as ReturnType<typeof presetWind4>,
    presetAnimations() as unknown as ReturnType<typeof presetWind4>
  ],
  rules: [...outRoundedRules],
  transformers: [transformerCompileClass(), transformerVariantGroup()],
  theme: {
    colors: {
      'ps-bg-dark': 'var(--color-ps-bg-dark)',
      'ps-bg': 'var(--color-ps-bg)',
      'ps-bg-light': 'var(--color-ps-bg-light)',
      'ps-bg-lighter': 'var(--color-ps-bg-lighter)',
      'ps-text': 'var(--color-ps-text)',
      'ps-text-bright': 'var(--color-ps-text-bright)',
      'ps-text-muted': 'var(--color-ps-text-muted)',
      'ps-border': 'var(--color-ps-border)',
      'ps-border-light': 'var(--color-ps-border-light)',
      'ps-accent': 'var(--color-ps-accent)',
      'ps-accent-hover': 'var(--color-ps-accent-hover)',
      'ps-warning': 'var(--color-ps-warning)',
      'ps-error': 'var(--color-ps-error)',
      'ps-success': 'var(--color-ps-success)',
      border: 'hsl(var(--border))',
      input: 'hsl(var(--input))',
      ring: 'hsl(var(--ring))',
      background: 'hsl(var(--background))',
      foreground: 'hsl(var(--foreground))',
      primary: {
        DEFAULT: 'hsl(var(--primary))',
        foreground: 'hsl(var(--primary-foreground))'
      },
      secondary: {
        DEFAULT: 'hsl(var(--secondary))',
        foreground: 'hsl(var(--secondary-foreground))'
      },
      destructive: {
        DEFAULT: 'hsl(var(--destructive))',
        foreground: 'hsl(var(--destructive-foreground))'
      },
      muted: {
        DEFAULT: 'hsl(var(--muted))',
        foreground: 'hsl(var(--muted-foreground))'
      },
      accent: {
        DEFAULT: 'hsl(var(--accent))',
        foreground: 'hsl(var(--accent-foreground))'
      },
      popover: {
        DEFAULT: 'hsl(var(--popover))',
        foreground: 'hsl(var(--popover-foreground))'
      },
      card: {
        DEFAULT: 'hsl(var(--card))',
        foreground: 'hsl(var(--card-foreground))'
      }
    },
    radius: {
      lg: `var(--radius)`,
      md: `calc(var(--radius) - 2px)`,
      sm: 'calc(var(--radius) - 4px)'
    },
    animation: {
      keyframes: {
        'accordion-down': '{ from { height: 0 } to { height: var(--kb-accordion-content-height) } }',
        'accordion-up': '{ from { height: var(--kb-accordion-content-height) } to { height: 0 } }',
        'collapsible-down': '{ from { height: 0 } to { height: var(--kb-collapsible-content-height) } }',
        'collapsible-up': '{ from { height: var(--kb-collapsible-content-height) } to { height: 0 } }'
      },
      timingFns: {
        'accordion-down': 'ease-out',
        'accordion-up': 'ease-out',
        'collapsible-down': 'ease-out',
        'collapsible-up': 'ease-out'
      },
      durations: {
        'accordion-down': '0.2s',
        'accordion-up': '0.2s',
        'collapsible-down': '0.2s',
        'collapsible-up': '0.2s'
      }
    }
  }
});
