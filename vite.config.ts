import { defineConfig } from "vite";
export default defineConfig({
  build: {
    rollupOptions: {
      input: { popup: "popup.html", background: "src/background/index.ts" },
      output: { entryFileNames: "[name].js" },
    },
  },
});
