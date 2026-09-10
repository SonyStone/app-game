import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  css: {
    postcss: {
      plugins: [
        {
          postcssPlugin: 'scope-tailwind-property-defaults',
          Rule(rule) {
            rule.selectors = rule.selectors.map((selector) => {
              if (selector === '*') return ':where(.app-utilities), :where(.app-utilities) *';
              if (/^::?(before|after|backdrop)$/.test(selector)) {
                return `:where(.app-utilities)${selector}, :where(.app-utilities) ${selector}`;
              }
              return selector;
            });
          }
        }
      ]
    }
  },
  plugins: [tailwindcss(), solid()],
  server: {
    port: 4173
  },
  preview: {
    port: 4173
  }
});
