import UnoCSS from "@unocss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import solidSvg from "vite-plugin-solid-svg";

export default defineConfig({
  plugins: [
    solid(),
    solidSvg({
      svgo: {
        enabled: true,
        svgoConfig: {
          plugins: [
            {
              name: "preset-default",
              params: {
                overrides: {
                  removeViewBox: false
                }
              }
            }
          ]
        }
      }
    }),
    UnoCSS({
      configFile: fileURLToPath(new URL("../../uno.config.ts", import.meta.url))
    })
  ],
  css: {
    modules: {
      scopeBehaviour: "global"
    }
  },
  server: {
    host: "0.0.0.0"
  }
});
