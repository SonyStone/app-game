import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  css: {
    modules: {
      scopeBehaviour: "global"
    }
  },
  server: {
    host: "0.0.0.0"
  }
});
