import presetWebFonts from '@unocss/preset-web-fonts';
import presetWind4 from '@unocss/preset-wind4';
import transformerCompileClass from '@unocss/transformer-compile-class';
import transformerVariantGroup from '@unocss/transformer-variant-group';
import { defineConfig } from '@unocss/vite';
import { presetAnimations } from 'unocss-preset-animations';

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
  rules: [],
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
